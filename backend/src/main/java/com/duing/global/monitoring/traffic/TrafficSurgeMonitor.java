package com.duing.global.monitoring.traffic;

import com.duing.global.monitoring.OpsSlackMessageFormatter;
import com.duing.global.monitoring.SlackNotifier;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.function.Supplier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * api 트래픽 이상 감지 — api 를 Cloudflare 없이 직결로 운영하면서 공격·폭증을 알 길이 없어 둔다.
 * 매분 {@link TrafficCountingFilter} 의 요청·429 수를 분당 값으로 바꿔, 어느 한쪽이라도 기준 이상인 집계가
 * {@value #SURGE_RUNS_TO_ALERT}회 이어지면 Slack 으로 한 번 알리고(TRAFFIC_SURGE_DETECTED), 그 뒤
 * {@value #CALM_RUNS_TO_RECOVER}회 연속 기준 미만이면 정상화를 한 번 알린다(TRAFFIC_SURGE_RECOVERED).
 * 두 메시지의 수치는 이상 구간(감지 전 연속 이상 집계부터)의 최대치다. 런북: deploy/MONITORING.md
 *
 * <p>환산: 실행이 늦어져도(스케줄러 풀 공유) 실제로 흐른 시간으로 나눈다. fixedDelay 라 밀린 실행을 몰아서 돌지 않는다.
 * 흐른 시간이 1초 미만이면(시계 역행) 기본 주기로 본다.
 * 상태는 메모리라 재기동하면 정상 상태부터다 — 알림 중 재기동(배포)하면 정상화 알림이 오지 않는다({@code FrontendRevalidator}
 * 와 같음). 알림은 이 스레드에서 직접 보낸다 — 트랜잭션 없는 스케줄러 스레드라 AFTER_COMMIT 리스너는 버린다. 전송 실패는
 * 재전송하지 않는다(알림은 손실 허용).
 *
 * <p>기준값은 평소 수치를 모르는 상태의 추정치다 — 매시 요약을 INFO 로 남겨 그 로그로 맞춘다.
 * 집계 수치만 다룬다 — IP·경로는 세지도 남기지도 않는다.
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "duing.monitoring.traffic-surge", name = "enabled", havingValue = "true")
public class TrafficSurgeMonitor {

    static final int SURGE_RUNS_TO_ALERT = 2;
    static final int CALM_RUNS_TO_RECOVER = 5;
    private static final long RUN_INTERVAL_MILLIS = 60_000;
    private static final DateTimeFormatter SUMMARY_HOUR = DateTimeFormatter.ofPattern("yyyy-MM-dd HH'시'");

    private final TrafficCountingFilter trafficCountingFilter;
    private final OpsSlackMessageFormatter opsSlackMessageFormatter;
    private final SlackNotifier slackNotifier;
    private final Clock clock;
    private final long requestsPerMinuteThreshold;
    private final long rejectionsPerMinuteThreshold;

    // 아래 상태는 이 잡만 쓴다 — 같은 잡은 겹쳐 돌지 않는다.
    private Instant lastEvaluatedAt;
    private int consecutiveSurgeRuns;
    private int consecutiveCalmRuns;
    private boolean alerting;
    private long peakRequestsPerMinute;
    private long peakRejectionsPerMinute;
    private LocalDateTime summaryHour;
    private long hourPeakRequestsPerMinute;
    private long hourPeakRejectionsPerMinute;
    private long hourTotalRequests;

    public TrafficSurgeMonitor(TrafficCountingFilter trafficCountingFilter,
                               OpsSlackMessageFormatter opsSlackMessageFormatter,
                               SlackNotifier slackNotifier,
                               Clock clock,
                               @Value("${duing.monitoring.traffic-surge.requests-per-minute:3000}")
                               long requestsPerMinuteThreshold,
                               @Value("${duing.monitoring.traffic-surge.rejections-per-minute:300}")
                               long rejectionsPerMinuteThreshold) {
        this.trafficCountingFilter = trafficCountingFilter;
        this.opsSlackMessageFormatter = opsSlackMessageFormatter;
        this.slackNotifier = slackNotifier;
        this.clock = clock;
        this.requestsPerMinuteThreshold = requestsPerMinuteThreshold;
        this.rejectionsPerMinuteThreshold = rejectionsPerMinuteThreshold;
        this.lastEvaluatedAt = clock.instant();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logStatus() {
        log.info("[트래픽 이상 감지] 활성 — 기준 분당 요청 {}·분당 429 {}",
                requestsPerMinuteThreshold, rejectionsPerMinuteThreshold);
    }

    @Scheduled(fixedDelay = RUN_INTERVAL_MILLIS, initialDelay = RUN_INTERVAL_MILLIS)
    public void run() {
        TrafficCountingFilter.Window window = trafficCountingFilter.drain();
        evaluate(window.requests(), window.rejections(), clock.instant());
    }

    void evaluate(long requests, long rejections, Instant now) {
        long elapsedSeconds = Duration.between(lastEvaluatedAt, now).toSeconds();
        if (elapsedSeconds < 1) {
            // 시계 역행(NTP 보정 등) — 건수는 실행 간격만큼 쌓였으므로 기본 주기로 본다(작은 값으로 나누면 몇십 배로 부푼다).
            elapsedSeconds = RUN_INTERVAL_MILLIS / 1000;
        }
        lastEvaluatedAt = now;
        long requestsPerMinute = requests * 60 / elapsedSeconds;
        long rejectionsPerMinute = rejections * 60 / elapsedSeconds;
        recordHourlySummary(now, requests, requestsPerMinute, rejectionsPerMinute);

        boolean surge = requestsPerMinute >= requestsPerMinuteThreshold
                || rejectionsPerMinute >= rejectionsPerMinuteThreshold;
        consecutiveSurgeRuns = surge ? consecutiveSurgeRuns + 1 : 0;
        consecutiveCalmRuns = surge ? 0 : consecutiveCalmRuns + 1;
        // 이상 구간 최대치 — 알림 전 정상 집계가 끼면 그 앞은 버린다.
        if (alerting || surge) {
            peakRequestsPerMinute = Math.max(peakRequestsPerMinute, requestsPerMinute);
            peakRejectionsPerMinute = Math.max(peakRejectionsPerMinute, rejectionsPerMinute);
        } else {
            peakRequestsPerMinute = 0;
            peakRejectionsPerMinute = 0;
        }

        if (!alerting && consecutiveSurgeRuns >= SURGE_RUNS_TO_ALERT) {
            alerting = true;
            notifyDetected(peakRequestsPerMinute, peakRejectionsPerMinute);
        } else if (alerting && consecutiveCalmRuns >= CALM_RUNS_TO_RECOVER) {
            alerting = false;
            notifyRecovered(peakRequestsPerMinute, peakRejectionsPerMinute);
            peakRequestsPerMinute = 0;
            peakRejectionsPerMinute = 0;
        }
    }

    private void notifyDetected(long peakRequests, long peakRejections) {
        // webhook 이 비어 있으면 전송기는 debug 만 남긴다 — 감지는 로그로도 추적되게 한 줄 남긴다.
        log.warn("api 트래픽 이상 감지 — 최대 분당 요청 {}, 최대 분당 429 {} (런북: deploy/MONITORING.md)",
                peakRequests, peakRejections);
        notifySafely("TRAFFIC_SURGE_DETECTED", () -> opsSlackMessageFormatter.trafficSurgeDetected(
                peakRequests, peakRejections, SURGE_RUNS_TO_ALERT,
                requestsPerMinuteThreshold, rejectionsPerMinuteThreshold));
    }

    private void notifyRecovered(long peakRequests, long peakRejections) {
        log.info("api 트래픽 정상화 — 이상 구간 최대 분당 요청 {}, 최대 분당 429 {}", peakRequests, peakRejections);
        notifySafely("TRAFFIC_SURGE_RECOVERED", () -> opsSlackMessageFormatter.trafficSurgeRecovered(
                peakRequests, peakRejections, CALM_RUNS_TO_RECOVER));
    }

    // 시가 바뀐 첫 집계에서 직전 시를 먼저 남기고, 이번 집계 값은 새 시에 넣는다(경계의 1분 어긋남은 기준 조정에 무해).
    private void recordHourlySummary(Instant now, long requests, long requestsPerMinute, long rejectionsPerMinute) {
        LocalDateTime hour = LocalDateTime.ofInstant(now, clock.getZone()).truncatedTo(ChronoUnit.HOURS);
        if (summaryHour != null && !summaryHour.equals(hour)) {
            log.info("트래픽 시간 요약 — {}, 최대 분당 요청 {}, 최대 분당 429 {}, 총 요청 {}",
                    SUMMARY_HOUR.format(summaryHour), hourPeakRequestsPerMinute, hourPeakRejectionsPerMinute,
                    hourTotalRequests);
            hourPeakRequestsPerMinute = 0;
            hourPeakRejectionsPerMinute = 0;
            hourTotalRequests = 0;
        }
        summaryHour = hour;
        hourPeakRequestsPerMinute = Math.max(hourPeakRequestsPerMinute, requestsPerMinute);
        hourPeakRejectionsPerMinute = Math.max(hourPeakRejectionsPerMinute, rejectionsPerMinute);
        hourTotalRequests += requests;
    }

    // 전송기는 던지지 않지만 포매터까지 감싸 알림 실패가 판정으로 새지 않게 한다(FrontendRevalidator 관례).
    private void notifySafely(String eventType, Supplier<String> messageSupplier) {
        try {
            slackNotifier.send(messageSupplier.get());
        } catch (RuntimeException failure) {
            // 예외 메시지에 URL 이 섞일 수 있어 클래스명만 남긴다.
            log.error("Slack 운영 알림 처리 실패 — event={}, reason={}", eventType, failure.getClass().getSimpleName());
        }
    }
}

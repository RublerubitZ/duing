package com.duing.global.monitoring.traffic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.duing.global.monitoring.OpsSlackMessageFormatter;
import com.duing.global.monitoring.SlackNotifier;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

@ExtendWith(OutputCaptureExtension.class)
class TrafficSurgeMonitorTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    // 14:57 시작 — 세 번째 집계(15:00)에서 14시 요약이 남는다.
    private static final Instant START = LocalDateTime.of(2026, 10, 7, 14, 57).atZone(SEOUL).toInstant();
    private static final long REQUEST_THRESHOLD = 3_000;
    private static final long REJECTION_THRESHOLD = 300;
    private static final String DETECTED_MESSAGE = "formatted-detected";
    private static final String RECOVERED_MESSAGE = "formatted-recovered";

    private final Clock clock = Clock.fixed(START, SEOUL);
    private final TrafficCountingFilter trafficCountingFilter = new TrafficCountingFilter();
    private final OpsSlackMessageFormatter formatter = mock(OpsSlackMessageFormatter.class);
    private final SlackNotifier slackNotifier = mock(SlackNotifier.class);
    private TrafficSurgeMonitor monitor;
    private Instant now = START;

    @BeforeEach
    void setUp() {
        when(formatter.trafficSurgeDetected(anyLong(), anyLong(), anyInt(), anyLong(), anyLong()))
                .thenReturn(DETECTED_MESSAGE);
        when(formatter.trafficSurgeRecovered(anyLong(), anyLong(), anyInt())).thenReturn(RECOVERED_MESSAGE);
        monitor = monitorWithThresholds(REQUEST_THRESHOLD, REJECTION_THRESHOLD);
    }

    @Test
    @DisplayName("기준 이상이 2회 연속이면 한 번 알리고, 이상이 이어져도 다시 알리지 않는다")
    void alertsOnceAfterTwoSurgeRuns() {
        minute(3_000, 0);
        verifyNoInteractions(slackNotifier);

        minute(3_500, 0);
        minute(4_000, 0);
        minute(4_000, 0);

        verify(formatter).trafficSurgeDetected(3_500, 0, 2, REQUEST_THRESHOLD, REJECTION_THRESHOLD);
        verify(slackNotifier, times(1)).send(DETECTED_MESSAGE);
    }

    @Test
    @DisplayName("감지 메시지는 이상 구간 최대치를 싣는다 — 첫 이상 집계가 더 크면 그 값")
    void detectionCarriesStreakPeak() {
        minute(10_000, 0);
        minute(3_100, 5);

        verify(formatter).trafficSurgeDetected(10_000, 5, 2, REQUEST_THRESHOLD, REJECTION_THRESHOLD);
    }

    @Test
    @DisplayName("감지 전에 정상 집계가 끼면 그 앞의 최대치는 버린다")
    void calmRunBeforeDetectionResetsPeak() {
        minute(9_000, 0);
        minute(10, 0);
        minute(3_100, 0);
        minute(3_200, 0);

        verify(formatter).trafficSurgeDetected(3_200, 0, 2, REQUEST_THRESHOLD, REJECTION_THRESHOLD);
    }

    @Test
    @DisplayName("기준 미만만 이어지면 알리지 않는다")
    void staysSilentBelowThresholds() {
        for (int run = 0; run < 10; run++) {
            minute(2_999, 299);
        }

        verifyNoInteractions(slackNotifier);
    }

    @Test
    @DisplayName("429 축만 넘어도 감지한다")
    void detectsOnRejectionsAlone() {
        minute(100, 300);
        minute(100, 450);

        verify(formatter).trafficSurgeDetected(100, 450, 2, REQUEST_THRESHOLD, REJECTION_THRESHOLD);
        verify(slackNotifier).send(DETECTED_MESSAGE);
    }

    @Test
    @DisplayName("이상 사이에 정상이 끼면 연속이 끊겨 알리지 않는다")
    void calmRunBreaksSurgeStreak() {
        minute(5_000, 0);
        minute(10, 0);
        minute(5_000, 0);

        verifyNoInteractions(slackNotifier);
    }

    @Test
    @DisplayName("감지 뒤 기준 미만이 5회 연속이면 이상 구간 최대치로 정상화를 한 번 알린다")
    void recoversOnceAfterFiveCalmRuns() {
        minute(3_200, 10);
        minute(9_000, 400);
        minute(6_000, 900);
        calmRuns(4);
        verify(slackNotifier, never()).send(RECOVERED_MESSAGE);

        calmRuns(2);

        verify(formatter).trafficSurgeRecovered(9_000, 900, 5);
        verify(slackNotifier, times(1)).send(RECOVERED_MESSAGE);
    }

    @Test
    @DisplayName("정상화 전에 이상이 다시 오면 정상 연속이 끊긴다")
    void surgeBeforeRecoveryResetsCalmStreak() {
        minute(5_000, 0);
        minute(5_000, 0);
        calmRuns(4);
        minute(5_000, 0);
        calmRuns(4);

        verify(slackNotifier, times(1)).send(DETECTED_MESSAGE);
        verify(slackNotifier, never()).send(RECOVERED_MESSAGE);
    }

    @Test
    @DisplayName("정상화 뒤 다시 2회 연속 이상이면 새 구간 최대치로 또 알린다")
    void alertsAgainAfterRecoveryWithFreshPeak() {
        minute(5_000, 0);
        minute(5_000, 0);
        calmRuns(5);
        minute(4_000, 0);
        minute(4_000, 0);

        verify(formatter).trafficSurgeDetected(5_000, 0, 2, REQUEST_THRESHOLD, REJECTION_THRESHOLD);
        verify(formatter).trafficSurgeDetected(4_000, 0, 2, REQUEST_THRESHOLD, REJECTION_THRESHOLD);
        verify(slackNotifier, times(2)).send(DETECTED_MESSAGE);
        verify(slackNotifier, times(1)).send(RECOVERED_MESSAGE);
    }

    @Test
    @DisplayName("집계가 늦어 3분 만에 돌아도 분당 값으로 환산한다")
    void normalizesDelayedRunToPerMinute() {
        run(Duration.ofMinutes(3), 6_000, 0);
        run(Duration.ofMinutes(3), 6_000, 0);
        verifyNoInteractions(slackNotifier);

        run(Duration.ofMinutes(3), 9_000, 0);
        run(Duration.ofMinutes(3), 9_000, 0);

        verify(formatter).trafficSurgeDetected(3_000, 0, 2, REQUEST_THRESHOLD, REJECTION_THRESHOLD);
    }

    @Test
    @DisplayName("알림 전송이 예외를 던져도 판정은 이어진다 — 예외 메시지는 로그에 싣지 않는다")
    void notifierFailureIsIsolated(CapturedOutput output) {
        doThrow(new IllegalStateException("slack down")).when(slackNotifier).send(anyString());

        assertThatCode(() -> {
            minute(5_000, 0);
            minute(5_000, 0);
            calmRuns(5);
        }).doesNotThrowAnyException();

        verify(slackNotifier).send(DETECTED_MESSAGE);
        verify(slackNotifier).send(RECOVERED_MESSAGE);
        assertThat(output).contains("reason=IllegalStateException").doesNotContain("slack down");
    }

    @Test
    @DisplayName("포매터가 예외를 던져도 상태는 넘어가고 다음 감지도 온다 — 이벤트명과 예외 클래스명만 남긴다")
    void formatterFailureIsIsolated(CapturedOutput output) {
        when(formatter.trafficSurgeRecovered(anyLong(), anyLong(), anyInt()))
                .thenThrow(new IllegalStateException("formatter exploded"));

        assertThatCode(() -> {
            minute(5_000, 0);
            minute(5_000, 0);
            calmRuns(5);
            minute(5_000, 0);
            minute(5_000, 0);
        }).doesNotThrowAnyException();

        verify(slackNotifier, times(2)).send(DETECTED_MESSAGE);
        assertThat(output).contains("event=TRAFFIC_SURGE_RECOVERED, reason=IllegalStateException")
                .doesNotContain("formatter exploded");
    }

    @Test
    @DisplayName("감지는 Slack 과 별개로 WARN 한 줄을 남긴다 — webhook 이 비어도 추적된다")
    void logsWarnOnDetection(CapturedOutput output) {
        minute(5_000, 0);
        minute(5_000, 0);

        assertThat(output).contains("api 트래픽 이상 감지 — 최대 분당 요청 5000, 최대 분당 429 0");
    }

    @Test
    @DisplayName("시가 바뀌면 직전 시의 최대 분당 요청·429 와 총 요청을 한 줄로 남긴다")
    void logsHourlySummaryOnHourChange(CapturedOutput output) {
        minute(1_200, 3);
        minute(700, 9);
        assertThat(output).doesNotContain("트래픽 시간 요약");

        minute(800, 0);

        assertThat(output).contains("트래픽 시간 요약 — 2026-10-07 14시, 최대 분당 요청 1200, 최대 분당 429 9, 총 요청 1900");
    }

    @Test
    @DisplayName("기동 상태 로그에 기준값을 남긴다")
    void logStatusPrintsThresholds(CapturedOutput output) {
        monitor.logStatus();

        assertThat(output).contains("[트래픽 이상 감지] 활성 — 기준 분당 요청 3000·분당 429 300");
    }

    @Test
    @DisplayName("매분 실행은 필터에서 센 값을 비워 판정한다")
    void tickDrainsFilterCounts() throws Exception {
        // 고정 시계라 흐른 시간이 하한 1초로 잡혀 2건이 분당 120 이 된다.
        TrafficSurgeMonitor tickMonitor = monitorWithThresholds(100, 300);

        for (int run = 0; run < 2; run++) {
            passRequests(2);
            tickMonitor.tick();
        }

        verify(formatter).trafficSurgeDetected(120, 0, 2, 100, 300);
        assertThat(trafficCountingFilter.drain()).isEqualTo(new TrafficCountingFilter.Window(0, 0));
    }

    private TrafficSurgeMonitor monitorWithThresholds(long requestThreshold, long rejectionThreshold) {
        return new TrafficSurgeMonitor(trafficCountingFilter, formatter, slackNotifier, clock,
                requestThreshold, rejectionThreshold);
    }

    private void minute(long requests, long rejections) {
        run(Duration.ofMinutes(1), requests, rejections);
    }

    private void calmRuns(int count) {
        for (int run = 0; run < count; run++) {
            minute(100, 0);
        }
    }

    private void run(Duration elapsed, long requests, long rejections) {
        now = now.plus(elapsed);
        monitor.evaluate(requests, rejections, now);
    }

    private void passRequests(int count) throws Exception {
        for (int request = 0; request < count; request++) {
            trafficCountingFilter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(),
                    (servletRequest, servletResponse) -> ((HttpServletResponse) servletResponse).setStatus(200));
        }
    }
}

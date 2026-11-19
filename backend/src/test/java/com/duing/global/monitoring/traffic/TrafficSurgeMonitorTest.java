package com.duing.global.monitoring.traffic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
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
import com.duing.global.monitoring.TrafficDailySummary;
import com.duing.global.ratelimit.ApiReadRateLimitFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(OutputCaptureExtension.class)
class TrafficSurgeMonitorTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    // 14:57 시작 — 세 번째 집계(15:00)에서 14시 요약이 남는다.
    private static final Instant START = LocalDateTime.of(2026, 10, 7, 14, 57).atZone(SEOUL).toInstant();
    private static final long REQUEST_THRESHOLD = 3_000;
    private static final long REJECTION_THRESHOLD = 300;
    private static final int READ_LIMIT = 1_000;
    private static final String DETECTED_MESSAGE = "formatted-detected";
    private static final String RECOVERED_MESSAGE = "formatted-recovered";
    private static final String DAILY_MESSAGE = "formatted-daily";

    private final Clock clock = Clock.fixed(START, SEOUL);
    private final TrafficCountingFilter trafficCountingFilter = new TrafficCountingFilter();
    private final ApiReadRateLimitFilter apiReadRateLimitFilter = new ApiReadRateLimitFilter(new ObjectMapper(), clock);
    private final OpsSlackMessageFormatter formatter = mock(OpsSlackMessageFormatter.class);
    private final SlackNotifier slackNotifier = mock(SlackNotifier.class);
    private TrafficSurgeMonitor monitor;
    private Instant now = START;

    @BeforeEach
    void setUp() {
        when(formatter.trafficSurgeDetected(anyLong(), anyLong(), anyInt(), anyLong(), anyLong()))
                .thenReturn(DETECTED_MESSAGE);
        when(formatter.trafficSurgeRecovered(anyLong(), anyLong(), anyInt())).thenReturn(RECOVERED_MESSAGE);
        when(formatter.trafficDailySummary(any())).thenReturn(DAILY_MESSAGE);
        ReflectionTestUtils.setField(apiReadRateLimitFilter, "limitPerMinute", READ_LIMIT);
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
    void recoversOnceAfterFiveCalmRuns(CapturedOutput output) {
        minute(3_200, 10);
        minute(9_000, 400);
        minute(6_000, 900);
        calmRuns(4);
        verify(slackNotifier, never()).send(RECOVERED_MESSAGE);

        calmRuns(2);

        verify(formatter).trafficSurgeRecovered(9_000, 900, 5);
        verify(slackNotifier, times(1)).send(RECOVERED_MESSAGE);
        assertThat(output).contains("api 트래픽 정상화 — 이상 구간 최대 분당 요청 9000, 최대 분당 429 900");
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
    @DisplayName("시계가 거꾸로 가 흐른 시간이 1초 미만이면 기본 주기 1분으로 환산한다 — 부풀지도, 음수로 사라지지도 않는다")
    void clockGoingBackwardsCountsAsRegularInterval() {
        run(Duration.ofMinutes(-2), 3_000, 0);
        run(Duration.ofMinutes(-2), 3_000, 0);

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

        assertThat(output.getOut()).containsPattern("WARN.*api 트래픽 이상 감지 — 최대 분당 요청 5000, 최대 분당 429 0");
    }

    @Test
    @DisplayName("시가 바뀌면 직전 시의 최대 분당 요청·429 와 총 요청을 한 줄로 남긴다")
    void logsHourlySummaryOnHourChange(CapturedOutput output) {
        minute(1_200, 3);
        minute(700, 9);
        assertThat(output).doesNotContain("트래픽 시간 요약");

        minute(800, 0);

        assertThat(output).contains("트래픽 시간 요약 — 2026-10-07 14시, 최대 분당 요청 1200, 최대 분당 429 9, 총 요청 1900, "
                + "한 IP 분당 최대 조회 0건(한도 1,000건)");
    }

    @Test
    @DisplayName("기동 상태 로그에 기준값을 남긴다")
    void logStatusPrintsThresholds(CapturedOutput output) {
        monitor.logStatus();

        assertThat(output).contains("[트래픽 이상 감지] 활성 — 기준 분당 요청 3000·분당 429 300");
    }

    @Test
    @DisplayName("매분 실행은 필터에서 센 값을 비워 판정한다")
    void runDrainsFilterCounts() throws Exception {
        // 고정 시계라 흐른 시간이 0 — 기본 주기(1분)로 보아 2건이 분당 2 다.
        TrafficSurgeMonitor scheduledMonitor = monitorWithThresholds(1, 300);

        for (int run = 0; run < 2; run++) {
            passRequests(2);
            scheduledMonitor.run();
        }

        verify(formatter).trafficSurgeDetected(2, 0, 2, 1, 300);
        assertThat(trafficCountingFilter.drain()).isEqualTo(new TrafficCountingFilter.Window(0, 0));
    }

    @Test
    @DisplayName("09:00 을 넘는 첫 집계에서 직전 기간 요약을 한 번 보낸다 — 생성 직후 기간은 재기동 뒤부터로 표시한다")
    void sendsDailySummaryAtFirstRunPastNine(CapturedOutput output) {
        run(Duration.ofHours(18).plusMinutes(2), 541_000, 2_164);
        verify(formatter, never()).trafficDailySummary(any());

        minute(300, 1);

        verify(formatter).trafficDailySummary(new TrafficDailySummary(
                LocalDateTime.of(2026, 10, 7, 14, 57), LocalDateTime.of(2026, 10, 8, 9, 0), true,
                541_000, 2_164, 500, LocalDateTime.of(2026, 10, 8, 8, 59), 2, 0, REQUEST_THRESHOLD, REJECTION_THRESHOLD,
                0, READ_LIMIT));
        verify(slackNotifier).send(DAILY_MESSAGE);
        assertThat(output).contains("트래픽 일간 요약 — 기간 시작 2026-10-07 14:57, 총 요청 541000, 최대 분당 요청 500");
    }

    @Test
    @DisplayName("다음 기간은 09:00 ~ 09:00 이고 경계 집계부터 0 에서 다시 쌓는다")
    void nextPeriodRunsNineToNineWithFreshTotals() {
        run(Duration.ofHours(18).plusMinutes(2), 541_000, 2_164);
        minute(300, 1);

        run(Duration.ofHours(24).minusMinutes(1), 14_390, 0);
        run(Duration.ofMinutes(1), 10, 0);

        verify(formatter).trafficDailySummary(new TrafficDailySummary(
                LocalDateTime.of(2026, 10, 8, 9, 0), LocalDateTime.of(2026, 10, 9, 9, 0), false,
                14_690, 1, 300, LocalDateTime.of(2026, 10, 8, 9, 0), 1, 0, REQUEST_THRESHOLD, REJECTION_THRESHOLD,
                0, READ_LIMIT));
    }

    @Test
    @DisplayName("일간 요약은 그 기간의 이상 감지 횟수를 싣는다 — 09:00 경계 집계에서 난 감지는 새 기간 몫이다")
    void dailySummaryCountsSurgeAlerts() {
        minute(5_000, 0);
        minute(5_000, 0);
        calmRuns(5);
        run(Duration.ofHours(17).plusMinutes(54), 0, 0);
        minute(5_000, 0);
        minute(5_000, 0);
        run(Duration.ofHours(24), 0, 0);

        // 10-08 요약은 14:59 감지 1회, 10-09 요약은 10-08 09:00 경계에서 난 감지 1회 — 새 기간마다 0 부터 센다.
        ArgumentCaptor<TrafficDailySummary> summaryCaptor = ArgumentCaptor.forClass(TrafficDailySummary.class);
        verify(formatter, times(2)).trafficDailySummary(summaryCaptor.capture());
        assertThat(summaryCaptor.getAllValues()).extracting(TrafficDailySummary::surgeAlerts).containsExactly(1, 1);
    }

    @Test
    @DisplayName("시계가 09:00 을 거꾸로 되넘어도 요약을 다시 보내지 않고 기간도 되돌리지 않는다")
    void clockGoingBackwardsAcrossNineDoesNotResendSummary() {
        run(Duration.ofHours(18).plusMinutes(2), 541_000, 2_164);
        minute(300, 1);

        run(Duration.ofMinutes(-2), 100, 0);
        minute(100, 0);
        minute(100, 0);
        run(Duration.ofHours(24), 0, 0);

        // 역행·복귀 동안의 300건은 10-08 기간에 남고, 다음 요약은 실제 경계(10-09 09:00)에서 한 번뿐이다.
        verify(formatter, times(2)).trafficDailySummary(any());
        verify(formatter).trafficDailySummary(new TrafficDailySummary(
                LocalDateTime.of(2026, 10, 8, 9, 0), LocalDateTime.of(2026, 10, 9, 9, 0), false,
                600, 1, 300, LocalDateTime.of(2026, 10, 8, 9, 0), 1, 0, REQUEST_THRESHOLD, REJECTION_THRESHOLD,
                0, READ_LIMIT));
    }

    @Test
    @DisplayName("일간 요약 메시지 조립이 실패해도 판정은 이어진다 — 이벤트명과 예외 클래스명만 남긴다")
    void dailySummaryFailureIsIsolated(CapturedOutput output) {
        when(formatter.trafficDailySummary(any())).thenThrow(new IllegalStateException("summary exploded"));

        assertThatCode(() -> {
            run(Duration.ofHours(18).plusMinutes(2), 541_000, 2_164);
            minute(5_000, 0);
            minute(5_000, 0);
        }).doesNotThrowAnyException();

        verify(slackNotifier).send(DETECTED_MESSAGE);
        assertThat(output).contains("event=TRAFFIC_DAILY_SUMMARY, reason=IllegalStateException")
                .doesNotContain("summary exploded");
    }

    @Test
    @DisplayName("매시 요약 줄 끝에 그 시의 한 IP 분당 최대 조회를 한도와 함께 붙이고, 시가 바뀌면 0 에서 다시 센다 — 경계 집계는 새 시 몫이다")
    void hourlySummaryCarriesPeakPerIpReads(CapturedOutput output) {
        // 직전 시보다 낮은 시(16시 40)를 넣는다 — 경계에서 0 으로 되돌리지 않으면 16시 줄이 612 로 남는다.
        // 경계 집계의 값을 직전 시에 넣으면 14시 줄이 612 가 된다.
        run(Duration.ofMinutes(1), 100, 0, 300);   // 14:58 — 14시
        run(Duration.ofMinutes(2), 0, 0, 612);     // 15:00 경계 — 14시 줄을 남기고 612 는 15시 몫
        run(Duration.ofMinutes(60), 0, 0, 40);     // 16:00 경계 — 15시 줄을 남기고 40 은 16시 몫
        run(Duration.ofMinutes(60), 0, 0, 0);      // 17:00 경계 — 16시 줄을 남긴다

        assertThat(output)
                .contains("트래픽 시간 요약 — 2026-10-07 14시, 최대 분당 요청 100, 최대 분당 429 0, 총 요청 100, "
                        + "한 IP 분당 최대 조회 300건(한도 1,000건)")
                .contains("트래픽 시간 요약 — 2026-10-07 15시, 최대 분당 요청 0, 최대 분당 429 0, 총 요청 0, "
                        + "한 IP 분당 최대 조회 612건(한도 1,000건)")
                .contains("트래픽 시간 요약 — 2026-10-07 16시, 최대 분당 요청 0, 최대 분당 429 0, 총 요청 0, "
                        + "한 IP 분당 최대 조회 40건(한도 1,000건)");
    }

    @Test
    @DisplayName("그 시에 한 IP 가 한도를 넘겼으면 매시 요약 줄 끝은 건수 대신 '한도 초과'다")
    void hourlySummaryMarksReadLimitExceeded(CapturedOutput output) {
        run(Duration.ofMinutes(1), 100, 0, 1_001);
        run(Duration.ofMinutes(2), 0, 0, 0);

        assertThat(output).contains("총 요청 100, 한 IP 분당 최대 조회 한도 초과(1,000건 넘음)");
    }

    @Test
    @DisplayName("조회 요청 제한이 꺼져 있으면 매시 요약 줄 끝에 비활성을 적는다")
    void hourlySummaryMarksReadLimitDisabled(CapturedOutput output) {
        ReflectionTestUtils.setField(apiReadRateLimitFilter, "limitPerMinute", 0);

        run(Duration.ofMinutes(1), 100, 0, 0);
        run(Duration.ofMinutes(2), 0, 0, 0);

        assertThat(output).contains("총 요청 100, 한 IP 분당 최대 조회 제한 비활성");
    }

    @Test
    @DisplayName("매분 실행은 조회 요청 제한 필터의 한 IP 최대 조회도 비워 그 시 요약에 넣는다")
    void runDrainsReadPeakFromRateLimitFilter(CapturedOutput output) throws Exception {
        // 큰 쪽을 먼저 보낸다 — 뒤에 온 작은 건수(3)가 최대를 덮으면 3건으로 남는다.
        passReads("198.51.100.9", 5);
        passReads("203.0.113.7", 3);

        // 고정 시계라 이 실행은 14:57 집계다 — 다음 집계(15:00)에서 14시 요약이 남는다.
        monitor.run();

        assertThat(apiReadRateLimitFilter.drainPeakPerIpCount()).isZero();
        run(Duration.ofMinutes(3), 0, 0);
        assertThat(output).contains("한 IP 분당 최대 조회 5건(한도 1,000건)");
    }

    @Test
    @DisplayName("일간 요약은 그 기간의 한 IP 분당 최대 조회와 한도를 싣는다 — 09:00 경계 집계의 값은 새 기간 몫이다")
    void dailySummaryCarriesPeakPerIpReadsPerPeriod() {
        run(Duration.ofHours(18).plusMinutes(2), 541_000, 2_164, 612);
        run(Duration.ofMinutes(1), 300, 1, 40);
        run(Duration.ofHours(24).minusMinutes(1), 14_390, 0, 7);
        run(Duration.ofMinutes(1), 10, 0, 900);

        // 10-08 요약은 10-07 기간의 612, 10-09 요약은 10-08 09:00 경계의 40 과 그 뒤 7 중 최대 — 10-09 경계의 900 은 다음 기간 몫이다.
        ArgumentCaptor<TrafficDailySummary> summaryCaptor = ArgumentCaptor.forClass(TrafficDailySummary.class);
        verify(formatter, times(2)).trafficDailySummary(summaryCaptor.capture());
        assertThat(summaryCaptor.getAllValues())
                .extracting(TrafficDailySummary::peakPerIpReads, TrafficDailySummary::readLimitPerMinute)
                .containsExactly(tuple(612, READ_LIMIT), tuple(40, READ_LIMIT));
    }

    private TrafficSurgeMonitor monitorWithThresholds(long requestThreshold, long rejectionThreshold) {
        return new TrafficSurgeMonitor(trafficCountingFilter, apiReadRateLimitFilter, formatter, slackNotifier, clock,
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
        run(elapsed, requests, rejections, 0);
    }

    private void run(Duration elapsed, long requests, long rejections, int peakPerIpReads) {
        now = now.plus(elapsed);
        monitor.evaluate(requests, rejections, peakPerIpReads, now);
    }

    private void passRequests(int count) throws Exception {
        for (int request = 0; request < count; request++) {
            trafficCountingFilter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(),
                    (servletRequest, servletResponse) -> ((HttpServletResponse) servletResponse).setStatus(200));
        }
    }

    private void passReads(String clientIp, int count) throws Exception {
        for (int request = 0; request < count; request++) {
            MockHttpServletRequest read = new MockHttpServletRequest("GET", "/api/v1/clubs");
            read.setRemoteAddr(clientIp);
            apiReadRateLimitFilter.doFilter(read, new MockHttpServletResponse(), new MockFilterChain());
        }
    }
}

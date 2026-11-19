package com.duing.global.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(OutputCaptureExtension.class)
class ApiReadRateLimitFilterTest {

    private static final int LIMIT = 3;
    private static final String CLIENT_IP = "203.0.113.7";
    private static final String CLUBS_PATH = "/api/v1/clubs";

    // 분 경계에서 20초 지난 시각 — 창이 끝나기까지 40초 남는다.
    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-13T03:00:20Z"));

    private ApiReadRateLimitFilter filter;

    @BeforeEach
    void setUp() {
        filter = new ApiReadRateLimitFilter(new ObjectMapper(), clock);
        ReflectionTestUtils.setField(filter, "limitPerMinute", LIMIT);
    }

    @Test
    @DisplayName("한 IP 의 조회 요청은 분당 한도까지 통과하고, 넘는 요청은 컨트롤러에 닿기 전 429 와 Retry-After 로 거절된다")
    void rejectsReadsOverLimitWithinSameMinute() throws Exception {
        for (int requestIndex = 0; requestIndex < LIMIT; requestIndex++) {
            assertThat(send("GET", CLUBS_PATH, CLIENT_IP).getStatus()).isEqualTo(HttpStatus.OK.value());
        }

        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse rejected = send("GET", CLUBS_PATH, CLIENT_IP, chain);

        assertThat(rejected.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
        assertThat(rejected.getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("40");
        assertThat(rejected.getContentType()).startsWith(MediaType.APPLICATION_JSON_VALUE);
        assertThat(rejected.getContentAsString()).contains(ApiReadRateLimitFilter.MESSAGE);
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    @DisplayName("한도를 넘겨 계속 두드려도 다음 분이 되면 다시 한도만큼 통과한다")
    void allowsAgainInNextMinute() throws Exception {
        for (int requestIndex = 0; requestIndex < LIMIT + 50; requestIndex++) {
            send("GET", CLUBS_PATH, CLIENT_IP);
        }
        assertThat(send("GET", CLUBS_PATH, CLIENT_IP).getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());

        clock.advance(Duration.ofSeconds(40));

        for (int requestIndex = 0; requestIndex < LIMIT; requestIndex++) {
            assertThat(send("GET", CLUBS_PATH, CLIENT_IP).getStatus()).isEqualTo(HttpStatus.OK.value());
        }
        assertThat(send("GET", CLUBS_PATH, CLIENT_IP).getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
    }

    @Test
    @DisplayName("창은 IP 별로 따로 센다 — 한 IP 가 한도를 넘겨도 다른 IP 의 조회는 통과한다")
    void countsEachIpSeparately() throws Exception {
        for (int requestIndex = 0; requestIndex <= LIMIT; requestIndex++) {
            send("GET", CLUBS_PATH, CLIENT_IP);
        }

        assertThat(send("GET", CLUBS_PATH, "198.51.100.9").getStatus()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("IPv6 는 /64 로 묶어 센다 — 같은 /64 안에서 주소를 바꿔도 한 창을 쓴다")
    void groupsIpv6BySlash64() throws Exception {
        for (int requestIndex = 0; requestIndex < LIMIT; requestIndex++) {
            send("GET", CLUBS_PATH, "2001:db8:1:2::" + (requestIndex + 1));
        }

        assertThat(send("GET", CLUBS_PATH, "2001:db8:1:2::ffff").getStatus())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
        assertThat(send("GET", CLUBS_PATH, "2001:db8:1:3::1").getStatus()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("HEAD 도 조회로 센다 — GET 한도를 HEAD 로 비껴가지 못한다")
    void countsHeadAsRead() throws Exception {
        for (int requestIndex = 0; requestIndex < LIMIT; requestIndex++) {
            send("HEAD", CLUBS_PATH, CLIENT_IP);
        }

        assertThat(send("GET", CLUBS_PATH, CLIENT_IP).getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
    }

    @Test
    @DisplayName("쓰기 요청은 세지도 막지도 않는다")
    void ignoresWrites() throws Exception {
        for (int requestIndex = 0; requestIndex < LIMIT + 5; requestIndex++) {
            assertThat(send("POST", "/api/v1/auth/login", CLIENT_IP).getStatus()).isEqualTo(HttpStatus.OK.value());
        }

        // 위 요청들이 창을 쓰지 않았으므로 조회는 한도만큼 그대로 통과한다.
        for (int requestIndex = 0; requestIndex < LIMIT; requestIndex++) {
            assertThat(send("GET", CLUBS_PATH, CLIENT_IP).getStatus()).isEqualTo(HttpStatus.OK.value());
        }
    }

    @Test
    @DisplayName("경로로 가르지 않는다 — 스프링이 디코딩해 컨트롤러로 보내는 인코딩 경로(/%61pi/v1/…)로도 한도를 비껴가지 못한다")
    void countsEveryReadRegardlessOfPath() throws Exception {
        send("GET", "/%61pi/v1/clubs", CLIENT_IP);
        send("GET", "/API/v1/clubs", CLIENT_IP);
        send("GET", "/actuator/health", CLIENT_IP);

        assertThat(send("GET", CLUBS_PATH, CLIENT_IP).getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
    }

    @Test
    @DisplayName("로그에는 IP 전체가 아니라 대역만 남긴다 — IPv4 는 앞 세 옥텟, IPv6 는 앞 세 그룹")
    void masksClientIpForLog() {
        assertThat(ApiReadRateLimitFilter.maskForLog("203.0.113.7")).isEqualTo("203.0.113.x");
        assertThat(ApiReadRateLimitFilter.maskForLog(ClientIpKeys.normalize("2001:db8:1:2::9")))
                .isEqualTo("2001:db8:1::/48");
        assertThat(ApiReadRateLimitFilter.maskForLog("203.0")).isEqualTo("unknown");
        assertThat(ApiReadRateLimitFilter.maskForLog("unknown")).isEqualTo("unknown");
    }

    @Test
    @DisplayName("한도를 0 으로 두면 꺼진다 — 몇 건을 불러도 통과한다")
    void disabledWhenLimitIsZero() throws Exception {
        ReflectionTestUtils.setField(filter, "limitPerMinute", 0);

        for (int requestIndex = 0; requestIndex < 20; requestIndex++) {
            assertThat(send("GET", CLUBS_PATH, CLIENT_IP).getStatus()).isEqualTo(HttpStatus.OK.value());
        }
    }

    @ParameterizedTest(name = "[{index}] \"{0}\"")
    @NullSource
    @ValueSource(strings = {"", "   ", "1,000", "abc", "O", "\"0\"", "0.", "99999999999"})
    @DisplayName("한도 설정값이 null 이거나 비었거나 정수가 아니거나 int 범위를 넘으면 읽지 못한 것으로 보고 코드 기본값 1000 으로 켠다 — 꺼지지 않는다")
    void unreadableLimitFallsBackToDefault(String configuredLimit) {
        assertThat(ApiReadRateLimitFilter.parseLimit(configuredLimit)).isEmpty();

        filter.setLimitPerMinute(configuredLimit);

        assertThat(filter.limitPerMinute()).isEqualTo(1_000);
    }

    @Test
    @DisplayName("한도 설정값은 앞뒤 공백·줄끝 CR 을 떼고 읽고, 0·음수는 그 값 그대로(꺼짐) 둔다")
    void readableLimitIsUsedAsIs() {
        assertThat(ApiReadRateLimitFilter.parseLimit(" 500 ")).hasValue(500);
        assertThat(ApiReadRateLimitFilter.parseLimit("500\r")).hasValue(500);
        assertThat(ApiReadRateLimitFilter.parseLimit("0")).hasValue(0);
        assertThat(ApiReadRateLimitFilter.parseLimit("-5")).hasValue(-5);

        filter.setLimitPerMinute(" 500 ");
        assertThat(filter.limitPerMinute()).isEqualTo(500);

        filter.setLimitPerMinute("-5");
        assertThat(filter.limitPerMinute()).isEqualTo(-5);
    }

    @Test
    @DisplayName("기동 상태 줄 — 한도가 켜져 있으면 INFO 로 분당 한도를 천 단위 구분자로 남기고 ERROR 는 없다")
    void logStatusWhenActive(CapturedOutput output) {
        filter.setLimitPerMinute("1000");

        filter.logStatus();

        assertThat(output).containsPattern("INFO.*\\[조회 요청 제한\\] 활성 — 한 IP 분당 1,000건")
                .doesNotContain("읽지 못해");
    }

    @Test
    @DisplayName("기동 상태 줄 — 한도가 0 이하면 INFO 로 비활성을 남긴다")
    void logStatusWhenDisabled(CapturedOutput output) {
        filter.setLimitPerMinute("0");

        filter.logStatus();

        assertThat(output).containsPattern("INFO.*\\[조회 요청 제한\\] 비활성 — 한도 0 이하\\(로컬·CI 는 기본이 0\\)")
                .doesNotContain("[조회 요청 제한] 활성");
    }

    @Test
    @DisplayName("한도 설정값을 읽지 못하면 INFO 줄 끝에 기본값 표시를 붙이고, 받은 값을 담은 ERROR 한 줄을 더 남긴다")
    void logStatusWhenLimitUnreadable(CapturedOutput output) {
        filter.setLimitPerMinute("1,000");

        filter.logStatus();

        assertThat(output)
                .contains("[조회 요청 제한] 활성 — 한 IP 분당 1,000건(설정값을 읽지 못해 기본값)")
                .contains("[조회 요청 제한] 한도 설정값을 정수로 읽지 못해 기본값 1,000건으로 기동함 — 받은 값 '1,000'(5자), 끄려면 0")
                .containsPattern("ERROR.*한도 설정값을 정수로 읽지 못해");
    }

    @Test
    @DisplayName("ERROR 줄의 받은 값은 앞 16자까지만 적고 전체 길이를 붙인다 — 깨진 .env 에서 다음 줄의 값이 붙어 와도 다 남지 않는다")
    void unreadableLimitLogTruncatesReceivedValue(CapturedOutput output) {
        filter.setLimitPerMinute("1000NEXT_KEY=abcdefghijkl");

        filter.logStatus();

        assertThat(output).contains("받은 값 '1000NEXT_KEY=abc'(25자), 끄려면 0")
                .doesNotContain("defghijkl");
    }

    @Test
    @DisplayName("ERROR 줄의 받은 값은 제어 문자를 ? 로 바꿔 적는다 — 값에 든 CR·LF 가 로그 줄을 쪼개지 않는다")
    void unreadableLimitLogReplacesControlCharacters(CapturedOutput output) {
        filter.setLimitPerMinute("1000\r\nNEXT=ab");

        filter.logStatus();

        assertThat(output).contains("받은 값 '1000??NEXT=ab'(13자), 끄려면 0")
                .containsPattern("ERROR.*받은 값 '1000\\?\\?NEXT=ab'\\(13자\\), 끄려면 0");
    }

    @Test
    @DisplayName("한도 환경변수가 빈 값이어도 필터 빈이 만들어지고 기본값 1000 으로 켜진다 — application.yml 과 같은 중첩 자리표시가 빈 문자열로 풀려도 기동이 실패하지 않고, 기동 완료 시 기본값 INFO 와 받은 빈 값을 담은 ERROR 가 남는다")
    void emptyLimitPropertyStillCreatesFilterBean(CapturedOutput output) {
        new ApplicationContextRunner()
                .withUserConfiguration(ApiReadRateLimitFilter.class)
                .withBean(ObjectMapper.class, ObjectMapper::new)
                .withBean(Clock.class, Clock::systemUTC)
                // 운영과 같은 경로 — 빈 환경변수는 '없음'이 아니라 빈 문자열이라 yml 의 기본값 1000 이 쓰이지 않는다.
                .withPropertyValues("DUING_RATE_LIMIT_API_READ_PER_MINUTE=",
                        "duing.rate-limit.api-read-per-minute=${DUING_RATE_LIMIT_API_READ_PER_MINUTE:1000}")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(ApiReadRateLimitFilter.class).limitPerMinute()).isEqualTo(1_000);

                    // 리스너를 직접 부르지 않고 기동 완료 이벤트를 발행한다 — @EventListener 배선까지 고정한다.
                    context.publishEvent(new ApplicationReadyEvent(new SpringApplication(), new String[0], context,
                            Duration.ZERO));

                    assertThat(output)
                            .containsPattern("INFO.*\\[조회 요청 제한\\] 활성 — 한 IP 분당 1,000건\\(설정값을 읽지 못해 기본값\\)")
                            .containsPattern("ERROR.*받은 값 ''\\(0자\\)");
                });
    }

    @Test
    @DisplayName("한 IP 분당 최대 조회 — 여러 IP 중 한 분 창에서 가장 많이 보낸 건수를 돌려주고(뒤에 온 작은 건수가 덮지 않는다), 가져가면 0 으로 돌아간다")
    void drainReturnsHighestWindowCountAcrossIps() throws Exception {
        ReflectionTestUtils.setField(filter, "limitPerMinute", 10);
        // 큰 쪽을 먼저 보낸다 — 비교 없이 마지막 창 건수를 쓰는 구현이면 3 이 남는다.
        sendReads("198.51.100.9", 5);
        sendReads(CLIENT_IP, 3);

        assertThat(filter.drainPeakPerIpCount()).isEqualTo(5);
        assertThat(filter.drainPeakPerIpCount()).isZero();
    }

    @Test
    @DisplayName("최대 조회는 가져간 뒤의 증가분이 아니라 창 누적 건수다 — 3건 뒤 가져가고 같은 창에서 2건 더 오면 5")
    void drainReportsCumulativeWindowCount() throws Exception {
        ReflectionTestUtils.setField(filter, "limitPerMinute", 10);
        sendReads(CLIENT_IP, 3);
        assertThat(filter.drainPeakPerIpCount()).isEqualTo(3);

        sendReads(CLIENT_IP, 2);

        assertThat(filter.drainPeakPerIpCount()).isEqualTo(5);
    }

    @Test
    @DisplayName("분 창이 바뀌면 최대 조회는 새 창의 건수부터 센다")
    void drainStartsFromNewWindowCount() throws Exception {
        ReflectionTestUtils.setField(filter, "limitPerMinute", 10);
        sendReads(CLIENT_IP, 4);
        assertThat(filter.drainPeakPerIpCount()).isEqualTo(4);

        clock.advance(Duration.ofSeconds(40));
        sendReads(CLIENT_IP, 2);

        assertThat(filter.drainPeakPerIpCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("한도를 넘기면 최대 조회는 한도 + 1 에서 멈춘다 — 한도 2 에서 5건이면 3")
    void peakStopsAtLimitPlusOne() throws Exception {
        ReflectionTestUtils.setField(filter, "limitPerMinute", 2);
        sendReads(CLIENT_IP, 5);

        assertThat(filter.drainPeakPerIpCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("한도가 꺼져 있으면 세지 않으므로 최대 조회는 0 이다")
    void peakIsZeroWhenDisabled() throws Exception {
        ReflectionTestUtils.setField(filter, "limitPerMinute", 0);
        sendReads(CLIENT_IP, 5);

        assertThat(filter.drainPeakPerIpCount()).isZero();
    }

    @Test
    @DisplayName("여러 IP 가 동시에 조회해도 최대 조회가 더 작은 값으로 덮이지 않는다 — 라운드마다 8개 IP 가 함께 1건씩 보내도 가장 많이 쌓인 IP 의 창 건수가 남는다")
    void concurrentReadsKeepHighestPeak() throws Exception {
        // 확률적 가드 — 비교 없는 set 은 순차 테스트(drainReturnsHighestWindowCountAcrossIps)가 결정적으로 잡고, 이 테스트는
        // 'get 뒤 set(CAS 없음)' 을 절반쯤(로컬 5회 중 3회) 잡는다. 올바른 구현(CAS 비교 갱신)에서는 항상 통과한다.
        // 시계를 밀지 않으므로 모든 요청이 한 분 창 안이다(분 경계에서 20초 지난 시각에 고정). 한도는 쌓는 건수보다 넉넉히 크게 둔다.
        ReflectionTestUtils.setField(filter, "limitPerMinute", 10_000);
        int ipCount = 8;
        int rounds = 200;
        List<String> clientIps = new ArrayList<>();
        for (int ipIndex = 0; ipIndex < ipCount; ipIndex++) {
            String clientIp = "198.51.100." + (ipIndex + 1);
            clientIps.add(clientIp);
            // IP 마다 다른 건수(10·20·…·80)를 미리 쌓는다 — 가장 많이 쌓인 IP 는 마지막 IP(80건)다.
            sendReads(clientIp, (ipIndex + 1) * 10);
        }
        int highestWindowCount = ipCount * 10;
        assertThat(filter.drainPeakPerIpCount()).isEqualTo(highestWindowCount);

        ExecutorService executor = Executors.newFixedThreadPool(ipCount);
        CyclicBarrier startTogether = new CyclicBarrier(ipCount);
        try {
            for (int round = 1; round <= rounds; round++) {
                List<Future<?>> sends = new ArrayList<>();
                for (String clientIp : clientIps) {
                    sends.add(executor.submit(() -> {
                        startTogether.await(5, TimeUnit.SECONDS);
                        send("GET", CLUBS_PATH, clientIp);
                        return null;
                    }));
                }
                for (Future<?> send : sends) {
                    send.get(10, TimeUnit.SECONDS);
                }
                highestWindowCount++;

                assertThat(filter.drainPeakPerIpCount()).as("라운드 %d", round).isEqualTo(highestWindowCount);
            }
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    private void sendReads(String clientIp, int count) throws Exception {
        for (int requestIndex = 0; requestIndex < count; requestIndex++) {
            send("GET", CLUBS_PATH, clientIp);
        }
    }

    private MockHttpServletResponse send(String method, String path, String clientIp) throws Exception {
        return send(method, path, clientIp, new MockFilterChain());
    }

    private MockHttpServletResponse send(String method, String path, String clientIp, MockFilterChain chain)
            throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setRemoteAddr(clientIp);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);
        return response;
    }

    /** 테스트에서 손으로 미는 시계. */
    private static final class MutableClock extends Clock {

        private Instant now;

        private MutableClock(Instant start) {
            this.now = start;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("Asia/Seoul");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}

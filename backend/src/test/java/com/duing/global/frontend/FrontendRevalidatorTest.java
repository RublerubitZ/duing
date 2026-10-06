package com.duing.global.frontend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withUnauthorizedRequest;

import com.duing.global.monitoring.OpsSlackMessageFormatter;
import com.duing.global.monitoring.SlackNotifier;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

@ExtendWith(OutputCaptureExtension.class)
class FrontendRevalidatorTest {

    // 테스트 전용 더미 값 — 운영 주소·비밀값이 아니다.
    private static final String BASE_URL = "https://frontend.test";
    private static final String SECRET = "test-only-revalidate-secret-0123456789";
    private static final String REVALIDATE_URL = BASE_URL + "/api/internal/revalidate";
    private static final String FAILING_MESSAGE = "formatted-failing";
    private static final String RECOVERED_MESSAGE = "formatted-recovered";

    private final OpsSlackMessageFormatter formatter = mock(OpsSlackMessageFormatter.class);
    private final SlackNotifier slackNotifier = mock(SlackNotifier.class);
    private MockRestServiceServer mockServer;
    private FrontendRevalidator revalidator;

    @BeforeEach
    void setUp() {
        when(formatter.frontendRevalidationFailing(anyString(), anyInt(), anyString())).thenReturn(FAILING_MESSAGE);
        when(formatter.frontendRevalidationRecovered(anyString(), anyInt())).thenReturn(RECOVERED_MESSAGE);
        revalidator = revalidatorWith(new FrontendRevalidationProperties(BASE_URL, SECRET));
    }

    private FrontendRevalidator revalidatorWith(FrontendRevalidationProperties properties) {
        RestClient.Builder restClientBuilder = RestClient.builder().baseUrl(BASE_URL);
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        return new FrontendRevalidator(properties, restClientBuilder.build(), new ObjectMapper(),
                formatter, slackNotifier);
    }

    // 연속 실패는 재검증 POST 거절로 만든다 — 성공·warm-up 시도는 warm-up 앞에서 1초를 기다린다.
    private void expectRevalidationRejected(int attempts) {
        mockServer.expect(ExpectedCount.times(attempts), requestTo(REVALIDATE_URL))
                .andRespond(withUnauthorizedRequest());
    }

    private void expectRevalidationAccepted() {
        mockServer.expect(once(), requestTo(REVALIDATE_URL))
                .andRespond(withSuccess("{\"revalidated\":[\"/clubs\"]}", MediaType.APPLICATION_JSON));
    }

    private void expectSuccessfulAttempt() {
        expectRevalidationAccepted();
        mockServer.expect(once(), requestTo(BASE_URL + "/clubs")).andRespond(withSuccess());
    }

    private void revalidateClubs(int attempts) {
        for (int attempt = 0; attempt < attempts; attempt++) {
            revalidator.revalidate("/clubs");
        }
    }

    @Test
    @DisplayName("재검증 POST(비밀값·UA·본문)가 2xx 면 같은 경로를 GET 으로 미리 열고 캐시 상태를 남긴다")
    void postsRevalidationThenWarmsUp(CapturedOutput output) {
        mockServer.expect(once(), requestTo(REVALIDATE_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + SECRET))
                .andExpect(header(HttpHeaders.USER_AGENT, FrontendRevalidator.USER_AGENT))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().string("{\"paths\":[\"/clubs\"]}"))
                .andRespond(withSuccess("{\"revalidated\":[\"/clubs\"]}", MediaType.APPLICATION_JSON));
        mockServer.expect(once(), requestTo(BASE_URL + "/clubs"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header(HttpHeaders.USER_AGENT, FrontendRevalidator.USER_AGENT))
                .andRespond(withSuccess("<html></html>", MediaType.TEXT_HTML)
                        .header("x-vercel-cache", "STALE")
                        .header("age", "0"));

        revalidator.revalidate("/clubs");

        mockServer.verify();
        assertThat(output).contains("cache=STALE, age=0").doesNotContain(SECRET);
    }

    @Test
    @DisplayName("x-vercel-cache 없이 x-nextjs-cache 만 오면(로컬 next start) 그 값을 캐시 상태로 남긴다")
    void fallsBackToNextjsCacheHeader(CapturedOutput output) {
        mockServer.expect(once(), requestTo(REVALIDATE_URL))
                .andRespond(withSuccess("{\"revalidated\":[\"/clubs\"]}", MediaType.APPLICATION_JSON));
        mockServer.expect(once(), requestTo(BASE_URL + "/clubs"))
                .andRespond(withSuccess("<html></html>", MediaType.TEXT_HTML).header("x-nextjs-cache", "MISS"));

        revalidator.revalidate("/clubs");

        mockServer.verify();
        assertThat(output).contains("cache=MISS");
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(value = HttpStatus.class,
            names = {"PERMANENT_REDIRECT", "UNAUTHORIZED", "NOT_FOUND", "SERVICE_UNAVAILABLE"})
    @DisplayName("재검증 응답이 2xx 가 아니면(3xx 포함) warm-up 없이 예외 없이 끝낸다")
    void nonSuccessStatusSkipsWarmUp(HttpStatus status, CapturedOutput output) {
        mockServer.expect(once(), requestTo(REVALIDATE_URL)).andRespond(withStatus(status));

        assertThatCode(() -> revalidator.revalidate("/clubs")).doesNotThrowAnyException();

        mockServer.verify(); // warm-up GET 이 나갔다면 기대 밖 요청으로 실패한다
        assertThat(output).contains("HTTP_" + status.value()).doesNotContain(SECRET);
    }

    @Test
    @DisplayName("전송 오류(타임아웃·연결 실패)는 예외 없이 끝내고 warm-up 하지 않으며, 예외 메시지를 로그에 싣지 않는다")
    void transportFailureDoesNotThrow(CapturedOutput output) {
        mockServer.expect(once(), requestTo(REVALIDATE_URL))
                .andRespond(withException(new IOException("connect timed out")));

        assertThatCode(() -> revalidator.revalidate("/clubs")).doesNotThrowAnyException();

        mockServer.verify();
        assertThat(output).contains("ResourceAccessException").doesNotContain("connect timed out");
    }

    @Test
    @DisplayName("warm-up 이 실패해도 예외 없이 끝낸다")
    void warmUpFailureDoesNotThrow(CapturedOutput output) {
        mockServer.expect(once(), requestTo(REVALIDATE_URL))
                .andRespond(withSuccess("{\"revalidated\":[\"/clubs\"]}", MediaType.APPLICATION_JSON));
        mockServer.expect(once(), requestTo(BASE_URL + "/clubs")).andRespond(withServerError());

        assertThatCode(() -> revalidator.revalidate("/clubs")).doesNotThrowAnyException();

        mockServer.verify();
        assertThat(output).contains("HTTP_500");
    }

    @Test
    @DisplayName("재생성이 2회 연속 실패하면 알리지 않고, 3회째에 사유를 담아 한 번 알리며, 실패가 이어져도 다시 알리지 않는다")
    void alertsOnceWhenConsecutiveFailuresReachThreshold(CapturedOutput output) {
        expectRevalidationRejected(5);

        revalidateClubs(2);
        verifyNoInteractions(slackNotifier);

        revalidateClubs(1);
        verify(formatter).frontendRevalidationFailing("/clubs", 3, "HTTP_401");
        verify(slackNotifier).send(FAILING_MESSAGE);

        revalidateClubs(2);
        verifyNoMoreInteractions(slackNotifier);
        mockServer.verify();
        // Slack webhook 이 비어 있어도 추적되게 임계 도달은 로그로도 한 번 남긴다.
        assertThat(output).containsOnlyOnce("프론트 재생성 연속 실패 — path=/clubs, streak=3, reason=HTTP_401");
    }

    @Test
    @DisplayName("알림 사유는 상태 코드·예외 클래스명뿐이다 — 비밀값·Authorization·프론트 주소·예외 메시지를 싣지 않는다")
    void alertReasonCarriesNoSecretOrAddress() {
        // 전송 오류의 예외 메시지에는 요청 URL(프론트 주소)이 섞인다.
        mockServer.expect(ExpectedCount.times(3), requestTo(REVALIDATE_URL))
                .andRespond(withException(new IOException("connect timed out")));

        revalidateClubs(3);

        ArgumentCaptor<String> reasonCaptor = ArgumentCaptor.forClass(String.class);
        verify(formatter).frontendRevalidationFailing(eq("/clubs"), eq(3), reasonCaptor.capture());
        assertThat(reasonCaptor.getValue()).isEqualTo("ResourceAccessException")
                .doesNotContain(SECRET, "Bearer", "frontend.test", "connect timed out");
    }

    @Test
    @DisplayName("알림 뒤 성공하면 실패 횟수를 담아 복구를 한 번 알리고 0 부터 다시 센다 — 다시 3회 실패해야 알린다")
    void alertsRecoveryOnceAndRestartsCount() {
        expectRevalidationRejected(4);
        expectSuccessfulAttempt();
        expectRevalidationRejected(3);

        revalidateClubs(5);
        verify(formatter).frontendRevalidationRecovered("/clubs", 4);
        verify(slackNotifier).send(RECOVERED_MESSAGE);

        revalidateClubs(2);
        verify(slackNotifier, times(1)).send(FAILING_MESSAGE);

        revalidateClubs(1);
        mockServer.verify();
        verify(formatter, times(2)).frontendRevalidationFailing("/clubs", 3, "HTTP_401");
        verify(slackNotifier, times(2)).send(FAILING_MESSAGE);
        verify(slackNotifier, times(1)).send(RECOVERED_MESSAGE);
    }

    @Test
    @DisplayName("알림 전에 성공하면 복구를 알리지 않고 0 부터 다시 센다")
    void successBeforeAlertResetsCountSilently() {
        expectRevalidationRejected(2);
        expectSuccessfulAttempt();
        expectRevalidationRejected(2);

        // 실패 2 → 성공 → 실패 2: 성공에서 0 으로 돌아가지 않았다면 성공 뒤 첫 실패가 3회째라 알림이 나간다.
        revalidateClubs(5);

        mockServer.verify();
        verifyNoInteractions(slackNotifier);
    }

    @Test
    @DisplayName("재검증은 받았는데 warm-up 이 실패해도 연속 실패로 세고, 사유에 warm-up 을 붙인다")
    void warmUpFailureCountsAsFailure() {
        expectRevalidationRejected(2);
        expectRevalidationAccepted();
        mockServer.expect(once(), requestTo(BASE_URL + "/clubs")).andRespond(withServerError());

        revalidateClubs(3);

        mockServer.verify();
        verify(formatter).frontendRevalidationFailing("/clubs", 3, "warm-up HTTP_500");
        verify(slackNotifier).send(FAILING_MESSAGE);
    }

    @Test
    @DisplayName("예상 밖 런타임 예외로 끝난 시도도 예외 없이 끝내고 실패로 센다")
    void unexpectedRuntimeFailureCountsAsFailure() {
        expectRevalidationRejected(2);
        mockServer.expect(once(), requestTo(REVALIDATE_URL)).andRespond(request -> {
            throw new IllegalStateException("unexpected");
        });

        assertThatCode(() -> revalidateClubs(3)).doesNotThrowAnyException();

        verify(formatter).frontendRevalidationFailing("/clubs", 3, "IllegalStateException");
    }

    @Test
    @DisplayName("종료 중 인터럽트로 warm-up 을 건너뛴 시도는 성공도 실패도 아니다 — 세지도 0 으로 되돌리지도 않는다")
    void interruptedAttemptIsNeitherCountedNorReset() {
        expectRevalidationRejected(2);
        expectRevalidationAccepted();
        expectRevalidationRejected(1);

        revalidateClubs(2);
        Thread.currentThread().interrupt();
        boolean interruptRestored;
        try {
            revalidator.revalidate("/clubs");
        } finally {
            // 요청기가 인터럽트 상태를 되살렸는지 보면서, 다음 시도·다른 테스트로는 넘기지 않게 지운다.
            interruptRestored = Thread.interrupted();
        }
        assertThat(interruptRestored).isTrue();
        verifyNoInteractions(slackNotifier); // 실패로 셌다면 여기서 3회째 알림이 나갔다
        revalidateClubs(1);

        mockServer.verify(); // 인터럽트 시도에서 warm-up GET 이 나갔다면 기대 밖 요청으로 실패한다
        verify(formatter).frontendRevalidationFailing("/clubs", 3, "HTTP_401"); // 0 으로 되돌렸다면 1회째라 알림이 없다
        verify(slackNotifier).send(FAILING_MESSAGE);
    }

    @Test
    @DisplayName("알림 전송이 예외를 던져도 예외 없이 끝내고 카운터는 그대로 이어진다 — 예외 메시지는 로그에 싣지 않는다")
    void notifierFailureIsIsolated(CapturedOutput output) {
        doThrow(new IllegalStateException("slack down")).when(slackNotifier).send(anyString());
        expectRevalidationRejected(3);
        expectSuccessfulAttempt();

        assertThatCode(() -> revalidateClubs(4)).doesNotThrowAnyException();

        mockServer.verify();
        verify(formatter).frontendRevalidationRecovered("/clubs", 3);
        assertThat(output).contains("reason=IllegalStateException").doesNotContain("slack down");
    }

    @Test
    @DisplayName("연속 실패는 경로마다 따로 센다")
    void countsConsecutiveFailuresPerPath() {
        expectRevalidationRejected(4);

        revalidateClubs(2);
        revalidator.revalidate("/clubs/7");
        verifyNoInteractions(slackNotifier);
        revalidateClubs(1);

        mockServer.verify();
        verify(formatter).frontendRevalidationFailing("/clubs", 3, "HTTP_401");
        verify(formatter, never()).frontendRevalidationFailing(eq("/clubs/7"), anyInt(), anyString());
    }

    @Test
    @DisplayName("경로가 null 이어도(호출 오류) 예외 없이 끝내고 요청을 보내지 않는다")
    void nullPathDoesNotThrow() {
        assertThatCode(() -> revalidator.revalidate(null)).doesNotThrowAnyException();

        mockServer.verify();
        verifyNoInteractions(slackNotifier);
    }

    @Test
    @DisplayName("비활성이면 몇 번을 불러도 세지 않고 알리지 않는다")
    void disabledRevalidatorNeverAlerts() {
        revalidator = revalidatorWith(new FrontendRevalidationProperties(BASE_URL, ""));

        revalidateClubs(3);

        mockServer.verify();
        verifyNoInteractions(formatter, slackNotifier);
    }

    @Test
    @DisplayName("비밀값 앞뒤 공백·개행은 버린다 — 헤더에 개행이 섞이면 요청 자체가 실패한다")
    void stripsSecretWhitespaceBeforeSending() {
        FrontendRevalidator paddedRevalidator =
                revalidatorWith(new FrontendRevalidationProperties(BASE_URL, "  " + SECRET + "\n"));
        mockServer.expect(once(), requestTo(REVALIDATE_URL))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + SECRET))
                .andRespond(withUnauthorizedRequest());

        paddedRevalidator.revalidate("/clubs");

        mockServer.verify();
    }

    @ParameterizedTest(name = "[{index}] baseUrl={0}")
    @CsvSource(value = {
            "https://frontend.test, ''",
            "https://frontend.test, null",
            "https://frontend.test, '  '",
            "https://frontend.test, test-only-31-byte-secret-012345",
            "'', test-only-revalidate-secret-0123456789",
            "null, test-only-revalidate-secret-0123456789",
            "frontend.test, test-only-revalidate-secret-0123456789",
            "'https://frontend.test:abc', test-only-revalidate-secret-0123456789",
            "ftp://frontend.test, test-only-revalidate-secret-0123456789"
    }, nullValues = "null")
    @DisplayName("비밀값이 비었거나 32바이트 미만이거나, 주소가 비었거나 절대 http(s) 주소가 아니면 비활성 — 어떤 요청도 보내지 않는다")
    void disabledWhenBaseUrlOrSecretInvalid(String baseUrl, String secret) {
        FrontendRevalidator disabledRevalidator = revalidatorWith(new FrontendRevalidationProperties(baseUrl, secret));

        disabledRevalidator.revalidate("/clubs");

        mockServer.verify(); // 기대 요청 0건 — 요청이 나갔다면 AssertionError
    }

    @Test
    @DisplayName("설정 레코드는 값의 앞뒤 공백·개행을 버리고, toString 에 비밀값을 싣지 않는다")
    void propertiesStripWhitespaceAndMaskSecret() {
        FrontendRevalidationProperties padded =
                new FrontendRevalidationProperties(" " + BASE_URL + "\n", " " + SECRET + "\n");

        assertThat(padded.baseUrl()).isEqualTo(BASE_URL);
        assertThat(padded.revalidateSecret()).isEqualTo(SECRET);
        assertThat(padded.toString()).doesNotContain(SECRET);
    }

    @Test
    @DisplayName("주소 형식이 틀려도(포트 오타) RestClient 생성이 실패하지 않는다 — 부팅을 깨지 않고 비활성이 된다")
    void malformedBaseUrlDoesNotBreakClientCreation() {
        FrontendRevalidationProperties malformed =
                new FrontendRevalidationProperties("https://frontend.test:abc", SECRET);

        assertThat(malformed.enabled()).isFalse();
        assertThatCode(() -> new FrontendRevalidationClientConfig().frontendRevalidationRestClient(malformed))
                .doesNotThrowAnyException();
    }
}

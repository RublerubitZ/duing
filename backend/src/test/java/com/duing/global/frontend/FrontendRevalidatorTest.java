package com.duing.global.frontend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
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

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

@ExtendWith(OutputCaptureExtension.class)
class FrontendRevalidatorTest {

    // 테스트 전용 더미 값 — 운영 주소·비밀값이 아니다.
    private static final String BASE_URL = "https://frontend.test";
    private static final String SECRET = "test-only-revalidate-secret-0123456789";
    private static final String REVALIDATE_URL = BASE_URL + "/api/internal/revalidate";

    private MockRestServiceServer mockServer;
    private FrontendRevalidator revalidator;

    @BeforeEach
    void setUp() {
        revalidator = revalidatorWith(new FrontendRevalidationProperties(BASE_URL, SECRET));
    }

    private FrontendRevalidator revalidatorWith(FrontendRevalidationProperties properties) {
        RestClient.Builder restClientBuilder = RestClient.builder().baseUrl(BASE_URL);
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        return new FrontendRevalidator(properties, restClientBuilder.build(), new ObjectMapper());
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
                .andRespond(withSuccess("<html></html>", MediaType.TEXT_HTML).header("x-vercel-cache", "STALE"));

        revalidator.revalidate("/clubs");

        mockServer.verify();
        assertThat(output).contains("cache=STALE").doesNotContain(SECRET);
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
            "'', test-only-revalidate-secret-0123456789",
            "null, test-only-revalidate-secret-0123456789",
            "frontend.test, test-only-revalidate-secret-0123456789",
            "'https://frontend.test:abc', test-only-revalidate-secret-0123456789",
            "ftp://frontend.test, test-only-revalidate-secret-0123456789"
    }, nullValues = "null")
    @DisplayName("비밀값이 비었거나 주소가 비었거나 절대 http(s) 주소가 아니면 비활성 — 어떤 요청도 보내지 않는다")
    void disabledWhenBaseUrlOrSecretBlank(String baseUrl, String secret) {
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

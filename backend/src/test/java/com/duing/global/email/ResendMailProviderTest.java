package com.duing.global.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withTooManyRequests;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

class ResendMailProviderTest {

    private static final EmailMessage MESSAGE =
            new EmailMessage("hong@daegu.ac.kr", "[Du-ing] 이메일 인증 코드", "<p>123456</p>");

    private MockRestServiceServer mockServer;
    private ResendMailProvider resendMailProvider;

    @BeforeEach
    void setUp() {
        ResendProperties resendProperties = new ResendProperties("test-api-key", "Du-ing <noreply@duings.com>");
        RestClient.Builder restClientBuilder = RestClient.builder()
                .baseUrl("https://api.resend.com")
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + resendProperties.apiKey());
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        resendMailProvider = new ResendMailProvider(restClientBuilder.build(), resendProperties);
    }

    @Test
    @DisplayName("발송 성공 시 Resend API 에 from/to/subject/html 이 담긴 POST 요청을 보낸다")
    void sendPostsEmailPayloadToResend() {
        mockServer.expect(requestTo("https://api.resend.com/emails"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer test-api-key"))
                .andExpect(jsonPath("$.from").value("Du-ing <noreply@duings.com>"))
                .andExpect(jsonPath("$.to[0]").value("hong@daegu.ac.kr"))
                .andExpect(jsonPath("$.subject").value("[Du-ing] 이메일 인증 코드"))
                .andExpect(jsonPath("$.html").value("<p>123456</p>"))
                .andRespond(withSuccess("{\"id\":\"email-id\"}", MediaType.APPLICATION_JSON));

        assertThatCode(() -> resendMailProvider.send(MESSAGE)).doesNotThrowAnyException();
        mockServer.verify();
        assertThat(resendMailProvider.name()).isEqualTo("Resend");
    }

    @Test
    @DisplayName("429(레이트리밋·쿼터 소진) 응답은 재시도 가능한 실패로 분류한다")
    void classifiesTooManyRequestsAsRetryable() {
        mockServer.expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withTooManyRequests());

        assertThatThrownBy(() -> resendMailProvider.send(MESSAGE))
                .isInstanceOfSatisfying(MailProviderException.class, sendFailure -> {
                    assertThat(sendFailure.isRetryable()).isTrue();
                    assertThat(sendFailure.reason()).isEqualTo("429");
                });
    }

    @Test
    @DisplayName("5xx(Provider 장애) 응답은 재시도 가능한 실패로 분류한다")
    void classifiesServerErrorAsRetryable() {
        mockServer.expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> resendMailProvider.send(MESSAGE))
                .isInstanceOfSatisfying(MailProviderException.class, sendFailure -> {
                    assertThat(sendFailure.isRetryable()).isTrue();
                    assertThat(sendFailure.reason()).isEqualTo("500");
                });
    }

    @Test
    @DisplayName("429 를 제외한 4xx(잘못된 요청) 응답은 재시도 불가 실패로 분류한다")
    void classifiesClientErrorAsNonRetryable() {
        mockServer.expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withBadRequest());

        assertThatThrownBy(() -> resendMailProvider.send(MESSAGE))
                .isInstanceOfSatisfying(MailProviderException.class, sendFailure -> {
                    assertThat(sendFailure.isRetryable()).isFalse();
                    assertThat(sendFailure.reason()).isEqualTo("400");
                });
    }

    @Test
    @DisplayName("읽기 타임아웃은 재시도 가능한 실패(TIMEOUT)로 분류한다")
    void classifiesTimeoutAsRetryable() {
        mockServer.expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withException(new SocketTimeoutException("read timed out")));

        assertThatThrownBy(() -> resendMailProvider.send(MESSAGE))
                .isInstanceOfSatisfying(MailProviderException.class, sendFailure -> {
                    assertThat(sendFailure.isRetryable()).isTrue();
                    assertThat(sendFailure.reason()).isEqualTo("TIMEOUT");
                });
    }

    @Test
    @DisplayName("연결 실패 등 네트워크 오류는 재시도 가능한 실패(NETWORK)로 분류한다")
    void classifiesNetworkFailureAsRetryable() {
        mockServer.expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withException(new ConnectException("connection refused")));

        assertThatThrownBy(() -> resendMailProvider.send(MESSAGE))
                .isInstanceOfSatisfying(MailProviderException.class, sendFailure -> {
                    assertThat(sendFailure.isRetryable()).isTrue();
                    assertThat(sendFailure.reason()).isEqualTo("NETWORK");
                });
    }

    @Test
    @DisplayName("HTTP 응답·네트워크로 분류되지 않는 클라이언트 오류는 재시도 불가 실패로 분류한다")
    void classifiesUnknownClientFailureAsNonRetryable() {
        RestClient throwingRestClient = RestClient.builder()
                .baseUrl("https://api.resend.com")
                .requestInterceptor((request, body, execution) -> {
                    throw new RestClientException("직렬화 실패 등 클라이언트 내부 오류");
                })
                .build();
        ResendMailProvider brokenProvider = new ResendMailProvider(
                throwingRestClient, new ResendProperties("test-api-key", "Du-ing <noreply@duings.com>"));

        assertThatThrownBy(() -> brokenProvider.send(MESSAGE))
                .isInstanceOfSatisfying(MailProviderException.class, sendFailure -> {
                    assertThat(sendFailure.isRetryable()).isFalse();
                    assertThat(sendFailure.reason()).isEqualTo("CLIENT");
                });
    }
}

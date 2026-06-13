package com.duing.global.email;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.duing.global.email.exception.EmailException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class ResendEmailSenderTest {

    private MockRestServiceServer mockServer;
    private ResendEmailSender resendEmailSender;

    @BeforeEach
    void setUp() {
        ResendProperties resendProperties = new ResendProperties("test-api-key", "Du-ing <noreply@duings.com>");
        RestClient.Builder restClientBuilder = RestClient.builder()
                .baseUrl("https://api.resend.com")
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + resendProperties.apiKey());
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        resendEmailSender = new ResendEmailSender(restClientBuilder.build(), resendProperties);
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

        assertThatCode(() -> resendEmailSender.send(
                new EmailMessage("hong@daegu.ac.kr", "[Du-ing] 이메일 인증 코드", "<p>123456</p>")))
                .doesNotThrowAnyException();
        mockServer.verify();
    }

    @Test
    @DisplayName("Resend 가 5xx 를 반환하면 EmailException.SendFailedException 으로 변환된다")
    void sendConvertsServerErrorToSendFailedException() {
        mockServer.expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> resendEmailSender.send(
                new EmailMessage("hong@daegu.ac.kr", "제목", "<p>본문</p>")))
                .isInstanceOf(EmailException.SendFailedException.class);
    }
}

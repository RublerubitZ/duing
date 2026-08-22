package com.duing.global.monitoring;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class SlackNotifierTest {

    // 더미 URL — 실제 워크스페이스 경로가 아니다.
    private static final String WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/TEST";

    private MockRestServiceServer mockServer;
    private SlackNotifier slackNotifier;

    @BeforeEach
    void setUp() {
        RestClient.Builder restClientBuilder = RestClient.builder().baseUrl(WEBHOOK_URL);
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        slackNotifier = new SlackNotifier(new SlackProperties(WEBHOOK_URL), restClientBuilder.build(), new ObjectMapper());
    }

    @Test
    @DisplayName("webhook URL 로 {\"text\": ...} JSON 을 POST 한다")
    void sendsTextPayloadToWebhook() {
        mockServer.expect(once(), requestTo(WEBHOOK_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.text").value("🟢 신규 회원 가입\n이름: 홍길동"))
                .andExpect(content().json("{\"text\":\"🟢 신규 회원 가입\\n이름: 홍길동\"}"))
                .andRespond(withSuccess("ok", MediaType.TEXT_PLAIN));

        slackNotifier.send("🟢 신규 회원 가입\n이름: 홍길동");

        mockServer.verify();
    }

    @Test
    @DisplayName("5xx 응답이면 정확히 1회 재시도하고(총 2회) 그래도 실패하면 예외 없이 포기한다")
    void retriesOnceOnServerErrorThenGivesUp() {
        mockServer.expect(times(2), requestTo(WEBHOOK_URL)).andRespond(withServerError());

        assertThatCode(() -> slackNotifier.send("x")).doesNotThrowAnyException();

        mockServer.verify();
    }

    @Test
    @DisplayName("429 응답도 1회 재시도 대상이다 — 재시도가 성공하면 그걸로 끝난다")
    void retriesOnceOnTooManyRequests() {
        mockServer.expect(once(), requestTo(WEBHOOK_URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        mockServer.expect(once(), requestTo(WEBHOOK_URL)).andRespond(withSuccess("ok", MediaType.TEXT_PLAIN));

        assertThatCode(() -> slackNotifier.send("x")).doesNotThrowAnyException();

        mockServer.verify();
    }

    @Test
    @DisplayName("그 외 4xx(잘못된 요청·폐기된 webhook)는 재시도하지 않고 예외 없이 종료한다")
    void doesNotRetryOnClientError() {
        mockServer.expect(once(), requestTo(WEBHOOK_URL)).andRespond(withBadRequest());

        assertThatCode(() -> slackNotifier.send("x")).doesNotThrowAnyException();

        mockServer.verify();
    }

    @Test
    @DisplayName("타임아웃·네트워크 오류는 요청이 이미 도달했을 수 있어 재시도하지 않는다(중복 게시 방지)")
    void doesNotRetryOnTransportFailure() {
        mockServer.expect(once(), requestTo(WEBHOOK_URL))
                .andRespond(withException(new IOException("Read timed out")));

        assertThatCode(() -> slackNotifier.send("x")).doesNotThrowAnyException();

        mockServer.verify();
    }

    @Test
    @DisplayName("webhook URL 이 비어 있으면 비활성 — 어떤 요청도 보내지 않는다(로컬·CI)")
    void disabledWhenWebhookUrlBlank() {
        RestClient.Builder restClientBuilder = RestClient.builder().baseUrl("http://localhost:0/slack-disabled");
        MockRestServiceServer disabledServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        SlackNotifier disabledNotifier = new SlackNotifier(new SlackProperties(""), restClientBuilder.build(), new ObjectMapper());

        disabledNotifier.send("x");

        disabledServer.verify(); // 기대 요청 0건 — 요청이 나갔다면 AssertionError
    }
}

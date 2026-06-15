package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import io.sentry.Hint;
import io.sentry.SentryEvent;
import io.sentry.SentryOptions;
import io.sentry.protocol.Request;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SentryConfigTest {

    private final SentryOptions.BeforeSendCallback beforeSend = new SentryConfig().sentryBeforeSend();

    @Test
    @DisplayName("이벤트 전송 직전 요청 쿼리스트링을 제거해 PII(검색어·이메일 등)가 Sentry 로 새지 않는다")
    void scrubsRequestQueryString() {
        // given: PII 가 담긴 쿼리스트링을 가진 요청이 붙은 이벤트
        SentryEvent event = new SentryEvent();
        Request request = new Request();
        request.setQueryString("q=홍길동&email=test@duing.ac.kr");
        event.setRequest(request);

        // when
        SentryEvent result = beforeSend.execute(event, new Hint());

        // then
        assertThat(result).isNotNull();
        assertThat(result.getRequest().getQueryString()).isNull();
    }

    @Test
    @DisplayName("요청 정보가 없는 이벤트도 예외 없이 그대로 통과시킨다")
    void passesThroughEventWithoutRequest() {
        // given: request 가 없는 이벤트
        SentryEvent event = new SentryEvent();

        // when
        SentryEvent result = beforeSend.execute(event, new Hint());

        // then
        assertThat(result).isNotNull();
    }
}

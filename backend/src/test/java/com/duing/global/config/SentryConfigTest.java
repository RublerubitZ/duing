package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import io.sentry.Breadcrumb;
import io.sentry.Hint;
import io.sentry.SentryEvent;
import io.sentry.SentryOptions;
import io.sentry.protocol.Request;
import java.util.HashMap;
import java.util.Map;
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

    @Test
    @DisplayName("실IP 를 담는 헤더(Cf-Connecting-Ip·True-Client-Ip·X-Client-Ip)는 지우고 User-Agent 는 남긴다")
    void removesClientIpHeaders() {
        SentryEvent event = new SentryEvent();
        Request request = new Request();
        request.setHeaders(new HashMap<>(Map.of(
                "Cf-Connecting-Ip", "198.51.100.7",
                "True-Client-Ip", "198.51.100.7",
                "X-Client-Ip", "198.51.100.7",
                "User-Agent", "Mozilla/5.0")));
        event.setRequest(request);

        SentryEvent result = beforeSend.execute(event, new Hint());

        assertThat(result.getRequest().getHeaders()).containsOnlyKeys("User-Agent");
    }

    @Test
    @DisplayName("공개 가입 코드 경로의 코드 값을 가리고 동아리 하위 가입 코드 경로는 그대로 둔다")
    void masksPublicJoinCodeInUrl() {
        SentryEvent publicCodeEvent = eventWithUrl("https://api.duings.com/api/v1/join-codes/ABC123/requests");
        SentryEvent clubScopedEvent = eventWithUrl("https://api.duings.com/api/v1/clubs/1/join-codes/active");

        assertThat(beforeSend.execute(publicCodeEvent, new Hint()).getRequest().getUrl())
                .isEqualTo("https://api.duings.com/api/v1/join-codes/[Filtered]/requests");
        assertThat(beforeSend.execute(clubScopedEvent, new Hint()).getRequest().getUrl())
                .isEqualTo("https://api.duings.com/api/v1/clubs/1/join-codes/active");
    }

    @Test
    @DisplayName("트랜잭션 이름의 가입 코드도 가리고 패턴형 {code} 는 그대로 둔다")
    void masksJoinCodeInTransactionName() {
        SentryEvent rawPathEvent = new SentryEvent();
        rawPathEvent.setTransaction("POST /api/v1/join-codes/ABC123/requests");
        SentryEvent patternEvent = new SentryEvent();
        patternEvent.setTransaction("GET /api/v1/join-codes/{code}");

        assertThat(beforeSend.execute(rawPathEvent, new Hint()).getTransaction())
                .isEqualTo("POST /api/v1/join-codes/[Filtered]/requests");
        assertThat(beforeSend.execute(patternEvent, new Hint()).getTransaction())
                .isEqualTo("GET /api/v1/join-codes/{code}");
    }

    @Test
    @DisplayName("브레드크럼 url 의 가입 코드도 가린다")
    void masksJoinCodeInBreadcrumbUrl() {
        SentryEvent event = new SentryEvent();
        event.addBreadcrumb(Breadcrumb.http("/api/v1/join-codes/ABC123", "GET"));

        SentryEvent result = beforeSend.execute(event, new Hint());

        assertThat(result.getBreadcrumbs().get(0).getData("url")).isEqualTo("/api/v1/join-codes/[Filtered]");
    }

    private static SentryEvent eventWithUrl(String url) {
        SentryEvent event = new SentryEvent();
        Request request = new Request();
        request.setUrl(url);
        event.setRequest(request);
        return event;
    }
}

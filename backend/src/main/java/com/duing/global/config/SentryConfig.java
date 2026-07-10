package com.duing.global.config;

import io.sentry.SentryOptions;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SentryConfig {

    /**
     * Sentry 이벤트 전송 직전 요청 쿼리스트링을 제거한다.
     *
     * <p>{@code send-default-pii=false} 는 헤더·쿠키·바디·클라이언트 IP 의 자동 첨부만 막고,
     * 요청 URL 의 쿼리스트링은 그대로 이벤트에 실린다. 관리자 회원 검색({@code q=학번/이름}) 처럼
     * PII 가 쿼리 파라미터로 전달되는 엔드포인트가 5xx 로 떨어지면 그 PII 가 Sentry 로 유출되므로,
     * 전송 직전 쿼리스트링을 일괄 제거한다.
     */
    @Bean
    public SentryOptions.BeforeSendCallback sentryBeforeSend() {
        return (event, hint) -> {
            if (event.getRequest() != null) {
                event.getRequest().setQueryString(null);
            }
            return event;
        };
    }
}

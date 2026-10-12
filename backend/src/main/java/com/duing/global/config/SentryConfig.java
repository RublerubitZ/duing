package com.duing.global.config;

import io.sentry.SentryOptions;
import io.sentry.protocol.Request;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SentryConfig {

    // 프론트 sentry-scrub.ts 와 같은 기준 — 이름에 "-ip" 가 든 헤더(cf-connecting-ip·true-client-ip·x-client-ip·
    // cf-connecting-ipv6 등)를 지운다. X-Forwarded-For·X-Real-Ip·Forwarded 는 SDK 가 이미 뺀다(#1322 F-3).
    private static final Pattern CLIENT_IP_HEADER = Pattern.compile("-ip", Pattern.CASE_INSENSITIVE);
    // 공개 가입 코드 경로의 코드 값 — 코드만 알면 가입 요청을 보낼 수 있는 비밀값이다. 동아리 하위
    // /clubs/{id}/join-codes/... 는 앞부분이 달라 맞지 않고, 패턴형 {code}(트랜잭션 이름)는 그대로 둔다.
    private static final Pattern JOIN_CODE_PATH = Pattern.compile("(/api/v1/join-codes/)(?!\\{)[^/?#\\s]+");
    private static final String JOIN_CODE_REPLACEMENT = "$1[Filtered]";

    /**
     * Sentry 이벤트 전송 직전 요청 쿼리스트링을 제거한다.
     *
     * <p>{@code send-default-pii=false} 는 헤더·쿠키·바디·클라이언트 IP 의 자동 첨부만 막고,
     * 요청 URL 의 쿼리스트링은 그대로 이벤트에 실린다. 관리자 회원 검색({@code q=학번/이름}) 처럼
     * PII 가 쿼리 파라미터로 전달되는 엔드포인트가 5xx 로 떨어지면 그 PII 가 Sentry 로 유출되므로,
     * 전송 직전 쿼리스트링을 일괄 제거한다.
     *
     * <p>실IP 를 담는 헤더도 지우고, 요청 URL·트랜잭션 이름·브레드크럼 url 의 공개 가입 코드 값을
     * 가린다(#1322 F-3).
     */
    @Bean
    public SentryOptions.BeforeSendCallback sentryBeforeSend() {
        return (event, hint) -> {
            Request request = event.getRequest();
            if (request != null) {
                request.setQueryString(null);
                request.setUrl(maskJoinCode(request.getUrl()));
                request.setHeaders(withoutClientIpHeaders(request.getHeaders()));
            }
            event.setTransaction(maskJoinCode(event.getTransaction()));
            if (event.getBreadcrumbs() != null) {
                // SentrySpringFilter 가 요청마다 원시 URI 로 http 브레드크럼을 남긴다.
                event.getBreadcrumbs().forEach(breadcrumb -> {
                    if (breadcrumb.getData("url") instanceof String breadcrumbUrl) {
                        breadcrumb.setData("url", maskJoinCode(breadcrumbUrl));
                    }
                });
            }
            return event;
        };
    }

    private static String maskJoinCode(String value) {
        return value == null ? null : JOIN_CODE_PATH.matcher(value).replaceAll(JOIN_CODE_REPLACEMENT);
    }

    private static Map<String, String> withoutClientIpHeaders(Map<String, String> headers) {
        if (headers == null) {
            return null;
        }
        Map<String, String> keptHeaders = new HashMap<>(headers);
        keptHeaders.keySet().removeIf(headerName -> CLIENT_IP_HEADER.matcher(headerName).find());
        return keptHeaders;
    }
}

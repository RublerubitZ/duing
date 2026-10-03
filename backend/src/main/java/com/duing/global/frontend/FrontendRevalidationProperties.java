package com.duing.global.frontend;

import java.net.URI;
import java.net.URISyntaxException;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 프론트(Next.js) 페이지 재생성 트리거 설정 — {@link FrontendRevalidationClientConfig} 가 등록한다.
 * 비밀값은 환경변수로만 주입하며, Vercel {@code REVALIDATE_SECRET} 과 같은 값이다.
 *
 * <p>{@code @Validated} 를 쓰지 않는다 — 빈 비밀값이 "비활성(로컬·CI)" 이라는 정상 상태이기 때문이다
 * ({@code SlackProperties} 관례). 운영도 {@code ${DUING_FRONTEND_REVALIDATE_SECRET:}} 로 폴백을 둔다 — 미설정이면
 * 부팅 실패가 아니라 비활성이고, {@link FrontendRevalidator} 가 부팅 직후 WARN 으로 드러낸다.
 *
 * <p>값의 앞뒤 공백·개행은 버린다 — .env 붙여넣기로 붙은 개행이 헤더에 섞이면 요청 자체가 실패한다.
 * base-url 이 호스트 있는 절대 http(s) 주소가 아니면 비활성이다 — 포트 오타 같은 형식 오류는 RestClient 생성 때
 * 예외로 부팅을 깨므로, 비활성으로 돌려 부팅 직후 WARN 으로 드러낸다.
 */
@ConfigurationProperties(prefix = "duing.frontend")
public record FrontendRevalidationProperties(String baseUrl, String revalidateSecret) {

    public FrontendRevalidationProperties {
        baseUrl = baseUrl == null ? null : baseUrl.strip();
        revalidateSecret = revalidateSecret == null ? null : revalidateSecret.strip();
    }

    public boolean enabled() {
        return revalidateSecret != null && !revalidateSecret.isEmpty() && isAbsoluteHttpUrl(baseUrl);
    }

    private static boolean isAbsoluteHttpUrl(String url) {
        if (url == null || url.isEmpty()) {
            return false;
        }
        try {
            URI uri = new URI(url);
            // 포트가 숫자가 아니면 java.net.URI 는 예외 대신 호스트 없는(registry 기반) 주소로 해석한다 — host null 로 걸러진다.
            boolean httpScheme = "http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme());
            return httpScheme && uri.getHost() != null;
        } catch (URISyntaxException malformed) {
            return false;
        }
    }

    /** 비밀값이 로그·예외 메시지에 실리지 않게 가린다(레코드 기본 toString 은 모든 필드를 찍는다). */
    @Override
    public String toString() {
        return "FrontendRevalidationProperties[baseUrl=" + baseUrl + ", revalidateSecret=***]";
    }
}

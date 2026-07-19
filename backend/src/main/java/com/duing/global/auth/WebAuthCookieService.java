package com.duing.global.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 웹 인증 쿠키 3종(access·refresh·auth_hint) 발급/삭제 (spec §10).
 * rememberMe=false 면 3종 모두 세션 쿠키(Max-Age 미기록) — refresh 만 내리면 브라우저 재시작 후
 * access 잔여 수명과 hint 가 "종료 시 로그아웃" 약속을 깨기 때문 (spec §10.1).
 */
@Component
public class WebAuthCookieService {
    public static final String ACCESS_COOKIE_NAME = "__Host-duing_access_token";
    public static final String REFRESH_COOKIE_NAME = "__Secure-duing_refresh_token";
    public static final String AUTH_HINT_COOKIE_NAME = "auth_hint";
    /** __Host- 는 Path=/ 를 강제하므로 경로 스코프(auth 전용 전송)엔 __Secure- 프리픽스를 쓴다. */
    public static final String REFRESH_COOKIE_PATH = "/api/v1/auth";
    private static final String PRODUCTION_HINT_COOKIE_DOMAIN = ".duings.com";
    private static final long SESSION_COOKIE = -1L; // 음수 Max-Age = 속성 미기록(브라우저 세션 쿠키)

    private final AuthHintTokenProvider authHintTokenProvider;
    private final JwtTokenProvider jwtTokenProvider;
    private final String hintCookieDomain;
    private final long refreshMaxAgeSeconds;

    public WebAuthCookieService(
            AuthHintTokenProvider authHintTokenProvider,
            JwtTokenProvider jwtTokenProvider,
            @Value("${web-auth.hint-cookie-domain:}") String hintCookieDomain,
            @Value("${duing.auth.refresh.ttl-days:30}") int refreshTtlDays,
            Environment environment) {
        if (environment.acceptsProfiles(Profiles.of("prod"))
                && !PRODUCTION_HINT_COOKIE_DOMAIN.equals(hintCookieDomain)) {
            throw new IllegalStateException(
                    "운영 AUTH_HINT_COOKIE_DOMAIN은 정확히 .duings.com이어야 합니다.");
        }
        this.authHintTokenProvider = authHintTokenProvider;
        this.jwtTokenProvider = jwtTokenProvider;
        this.hintCookieDomain = hintCookieDomain;
        this.refreshMaxAgeSeconds = refreshTtlDays * 86_400L;
    }

    public void issue(
            HttpServletRequest request,
            HttpServletResponse response,
            String accessToken,
            String refreshToken,
            String role,
            boolean rememberMe) {
        requireSecureOrLocalhost(request);
        add(response, accessCookie(accessToken,
                rememberMe ? jwtTokenProvider.expirySeconds() : SESSION_COOKIE));
        add(response, refreshCookie(refreshToken, rememberMe ? refreshMaxAgeSeconds : SESSION_COOKIE));
        add(response, hintCookie(authHintTokenProvider.create(role),
                rememberMe ? refreshMaxAgeSeconds : SESSION_COOKIE));
    }

    public void clear(HttpServletResponse response) {
        add(response, accessCookie("", 0));
        add(response, refreshCookie("", 0));
        add(response, hintCookie("", 0));
    }

    private ResponseCookie accessCookie(String value, long maxAgeSeconds) {
        return baseCookie(ACCESS_COOKIE_NAME, value, "/", maxAgeSeconds).build();
    }

    private ResponseCookie refreshCookie(String value, long maxAgeSeconds) {
        return baseCookie(REFRESH_COOKIE_NAME, value, REFRESH_COOKIE_PATH, maxAgeSeconds).build();
    }

    private ResponseCookie hintCookie(String value, long maxAgeSeconds) {
        ResponseCookie.ResponseCookieBuilder builder =
                baseCookie(AUTH_HINT_COOKIE_NAME, value, "/", maxAgeSeconds);
        if (StringUtils.hasText(hintCookieDomain)) {
            builder.domain(hintCookieDomain);
        }
        return builder.build();
    }

    private ResponseCookie.ResponseCookieBuilder baseCookie(
            String name, String value, String path, long maxAgeSeconds) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path(path)
                .maxAge(maxAgeSeconds);
    }

    private void requireSecureOrLocalhost(HttpServletRequest request) {
        if (!request.isSecure() && !"localhost".equalsIgnoreCase(request.getServerName())) {
            throw new IllegalStateException("웹 인증 Cookie는 HTTPS 또는 localhost에서만 발급할 수 있습니다.");
        }
    }

    private void add(HttpServletResponse response, ResponseCookie cookie) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}

package com.duing.global.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@RequiredArgsConstructor
public class WebAuthCookieService {
    public static final String ACCESS_COOKIE_NAME = "__Host-duing_access_token";
    public static final String AUTH_HINT_COOKIE_NAME = "auth_hint";

    private final AuthHintTokenProvider authHintTokenProvider;

    @Value("${web-auth.hint-cookie-domain:}")
    private String hintCookieDomain;

    public void issue(
            HttpServletRequest request,
            HttpServletResponse response,
            String accessToken,
            String role) {
        requireSecureOrLocalhost(request);
        long maxAgeSeconds = authHintTokenProvider.maxAgeSeconds();
        add(response, accessCookie(accessToken, maxAgeSeconds));
        add(response, hintCookie(authHintTokenProvider.create(role), maxAgeSeconds));
    }

    public void clear(HttpServletResponse response) {
        add(response, accessCookie("", 0));
        add(response, hintCookie("", 0));
    }

    private ResponseCookie accessCookie(String value, long maxAgeSeconds) {
        return baseCookie(ACCESS_COOKIE_NAME, value, maxAgeSeconds).build();
    }

    private ResponseCookie hintCookie(String value, long maxAgeSeconds) {
        ResponseCookie.ResponseCookieBuilder builder =
                baseCookie(AUTH_HINT_COOKIE_NAME, value, maxAgeSeconds);
        if (StringUtils.hasText(hintCookieDomain)) {
            builder.domain(hintCookieDomain);
        }
        return builder.build();
    }

    private ResponseCookie.ResponseCookieBuilder baseCookie(
            String name, String value, long maxAgeSeconds) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ofSeconds(maxAgeSeconds));
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

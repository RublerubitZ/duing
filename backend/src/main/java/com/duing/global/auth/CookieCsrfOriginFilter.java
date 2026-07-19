package com.duing.global.auth;

import com.duing.global.response.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@RequiredArgsConstructor
public class CookieCsrfOriginFilter extends OncePerRequestFilter {

    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String FORBIDDEN_MESSAGE = "허용되지 않은 요청 출처입니다.";

    private final CorsConfigurationSource corsConfigurationSource;
    private final ObjectMapper objectMapper;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (!requiresOrigin(request) || isAllowedOrigin(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getWriter(), ApiResponse.error(FORBIDDEN_MESSAGE));
    }

    private boolean requiresOrigin(HttpServletRequest request) {
        if (SAFE_METHODS.contains(request.getMethod())) {
            return false;
        }
        if (isWebAuthPath(request.getRequestURI())) {
            return true;
        }
        if (hasBearer(request)) {
            return false;
        }
        return hasCookie(request, WebAuthCookieService.ACCESS_COOKIE_NAME);
    }

    private boolean isAllowedOrigin(HttpServletRequest request) {
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        if (!StringUtils.hasText(origin)) {
            return false;
        }
        CorsConfiguration corsConfiguration = corsConfigurationSource.getCorsConfiguration(request);
        return corsConfiguration != null && corsConfiguration.checkOrigin(origin) != null;
    }

    // 웹 인증 경로(쿠키 기반)만 Origin 을 강제한다. 바디 기반 /api/v1/auth/refresh 는 여기서 제외 —
    // 리프레시 토큰이 httpOnly 쿠키라 JS 가 읽을 수 없고, 브라우저발 CSRF 로는 토큰을 바디에 실을 수
    // 없으므로 Origin 강제 없이도 안전하다 (spec §14).
    private boolean isWebAuthPath(String uri) {
        return uri.equals("/api/v1/auth/web/login")
                || uri.equals("/api/v1/auth/web/logout")
                || uri.equals("/api/v1/auth/web/refresh");
    }

    private boolean hasBearer(HttpServletRequest request) {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        return StringUtils.hasText(authorization)
                && authorization.startsWith(BEARER_PREFIX)
                && StringUtils.hasText(authorization.substring(BEARER_PREFIX.length()));
    }

    private boolean hasCookie(HttpServletRequest request, String cookieName) {
        if (request.getCookies() == null) {
            return false;
        }
        for (Cookie cookie : request.getCookies()) {
            if (cookieName.equals(cookie.getName()) && StringUtils.hasText(cookie.getValue())) {
                return true;
            }
        }
        return false;
    }
}

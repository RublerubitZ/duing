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
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.PathContainer;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

@Component
@RequiredArgsConstructor
public class CookieCsrfOriginFilter extends OncePerRequestFilter {

    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    private static final Set<String> AUDITED_READ_METHODS = Set.of("GET", "HEAD");

    // 열람만으로 감사 행을 쓰는 GET(번호 열람·명단·총동연 열람) — SameSite=Lax 쿠키는 교차 사이트 톱레벨 이동에 실리므로,
    // 쿠키 인증일 때는 상태 변경 요청처럼 허용 Origin 을 요구한다(#1321 L-1). 열람만으로 감사 행을 쓰는 GET 을 새로
    // 만들거나 경로를 바꾸면 이 목록도 함께 바꾼다(CookieCsrfOriginFilterMappingTest 는 경로 이름 변경만 잡는다). {batchId}·{clubId} 는 candidates·dashboard 에도
    // 맞지만 더 막는 쪽이라 그대로 둔다(둘 다 프론트 fetch 라 Origin 이 실린다).
    static final List<String> AUDITED_READ_PATHS = List.of(
            "/api/v1/clubs/{clubId}/members/export",
            "/api/v1/clubs/{clubId}/members/{memberId}/phone",
            "/api/v1/leader/applications/{applicationId}/phone",
            "/api/v1/clubs/{clubId}/join-requests/{joinRequestId}/phone",
            "/api/v1/admin/users/{userId}/phone",
            "/api/v1/admin/facility-bookings/submission/{batchId}",
            "/api/v1/admin/facility-bookings/submission/{batchId}/csv",
            "/api/v1/admin/applications/{applicationId}",
            "/api/v1/admin/fees/{clubId}");
    private static final List<PathPattern> AUDITED_READ_PATTERNS = AUDITED_READ_PATHS.stream()
            .map(PathPatternParser.defaultInstance::parse)
            .toList();

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
        String method = request.getMethod();
        if (SAFE_METHODS.contains(method)
                && !(AUDITED_READ_METHODS.contains(method) && isAuditedRead(request))) {
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

    // 경로 변수가 있어 문자열 비교로는 못 가린다. PathContainer 는 세그먼트를 디코딩해 MVC 라우팅과 같은 쪽으로 판정한다
    // (ph%6Fne 일치, 끝 슬래시는 MVC 도 404 라 불일치여도 컨트롤러에 닿지 않는다). ;매개변수·// 는 이 필터 앞의
    // StrictHttpFirewall 이 400 으로 먼저 거른다.
    private boolean isAuditedRead(HttpServletRequest request) {
        PathContainer requestPath = PathContainer.parsePath(request.getRequestURI());
        return AUDITED_READ_PATTERNS.stream().anyMatch(pattern -> pattern.matches(requestPath));
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

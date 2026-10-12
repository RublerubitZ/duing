package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

class CookieCsrfOriginFilterTest {

    private static final String ALLOWED_ORIGIN = "https://duings.com";

    private CookieCsrfOriginFilter filter;
    private FilterChain filterChain;

    @BeforeEach
    void setUp() {
        CorsConfiguration corsConfiguration = new CorsConfiguration();
        corsConfiguration.setAllowedOrigins(List.of(ALLOWED_ORIGIN));
        UrlBasedCorsConfigurationSource corsConfigurationSource = new UrlBasedCorsConfigurationSource();
        corsConfigurationSource.registerCorsConfiguration("/**", corsConfiguration);
        filter = new CookieCsrfOriginFilter(corsConfigurationSource, new ObjectMapper());
        filterChain = mock(FilterChain.class);
    }

    @Test
    @DisplayName("Cookie 인증 상태 변경 요청에 Origin이 없으면 403으로 거부한다")
    void rejectsCookieMutationWithoutOrigin() throws Exception {
        MockHttpServletRequest request = mutationRequest("PATCH", "/api/v1/users/me");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getContentAsString()).contains("허용되지 않은 요청 출처입니다.");
        verify(filterChain, never()).doFilter(any(), any());
    }

    @Test
    @DisplayName("Cookie 인증 상태 변경 요청의 Origin이 허용 목록과 일치하면 통과시킨다")
    void allowsCookieMutationFromConfiguredOrigin() throws Exception {
        MockHttpServletRequest request = mutationRequest("PATCH", "/api/v1/users/me");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        request.addHeader(HttpHeaders.ORIGIN, ALLOWED_ORIGIN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("Bearer가 있으면 Access Token Cookie가 함께 있어도 Origin 검증을 생략한다")
    void bearerSkipsOriginValidationEvenWhenCookieExists() throws Exception {
        MockHttpServletRequest request = mutationRequest("PATCH", "/api/v1/users/me");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer mobile-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("웹 로그인 요청은 Access Token Cookie가 없어도 Origin을 필수로 검증한다")
    void webLoginRequiresOriginWithoutCookie() throws Exception {
        MockHttpServletRequest request = mutationRequest("POST", "/api/v1/auth/web/login");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(403);
        verify(filterChain, never()).doFilter(any(), any());
    }

    @Test
    @DisplayName("웹 로그아웃 요청의 Origin이 허용 목록과 다르면 403으로 거부한다")
    void webLogoutRejectsDisallowedOrigin() throws Exception {
        MockHttpServletRequest request = mutationRequest("POST", "/api/v1/auth/web/logout");
        request.addHeader(HttpHeaders.ORIGIN, "https://evil.example.com");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(403);
        verify(filterChain, never()).doFilter(any(), any());
    }

    @Test
    @DisplayName("안전한 HTTP 메서드의 Cookie 인증 요청은 Origin 없이 통과시킨다")
    void safeCookieRequestDoesNotRequireOrigin() throws Exception {
        MockHttpServletRequest request = mutationRequest("GET", "/api/v1/users/me");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/v1/clubs/1/members/export",
            "/api/v1/clubs/1/members/2/phone",
            "/api/v1/leader/applications/3/phone",
            "/api/v1/clubs/1/join-requests/4/phone",
            "/api/v1/admin/users/5/phone",
            "/api/v1/admin/facility-bookings/submission/6",
            "/api/v1/admin/facility-bookings/submission/6/csv",
            "/api/v1/admin/applications/7",
            "/api/v1/admin/fees/8"})
    @DisplayName("열람 감사를 남기는 GET 은 쿠키 인증이면 Origin 이 없을 때 403 으로 거부한다")
    void rejectsCookieAuditedReadWithoutOrigin(String uri) throws Exception {
        MockHttpServletRequest request = mutationRequest("GET", uri);
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(403);
        verify(filterChain, never()).doFilter(any(), any());
    }

    @Test
    @DisplayName("열람 감사 GET 의 Origin 이 허용 목록과 일치하면 쿠키 인증이어도 통과시킨다")
    void allowsCookieAuditedReadFromConfiguredOrigin() throws Exception {
        MockHttpServletRequest request = mutationRequest("GET", "/api/v1/clubs/1/members/2/phone");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        request.addHeader(HttpHeaders.ORIGIN, ALLOWED_ORIGIN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("Bearer 가 있으면 열람 감사 GET 도 Origin 검증을 생략한다")
    void bearerSkipsOriginValidationForAuditedRead() throws Exception {
        MockHttpServletRequest request = mutationRequest("GET", "/api/v1/admin/users/5/phone");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer mobile-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("열람 감사 경로의 HEAD 도 쿠키 인증이면 Origin 을 요구한다")
    void auditedReadHeadRequiresOrigin() throws Exception {
        MockHttpServletRequest request = mutationRequest("HEAD", "/api/v1/clubs/1/members/export");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    @DisplayName("인코딩된 경로(ph%6Fne)도 같은 열람 감사 경로로 판정한다")
    void encodedAuditedReadPathRequiresOrigin() throws Exception {
        MockHttpServletRequest request = mutationRequest("GET", "/api/v1/clubs/1/members/2/ph%6Fne");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    @DisplayName("열람 감사 경로의 OPTIONS(프리플라이트)는 Origin 없이도 그대로 통과한다")
    void auditedReadPreflightPasses() throws Exception {
        MockHttpServletRequest request = mutationRequest("OPTIONS", "/api/v1/clubs/1/members/2/phone");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("쿠키가 없는 열람 감사 GET 은 Origin 검사 없이 넘긴다 — 인증 거부는 보안 체인이 한다")
    void anonymousAuditedReadIsNotOriginChecked() throws Exception {
        MockHttpServletRequest request = mutationRequest("GET", "/api/v1/admin/fees/8");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
    }

    private MockHttpServletRequest mutationRequest(String method, String uri) {
        return new MockHttpServletRequest(method, uri);
    }
}

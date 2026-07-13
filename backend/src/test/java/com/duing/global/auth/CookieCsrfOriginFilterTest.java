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

    private MockHttpServletRequest mutationRequest(String method, String uri) {
        return new MockHttpServletRequest(method, uri);
    }
}

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
    void allowsCookieMutationFromConfiguredOrigin() throws Exception {
        MockHttpServletRequest request = mutationRequest("PATCH", "/api/v1/users/me");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        request.addHeader(HttpHeaders.ORIGIN, ALLOWED_ORIGIN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
    }

    @Test
    void bearerSkipsOriginValidationEvenWhenCookieExists() throws Exception {
        MockHttpServletRequest request = mutationRequest("PATCH", "/api/v1/users/me");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer mobile-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
    }

    @Test
    void webLoginRequiresOriginWithoutCookie() throws Exception {
        MockHttpServletRequest request = mutationRequest("POST", "/api/v1/auth/web/login");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(403);
        verify(filterChain, never()).doFilter(any(), any());
    }

    @Test
    void webLogoutRejectsDisallowedOrigin() throws Exception {
        MockHttpServletRequest request = mutationRequest("POST", "/api/v1/auth/web/logout");
        request.addHeader(HttpHeaders.ORIGIN, "https://evil.example.com");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(403);
        verify(filterChain, never()).doFilter(any(), any());
    }

    @Test
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

package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.user.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;

class JwtAuthenticationFilterTest {

    private JwtTokenProvider jwtTokenProvider;
    private UserRepository userRepository;
    private JwtAuthenticationFilter authenticationFilter;
    private FilterChain filterChain;

    @BeforeEach
    void setUp() {
        jwtTokenProvider = mock(JwtTokenProvider.class);
        userRepository = mock(UserRepository.class);
        authenticationFilter = new JwtAuthenticationFilter(jwtTokenProvider, userRepository);
        filterChain = mock(FilterChain.class);
    }

    @Test
    @DisplayName("Bearer와 Access Token Cookie가 함께 오면 Bearer 인증을 우선한다")
    void bearerWinsWhenBearerAndCookieAreBothPresent() throws Exception {
        MockHttpServletRequest request = requestWithKnownToken("bearer-token");
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer bearer-token");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));

        authenticationFilter.doFilter(request, new MockHttpServletResponse(), filterChain);

        verify(jwtTokenProvider).parse("bearer-token");
        verify(jwtTokenProvider, never()).parse("cookie-token");
        assertThat(request.getAttribute(AuthTransport.REQUEST_ATTRIBUTE)).isEqualTo(AuthTransport.BEARER);
    }

    @Test
    @DisplayName("Authorization Bearer가 없을 때만 Access Token Cookie로 인증한다")
    void cookieIsUsedOnlyWithoutBearer() throws Exception {
        MockHttpServletRequest request = requestWithKnownToken("cookie-token");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));

        authenticationFilter.doFilter(request, new MockHttpServletResponse(), filterChain);

        verify(jwtTokenProvider).parse("cookie-token");
        assertThat(request.getAttribute(AuthTransport.REQUEST_ATTRIBUTE)).isEqualTo(AuthTransport.COOKIE);
    }

    @Test
    @DisplayName("Bearer와 Access Token Cookie가 모두 없으면 인증 전송 방식을 NONE으로 기록한다")
    void noTokenRecordsNoneTransport() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();

        authenticationFilter.doFilter(request, new MockHttpServletResponse(), filterChain);

        verify(jwtTokenProvider, never()).parse(any());
        assertThat(request.getAttribute(AuthTransport.REQUEST_ATTRIBUTE)).isEqualTo(AuthTransport.NONE);
    }

    @Test
    @DisplayName("Cookie 인증 요청이 401이면 access Cookie만 삭제하고 refresh·hint Cookie는 남긴다")
    void unauthorizedCookieRequestClearsOnlyAccessCookie() throws Exception {
        JwtAuthenticationEntryPoint entryPoint =
                new JwtAuthenticationEntryPoint(realCookieService(), new ObjectMapper());
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute(AuthTransport.REQUEST_ATTRIBUTE, AuthTransport.COOKIE);
        MockHttpServletResponse response = new MockHttpServletResponse();

        entryPoint.commence(
                request,
                response,
                new AuthenticationCredentialsNotFoundException("missing"));

        List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(1);
        assertThat(cookies.get(0))
                .startsWith(WebAuthCookieService.ACCESS_COOKIE_NAME + "=")
                .contains("Max-Age=0");
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getContentAsString()).contains(JwtAuthenticationEntryPoint.UNAUTHENTICATED_MESSAGE);
    }

    @Test
    @DisplayName("Bearer 인증 요청이 401이어도 웹 인증 Cookie를 변경하지 않는다")
    void unauthorizedBearerRequestDoesNotClearWebAuthCookies() throws Exception {
        JwtAuthenticationEntryPoint entryPoint =
                new JwtAuthenticationEntryPoint(realCookieService(), new ObjectMapper());
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute(AuthTransport.REQUEST_ATTRIBUTE, AuthTransport.BEARER);
        MockHttpServletResponse response = new MockHttpServletResponse();

        entryPoint.commence(
                request,
                response,
                new AuthenticationCredentialsNotFoundException("missing"));

        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
        assertThat(response.getStatus()).isEqualTo(401);
    }

    private WebAuthCookieService realCookieService() {
        AuthHintTokenProvider authHintTokenProvider = new AuthHintTokenProvider(
                "hint-secret-that-is-at-least-thirty-two-bytes",
                "jwt-secret-that-is-at-least-thirty-two-bytes",
                30);
        return new WebAuthCookieService(
                authHintTokenProvider, jwtTokenProvider, ".duings.com", 30, new MockEnvironment());
    }

    private MockHttpServletRequest requestWithKnownToken(String token) {
        when(jwtTokenProvider.parse(token)).thenReturn(new JwtTokenProvider.TokenClaims(1L, 0, null));
        when(userRepository.findById(1L)).thenReturn(Optional.empty());
        return new MockHttpServletRequest();
    }
}

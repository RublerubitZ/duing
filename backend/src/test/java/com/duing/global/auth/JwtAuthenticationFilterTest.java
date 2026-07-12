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
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
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
    void cookieIsUsedOnlyWithoutBearer() throws Exception {
        MockHttpServletRequest request = requestWithKnownToken("cookie-token");
        request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));

        authenticationFilter.doFilter(request, new MockHttpServletResponse(), filterChain);

        verify(jwtTokenProvider).parse("cookie-token");
        assertThat(request.getAttribute(AuthTransport.REQUEST_ATTRIBUTE)).isEqualTo(AuthTransport.COOKIE);
    }

    @Test
    void noTokenRecordsNoneTransport() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();

        authenticationFilter.doFilter(request, new MockHttpServletResponse(), filterChain);

        verify(jwtTokenProvider, never()).parse(any());
        assertThat(request.getAttribute(AuthTransport.REQUEST_ATTRIBUTE)).isEqualTo(AuthTransport.NONE);
    }

    @Test
    void unauthorizedCookieRequestClearsWebAuthCookies() throws Exception {
        WebAuthCookieService cookieService = mock(WebAuthCookieService.class);
        JwtAuthenticationEntryPoint entryPoint =
                new JwtAuthenticationEntryPoint(cookieService, new ObjectMapper());
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute(AuthTransport.REQUEST_ATTRIBUTE, AuthTransport.COOKIE);
        MockHttpServletResponse response = new MockHttpServletResponse();

        entryPoint.commence(
                request,
                response,
                new AuthenticationCredentialsNotFoundException("missing"));

        verify(cookieService).clear(response);
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getContentAsString()).contains(JwtAuthenticationEntryPoint.UNAUTHENTICATED_MESSAGE);
    }

    @Test
    void unauthorizedBearerRequestDoesNotClearWebAuthCookies() throws Exception {
        WebAuthCookieService cookieService = mock(WebAuthCookieService.class);
        JwtAuthenticationEntryPoint entryPoint =
                new JwtAuthenticationEntryPoint(cookieService, new ObjectMapper());
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute(AuthTransport.REQUEST_ATTRIBUTE, AuthTransport.BEARER);
        MockHttpServletResponse response = new MockHttpServletResponse();

        entryPoint.commence(
                request,
                response,
                new AuthenticationCredentialsNotFoundException("missing"));

        verify(cookieService, never()).clear(any());
        assertThat(response.getStatus()).isEqualTo(401);
    }

    private MockHttpServletRequest requestWithKnownToken(String token) {
        when(jwtTokenProvider.parse(token)).thenReturn(new JwtTokenProvider.TokenClaims(1L, 0));
        when(userRepository.findById(1L)).thenReturn(Optional.empty());
        return new MockHttpServletRequest();
    }
}

package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

class WebAuthCookieServiceTest {
    private static final String JWT_SECRET = "jwt-secret-that-is-at-least-thirty-two-bytes";
    private static final String HINT_SECRET = "hint-secret-that-is-at-least-thirty-two-bytes";

    private WebAuthCookieService cookieService;

    @BeforeEach
    void setUp() {
        AuthHintTokenProvider authHintTokenProvider =
                new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000L);
        cookieService = new WebAuthCookieService(authHintTokenProvider);
        ReflectionTestUtils.setField(cookieService, "hintCookieDomain", ".duings.com");
    }

    @Test
    void issuesHostOnlySecureAccessCookieAndSignedHint() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setSecure(true);
        request.setServerName("api.duings.com");
        MockHttpServletResponse response = new MockHttpServletResponse();

        cookieService.issue(request, response, "access.jwt", "STUDENT");

        List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertThat(cookies).anySatisfy(cookie -> {
            assertThat(cookie).startsWith("__Host-duing_access_token=access.jwt");
            assertThat(cookie)
                    .contains("Path=/", "Max-Age=3600", "Secure", "HttpOnly", "SameSite=Lax");
            assertThat(cookie).doesNotContain("Domain=");
        });
        assertThat(cookies).anySatisfy(cookie -> {
            assertThat(cookie).startsWith("auth_hint=");
            assertThat(cookie)
                    .contains(
                            "Domain=.duings.com",
                            "Path=/",
                            "Secure",
                            "HttpOnly",
                            "SameSite=Lax");
        });
    }

    @Test
    void clearsCookiesWithIssuanceAttributesAndZeroMaxAge() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        cookieService.clear(response);

        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).allSatisfy(cookie ->
                assertThat(cookie)
                        .contains(
                                "Path=/",
                                "Max-Age=0",
                                "Secure",
                                "HttpOnly",
                                "SameSite=Lax"));
    }

    @Test
    void allowsSecureCookiesOnHttpLocalhostOnly() {
        MockHttpServletRequest localhost = new MockHttpServletRequest();
        localhost.setServerName("localhost");
        MockHttpServletResponse response = new MockHttpServletResponse();

        cookieService.issue(localhost, response, "access.jwt", "STUDENT");

        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).allSatisfy(cookie ->
                assertThat(cookie).contains("Secure"));
    }

    @Test
    void rejectsCookieIssuanceOnNonLocalHttp() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setServerName("api.example.com");

        assertThatThrownBy(() -> cookieService.issue(
                        request, new MockHttpServletResponse(), "access.jwt", "STUDENT"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTPS");
    }
}

package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class WebAuthCookieServiceTest {
    private static final String JWT_SECRET = "jwt-secret-that-is-at-least-thirty-two-bytes";
    private static final String HINT_SECRET = "hint-secret-that-is-at-least-thirty-two-bytes";

    private WebAuthCookieService cookieService;

    @BeforeEach
    void setUp() {
        AuthHintTokenProvider authHintTokenProvider =
                new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000L);
        cookieService = new WebAuthCookieService(
                authHintTokenProvider, ".duings.com", new MockEnvironment());
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
                                "Expires=Thu, 1 Jan 1970 00:00:00 GMT",
                                "Secure",
                                "HttpOnly",
                                "SameSite=Lax"));
        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE))
                .anySatisfy(cookie -> assertThat(cookie)
                        .startsWith("__Host-duing_access_token=")
                        .doesNotContain("Domain="))
                .anySatisfy(cookie -> assertThat(cookie)
                        .startsWith("auth_hint=")
                        .contains("Domain=.duings.com"));
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

    @Test
    void rejectsBlankHintCookieDomainInProduction() {
        MockEnvironment productionEnvironment = new MockEnvironment();
        productionEnvironment.setActiveProfiles("prod");

        assertThatThrownBy(() -> new WebAuthCookieService(
                        new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000L),
                        "",
                        productionEnvironment))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(".duings.com");
    }

    @Test
    void rejectsArbitraryHintCookieDomainInProduction() {
        MockEnvironment productionEnvironment = new MockEnvironment();
        productionEnvironment.setActiveProfiles("prod");

        assertThatThrownBy(() -> new WebAuthCookieService(
                        new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000L),
                        ".example.com",
                        productionEnvironment))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(".duings.com");
    }

    @Test
    void allowsBlankHintCookieDomainOutsideProduction() {
        WebAuthCookieService localCookieService = new WebAuthCookieService(
                new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000L),
                "",
                new MockEnvironment());

        MockHttpServletRequest localhost = new MockHttpServletRequest();
        localhost.setServerName("localhost");
        MockHttpServletResponse response = new MockHttpServletResponse();
        localCookieService.issue(localhost, response, "access.jwt", "STUDENT");

        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).allSatisfy(cookie ->
                assertThat(cookie).doesNotContain("Domain="));
    }
}

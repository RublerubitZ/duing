package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
                new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000);
        cookieService = new WebAuthCookieService(
                authHintTokenProvider, ".duings.com", new MockEnvironment());
    }

    @Test
    @DisplayName("Access Token은 host-only Cookie로, 인증 힌트는 서명된 Cookie로 안전하게 발급한다")
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
                    .contains("Path=/", "Max-Age=1800", "Secure", "HttpOnly", "SameSite=Lax");
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
    @DisplayName("웹 인증 Cookie 삭제 응답은 발급 속성과 단일 과거 만료 시각을 유지한다")
    void clearsCookiesWithIssuanceAttributesAndZeroMaxAge() {
        HttpServletResponse response = mock(HttpServletResponse.class);
        ArgumentCaptor<String> cookieHeaderCaptor = ArgumentCaptor.forClass(String.class);
        cookieService.clear(response);

        verify(response, times(2)).addHeader(eq(HttpHeaders.SET_COOKIE), cookieHeaderCaptor.capture());
        List<String> cookies = cookieHeaderCaptor.getAllValues();
        assertThat(cookies).allSatisfy(cookie -> {
            assertThat(cookie)
                    .contains(
                            "Path=/",
                            "Max-Age=0",
                            "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
                            "Secure",
                            "HttpOnly",
                            "SameSite=Lax");
            assertThat(cookie.split("Expires=", -1)).hasSize(2);
        });
        assertThat(cookies)
                .anySatisfy(cookie -> assertThat(cookie)
                        .startsWith("__Host-duing_access_token=")
                        .doesNotContain("Domain="))
                .anySatisfy(cookie -> assertThat(cookie)
                        .startsWith("auth_hint=")
                        .contains("Domain=.duings.com"));
    }

    @Test
    @DisplayName("localhost HTTP 환경에서도 Secure 웹 인증 Cookie 발급을 허용한다")
    void allowsSecureCookiesOnHttpLocalhostOnly() {
        MockHttpServletRequest localhost = new MockHttpServletRequest();
        localhost.setServerName("localhost");
        MockHttpServletResponse response = new MockHttpServletResponse();

        cookieService.issue(localhost, response, "access.jwt", "STUDENT");

        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).allSatisfy(cookie ->
                assertThat(cookie).contains("Secure"));
    }

    @Test
    @DisplayName("localhost가 아닌 HTTP 환경에서는 웹 인증 Cookie 발급을 거부한다")
    void rejectsCookieIssuanceOnNonLocalHttp() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setServerName("api.example.com");

        assertThatThrownBy(() -> cookieService.issue(
                        request, new MockHttpServletResponse(), "access.jwt", "STUDENT"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTPS");
    }

    @Test
    @DisplayName("운영 환경에서 인증 힌트 Cookie Domain이 비어 있으면 기동을 거부한다")
    void rejectsBlankHintCookieDomainInProduction() {
        MockEnvironment productionEnvironment = new MockEnvironment();
        productionEnvironment.setActiveProfiles("prod");

        assertThatThrownBy(() -> new WebAuthCookieService(
                        new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000),
                        "",
                        productionEnvironment))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(".duings.com");
    }

    @Test
    @DisplayName("운영 환경에서 인증 힌트 Cookie Domain이 .duings.com이 아니면 기동을 거부한다")
    void rejectsArbitraryHintCookieDomainInProduction() {
        MockEnvironment productionEnvironment = new MockEnvironment();
        productionEnvironment.setActiveProfiles("prod");

        assertThatThrownBy(() -> new WebAuthCookieService(
                        new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000),
                        ".example.com",
                        productionEnvironment))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(".duings.com");
    }

    @Test
    @DisplayName("운영 외 환경에서는 빈 Domain으로 host-only 인증 힌트 Cookie를 발급한다")
    void allowsBlankHintCookieDomainOutsideProduction() {
        WebAuthCookieService localCookieService = new WebAuthCookieService(
                new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000),
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

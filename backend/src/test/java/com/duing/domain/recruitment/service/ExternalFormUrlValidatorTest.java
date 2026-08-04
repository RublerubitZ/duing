package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.service.ExternalFormUrlValidator.AllowedFormHost;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 외부 폼 URL 화이트리스트 검증 (스펙 §3).
 *
 * <p>허용 목록 리터럴을 그대로 단언하는 테스트를 포함한다 — FE(zod)와 BE 가 같은 목록을 들고 있어야 하므로,
 * 한쪽만 플랫폼을 늘리면 이 테스트가 깨져 드리프트를 알린다 (회원 이름 금칙어 목록 전례와 같은 가드).
 */
class ExternalFormUrlValidatorTest {

    @Test
    @DisplayName("허용 호스트 목록은 스펙 §3 표(forms.gle / docs.google.com+/forms / form.naver.com)와 정확히 일치한다")
    void allowedHostListMatchesSpecTable() {
        assertThat(ExternalFormUrlValidator.ALLOWED_HOSTS).containsExactly(
                new AllowedFormHost("forms.gle", ""),
                new AllowedFormHost("docs.google.com", "/forms"),
                new AllowedFormHost("form.naver.com", ""));
    }

    @Test
    @DisplayName("허용 플랫폼의 https 주소는 통과한다")
    void acceptsWhitelistedHttpsUrls() {
        assertThatCode(() -> ExternalFormUrlValidator.validate("https://forms.gle/aBcD1234")).doesNotThrowAnyException();
        assertThatCode(() -> ExternalFormUrlValidator.validate(
                "https://docs.google.com/forms/d/e/1FAIpQLSf/viewform?usp=sf_link")).doesNotThrowAnyException();
        assertThatCode(() -> ExternalFormUrlValidator.validate("https://form.naver.com/response/abc123"))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("호스트 대소문자가 달라도 통과한다 — 호스트는 대소문자를 구분하지 않는다")
    void acceptsHostRegardlessOfCase() {
        assertThatCode(() -> ExternalFormUrlValidator.validate("https://DOCS.Google.COM/forms/d/e/xyz/viewform"))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("http 등 https 가 아닌 스킴은 거부된다")
    void rejectsNonHttpsSchemes() {
        assertRejected("http://forms.gle/aBcD1234");
        assertRejected("javascript:alert(document.cookie)");
        assertRejected("data:text/html,<script>alert(1)</script>");
        assertRejected("ftp://forms.gle/aBcD1234");
    }

    @Test
    @DisplayName("허용 호스트를 흉내 낸 우회 주소는 모두 거부된다")
    void rejectsHostSpoofingAttempts() {
        // 부분 문자열·endsWith 검증이었다면 통과했을 값들.
        assertRejected("https://docs.google.com.evil.com/forms");
        assertRejected("https://evil.com/docs.google.com/forms");
        assertRejected("https://evildocs.google.com/forms");
        // userinfo 트릭 — 사람 눈에는 docs.google.com 이지만 실제 호스트는 evil.com 이다.
        assertRejected("https://docs.google.com@evil.com/forms");
        assertRejected("https://forms.gle@evil.com/abc");
    }

    @Test
    @DisplayName("허용 호스트라도 userinfo 가 붙어 있으면 거부된다")
    void rejectsUserInfoEvenOnAllowedHost() {
        assertRejected("https://user@forms.gle/aBcD1234");
    }

    @Test
    @DisplayName("docs.google.com 은 경로가 /forms 로 시작하지 않으면 거부된다")
    void rejectsGoogleDocsPathOutsideForms() {
        assertRejected("https://docs.google.com");
        assertRejected("https://docs.google.com/");
        assertRejected("https://docs.google.com/document/d/abc/edit");
        assertRejected("https://docs.google.com/spreadsheets/d/abc/edit");
    }

    @Test
    @DisplayName("허용 목록에 없는 도메인과 단축 URL 은 거부된다")
    void rejectsUnlistedDomainsAndShortLinks() {
        assertRejected("https://naver.me/abcdefg");
        assertRejected("https://example.com/form");
        assertRejected("https://forms.gle.evil.com/abc");
    }

    @Test
    @DisplayName("파싱할 수 없는 값·상대 경로·호스트 없는 값은 거부된다")
    void rejectsUnparsableOrHostlessValues() {
        assertRejected("https://forms.gle/ 공백 포함");
        assertRejected("/forms/d/e/abc");
        assertRejected("forms.gle/aBcD1234");
        assertRejected("https:///forms");
        assertRejected("");
        assertRejected(null);
    }

    @Test
    @DisplayName("거부 메시지에는 허용 플랫폼 안내(구글 폼·네이버 폼)가 한국어로 포함된다")
    void rejectionMessageGuidesAllowedPlatforms() {
        assertThatThrownBy(() -> ExternalFormUrlValidator.validate("https://example.com/form"))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class)
                .hasMessageContaining("forms.gle")
                .hasMessageContaining("docs.google.com")
                .hasMessageContaining("form.naver.com")
                .hasMessageContaining("https");
    }

    @Test
    @DisplayName("허용 목록은 호스트 한 줄 추가만으로 확장할 수 있는 상수 목록이다")
    void allowedHostsIsAnExtensibleConstantList() {
        List<AllowedFormHost> allowedHosts = ExternalFormUrlValidator.ALLOWED_HOSTS;

        assertThat(allowedHosts).isUnmodifiable();
        assertThat(allowedHosts).extracting(AllowedFormHost::host)
                .containsExactly("forms.gle", "docs.google.com", "form.naver.com");
    }

    private static void assertRejected(String externalFormUrl) {
        assertThatThrownBy(() -> ExternalFormUrlValidator.validate(externalFormUrl))
                .as("거부되어야 하는 URL: %s", externalFormUrl)
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class);
    }
}

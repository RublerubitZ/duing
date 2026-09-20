package com.duing.domain.notice.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class NoticeHtmlSanitizerTest {

    @Test
    @DisplayName("HTML 포맷: script·onerror·javascript: 등 위험 요소는 제거된다")
    void htmlStripsDangerousContent() {
        String dirty = "<p>hi</p><script>alert(1)</script>"
                + "<img src=\"x\" onerror=\"alert(1)\"><a href=\"javascript:alert(1)\">x</a>";

        String clean = NoticeHtmlSanitizer.sanitize(dirty, NoticeContentFormat.HTML);

        assertThat(clean).doesNotContain("<script");
        assertThat(clean).doesNotContain("onerror");
        assertThat(clean.toLowerCase()).doesNotContain("javascript:");
    }

    @Test
    @DisplayName("HTML 포맷: 허용 태그/속성(h2·strong·li·a[https]·img[https])은 보존된다")
    void htmlKeepsAllowedTags() {
        String html = "<h2>제목</h2><strong>굵게</strong><ul><li>x</li></ul>"
                + "<a href=\"https://duings.com\">링크</a><img src=\"https://e/x.png\" alt=\"x\">";

        String clean = NoticeHtmlSanitizer.sanitize(html, NoticeContentFormat.HTML);

        assertThat(clean).contains("<h2>제목</h2>");
        assertThat(clean).contains("<strong>굵게</strong>");
        assertThat(clean).contains("<li>x</li>");
        assertThat(clean).contains("https://duings.com");
        assertThat(clean).contains("<img");
        assertThat(clean).contains("https://e/x.png");
    }

    @Test
    @DisplayName("HTML 포맷: 내부 상대경로 a[href]·img[src] 는 프론트 allowlist 와 같이 보존된다")
    void htmlKeepsRelativeLinks() {
        String html = "<a href=\"/clubs/3\">동아리</a><img src=\"/files/stub/notice/body/x.png\" alt=\"x\">";

        String clean = NoticeHtmlSanitizer.sanitize(html, NoticeContentFormat.HTML);

        assertThat(clean).contains("href=\"/clubs/3\"");
        assertThat(clean).contains("src=\"/files/stub/notice/body/x.png\"");
        // preserveRelativeLinks(true) 가 꺼지면 jsoup 이 placeholder 호스트로 절대화해 저장한다 — 두 설정의 결합을 고정한다.
        assertThat(clean).doesNotContain("relative-link.invalid");
    }

    @Test
    @DisplayName("HTML 포맷: 상대경로를 보존해도 data:·javascript: 스킴은 계속 제거된다")
    void htmlStillStripsDangerousSchemesWhenRelativeLinksArePreserved() {
        String html = "<img src=\"data:image/svg+xml;base64,PHN2Zz4=\"><a href=\"javascript:alert(1)\">x</a>"
                + "<a href=\"/clubs/3\">ok</a>";

        String clean = NoticeHtmlSanitizer.sanitize(html, NoticeContentFormat.HTML);

        assertThat(clean.toLowerCase()).doesNotContain("data:");
        assertThat(clean.toLowerCase()).doesNotContain("javascript:");
        assertThat(clean).contains("href=\"/clubs/3\"");
    }

    @Test
    @DisplayName("MARKDOWN 포맷·null 본문은 정제하지 않고 그대로 둔다")
    void markdownAndNullAreUntouched() {
        String markdown = "# 제목\n<script>alert(1)</script>\n**굵게**";

        assertThat(NoticeHtmlSanitizer.sanitize(markdown, NoticeContentFormat.MARKDOWN)).isEqualTo(markdown);
        assertThat(NoticeHtmlSanitizer.sanitize(null, NoticeContentFormat.HTML)).isNull();
        assertThat(NoticeHtmlSanitizer.sanitize(null, NoticeContentFormat.MARKDOWN)).isNull();
    }
}

package com.duing.domain.notice.entity;

import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;

/**
 * 공지 본문(HTML 포맷)을 서버측에서 정제한다.
 *
 * <p>프론트의 {@code sanitizeHtml.ts}(DOMPurify allowlist)와 동일한 허용 태그/속성으로 맞춰,
 * DOMPurify 를 거치지 않는 다른 소비자(예: 향후 앱·서버 렌더·이메일 템플릿)가 본문을 그대로
 * 렌더해도 저장형 XSS 가 되지 않도록 쓰기 시점에 정제한다. {@code <script>}·{@code on*} 핸들러·
 * {@code javascript:} 스킴 등은 모두 제거된다.
 *
 * <p>MARKDOWN 포맷이나 null 본문은 그대로 둔다 — 마크다운은 HTML 이 아니므로 HTML 정제기로
 * 처리하면 본문이 손상되며, 마크다운은 렌더 시점(marked + DOMPurify)에 정제된다.
 */
public final class NoticeHtmlSanitizer {

    // 프론트 ALLOWED_TAGS / ALLOWED_ATTR 과 동일. href/src 는 http(s)/mailto 만 허용한다.
    private static final Safelist SAFELIST = new Safelist()
            .addTags("p", "br", "strong", "em", "s", "h2", "h3", "ul", "ol", "li",
                    "a", "img", "blockquote", "hr", "code", "pre")
            .addAttributes("a", "href", "target", "rel")
            .addAttributes("img", "src", "alt")
            .addProtocols("a", "href", "http", "https", "mailto")
            .addProtocols("img", "src", "http", "https")
            // 프론트 allowlist 와 동일하게 내부 상대경로(예: /notices/123)는 보존한다.
            // 스킴이 있는 위험 URL(javascript:/data: 등)은 위 프로토콜 제약으로 계속 제거된다.
            .preserveRelativeLinks(true);

    public static String sanitize(String content, NoticeContentFormat format) {
        if (content == null || format != NoticeContentFormat.HTML) {
            return content;
        }
        return Jsoup.clean(content, SAFELIST);
    }

    private NoticeHtmlSanitizer() {
    }
}

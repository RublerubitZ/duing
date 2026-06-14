package com.duing.domain.notice.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Notice 엔티티의 본문 기록 경로(생성/수정)에서 HTML 포맷 본문이 서버측 정제되는지 검증한다.
 */
class NoticeContentSanitizationTest {

    private static final String DIRTY_HTML = "<p>hi</p><script>alert(1)</script>";
    private static final String COVER = "https://files.duings.com/c.png";

    private static Notice notice(String content, NoticeContentFormat format) {
        return Notice.create("제목", "요약", content, COVER, null,
                NoticeCategory.FESTIVAL, List.of(), NoticeVisibility.PUBLIC, null,
                false, null, false, null, null, null, null, null, format, 1L);
    }

    private static Notice.UpdatePayload formatOnly(NoticeContentFormat format) {
        return new Notice.UpdatePayload(
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, format);
    }

    @Test
    @DisplayName("HTML 공지 생성 시 본문이 서버측에서 정제된다(script 제거)")
    void createSanitizesHtmlContent() {
        Notice created = notice(DIRTY_HTML, NoticeContentFormat.HTML);

        assertThat(created.getContent()).doesNotContain("<script");
    }

    @Test
    @DisplayName("MARKDOWN 공지 본문은 정제하지 않고 그대로 저장한다")
    void markdownContentIsNotSanitized() {
        Notice created = notice(DIRTY_HTML, NoticeContentFormat.MARKDOWN);

        assertThat(created.getContent()).contains("<script");
    }

    @Test
    @DisplayName("본문은 그대로 두고 포맷만 MARKDOWN→HTML 로 승격해도 기존 본문이 HTML 로 정제된다")
    void formatOnlyPromotionSanitizesExistingContent() {
        Notice created = notice(DIRTY_HTML, NoticeContentFormat.MARKDOWN);
        assertThat(created.getContent()).contains("<script");

        created.update(formatOnly(NoticeContentFormat.HTML));

        assertThat(created.getContent()).doesNotContain("<script");
    }
}

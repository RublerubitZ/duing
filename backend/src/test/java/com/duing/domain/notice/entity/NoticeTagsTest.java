package com.duing.domain.notice.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class NoticeTagsTest {

    @Test
    @DisplayName("공지 작성·수정은 태그의 앞뒤 공백·제어문자를 지우고 빈 태그·null·중복을 버린다")
    void normalizesTagsOnCreateAndUpdate() {
        Notice notice = Notice.create("제목", "요약", "본문", "https://files.duings.com/c.png", null,
                NoticeCategory.GENERAL, Arrays.asList(" 학사 ", "학사", "장\u001F학", "   ", null),
                NoticeVisibility.PUBLIC, null,
                false, null, false, null, null, null, null, null,
                NoticeContentFormat.MARKDOWN, 1L);

        assertThat(notice.getTags()).containsExactly("학사", "장학");

        notice.update(new Notice.UpdatePayload(
                null, null, null, null, null,    // title, summary, content, coverImageUrl, linkUrl
                null,                            // clearExternalLink
                null, Arrays.asList(" 행사 ", "행사", "   ", null, "축\u001F제"), // category, tags
                null, null,                      // visibility, clubScopeRole
                null, null, null,                // pinned, expiresAt, clearExpiresAt
                null,                            // notifyOnPublish
                null, null,                      // eventStartAt, eventEndAt
                null, null, null, null,          // location, host, audience, clearEvent
                null));                          // contentFormat

        assertThat(notice.getTags()).containsExactly("행사", "축제");
    }
}

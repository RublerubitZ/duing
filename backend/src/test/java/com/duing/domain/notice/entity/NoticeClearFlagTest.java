package com.duing.domain.notice.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 공지 수정 시 비우기(clear) 동작 검증:
 * 관리자 경로의 외부 링크(nullable)와 동아리 경로의 표지 이미지(NOT NULL → 빈 문자열).
 */
class NoticeClearFlagTest {

    private static final String COVER = "https://files.duings.com/c.png";
    private static final String LINK = "https://example.com/apply";

    private static Notice notice(String coverImageUrl, String linkUrl) {
        return Notice.create("제목", "요약", "본문", coverImageUrl, linkUrl,
                NoticeCategory.GENERAL, List.of(), NoticeVisibility.PUBLIC, null,
                false, null, false, null, null, null, null, null,
                NoticeContentFormat.MARKDOWN, 1L);
    }

    private static Notice.UpdatePayload clearExternalLinkPayload() {
        return new Notice.UpdatePayload(
                null, null, null, null, null,    // title, summary, content, coverImageUrl, linkUrl
                true,                            // clearExternalLink
                null, null,                      // category, tags
                null, null,                      // visibility, clubScopeRole
                null, null, null,                // pinned, expiresAt, clearExpiresAt
                null,                            // notifyOnPublish
                null, null,                      // eventStartAt, eventEndAt
                null, null, null, null,          // location, host, audience, clearEvent
                null);                           // contentFormat
    }

    @Test
    @DisplayName("관리자 공지 update 는 clearExternalLink=true 면 외부 링크를 null 로 비운다")
    void clearsExternalLink() {
        Notice created = notice(COVER, LINK);
        assertThat(created.getLinkUrl()).isEqualTo(LINK);

        created.update(clearExternalLinkPayload());

        assertThat(created.getLinkUrl()).isNull();
    }

    @Test
    @DisplayName("관리자 공지 update 는 clearExternalLink=true 가 동시에 전달된 linkUrl 값보다 우선하여 null 로 비운다")
    void clearExternalLinkTakesPrecedenceOverNewLinkUrl() {
        Notice created = notice(COVER, LINK);

        created.update(new Notice.UpdatePayload(
                null, null, null, null, "https://keep-me", // title, summary, content, coverImageUrl, linkUrl(non-null)
                true,                                       // clearExternalLink
                null, null,                                 // category, tags
                null, null,                                 // visibility, clubScopeRole
                null, null, null,                           // pinned, expiresAt, clearExpiresAt
                null,                                       // notifyOnPublish
                null, null,                                 // eventStartAt, eventEndAt
                null, null, null, null,                     // location, host, audience, clearEvent
                null));                                     // contentFormat

        assertThat(created.getLinkUrl()).isNull();
    }

    @Test
    @DisplayName("동아리 공지 update 는 clearCoverImage=true 면 표지 이미지를 빈 문자열로 비우고 같은 요청의 새 값보다 우선한다")
    void clearsClubCoverImageToEmptyString() {
        Notice created = notice(COVER, null);
        assertThat(created.getCoverImageUrl()).isEqualTo(COVER);

        created.applyClubScopedUpdate(null, null, null, "https://new-cover", true, null, null);

        assertThat(created.getCoverImageUrl()).isEmpty();
    }

    @Test
    @DisplayName("동아리 공지 update 는 clearCoverImage 가 아니면 전달된 표지 이미지로 교체한다")
    void replacesClubCoverImageWhenNotCleared() {
        Notice created = notice(COVER, null);

        created.applyClubScopedUpdate(null, null, null, "https://new-cover", null, null, null);

        assertThat(created.getCoverImageUrl()).isEqualTo("https://new-cover");
    }
}

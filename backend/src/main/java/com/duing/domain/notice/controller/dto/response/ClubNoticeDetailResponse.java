package com.duing.domain.notice.controller.dto.response;

import com.duing.domain.notice.entity.Notice;
import java.time.LocalDateTime;

/**
 * 동아리(club-scoped) 공지 단건 상세 응답. 본문(content)·표지(coverImageUrl)를 포함해
 * 회원 열람 및 운영진 수정 폼 시드에 사용한다. 동아리 작성 공지는 항상 GENERAL/MARKDOWN 이라
 * category/tags/link/event 필드는 노출하지 않는다.
 */
public record ClubNoticeDetailResponse(
        Long id,
        String title,
        String summary,
        String content,
        String coverImageUrl,
        boolean pinned,
        LocalDateTime expiresAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static ClubNoticeDetailResponse from(Notice notice) {
        return new ClubNoticeDetailResponse(
                notice.getId(), notice.getTitle(), notice.getSummary(), notice.getContent(),
                notice.getCoverImageUrl(), notice.isPinned(),
                notice.getExpiresAt(), notice.getCreatedAt(), notice.getUpdatedAt()
        );
    }
}

package com.duing.domain.notice.controller.dto.response;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import java.time.LocalDateTime;
import java.util.List;

public record NoticeCardResponse(
        Long id,
        String title,
        String summary,
        String coverImageUrl,
        String linkUrl,
        NoticeCategory category,
        List<String> tags,
        boolean pinned,
        LocalDateTime expiresAt,
        LocalDateTime createdAt,
        // 출처 — 동아리 작성 공지면 owningClubId·clubName 이 채워지고, 학교(관리자) 공지면 둘 다 null.
        Long owningClubId,
        String clubName
) {
    public static NoticeCardResponse from(Notice notice, String clubName) {
        return new NoticeCardResponse(
                notice.getId(), notice.getTitle(), notice.getSummary(),
                notice.getCoverImageUrl(), notice.getLinkUrl(),
                notice.getCategory(), notice.getTags(),
                notice.isPinned(), notice.getExpiresAt(), notice.getCreatedAt(),
                notice.getOwningClubId(), clubName
        );
    }
}

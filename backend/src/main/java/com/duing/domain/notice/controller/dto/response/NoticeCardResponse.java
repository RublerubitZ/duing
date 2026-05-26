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
        LocalDateTime createdAt
) {
    public static NoticeCardResponse from(Notice notice) {
        return new NoticeCardResponse(
                notice.getId(), notice.getTitle(), notice.getSummary(),
                notice.getCoverImageUrl(), notice.getLinkUrl(),
                notice.getCategory(), notice.getTags(),
                notice.isPinned(), notice.getExpiresAt(), notice.getCreatedAt()
        );
    }
}

package com.duing.domain.notice.controller.dto.response;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;
import java.time.LocalDateTime;

public record AdminNoticeSummaryResponse(
        Long id,
        String title,
        NoticeCategory category,
        NoticeVisibility visibility,
        boolean pinned,
        boolean notifyOnPublish,
        LocalDateTime expiresAt,
        LocalDateTime createdAt
) {
    public static AdminNoticeSummaryResponse from(Notice notice) {
        return new AdminNoticeSummaryResponse(
                notice.getId(), notice.getTitle(), notice.getCategory(), notice.getVisibility(),
                notice.isPinned(), notice.isNotifyOnPublish(), notice.getExpiresAt(), notice.getCreatedAt()
        );
    }
}

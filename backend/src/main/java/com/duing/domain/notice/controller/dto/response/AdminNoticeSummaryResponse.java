package com.duing.domain.notice.controller.dto.response;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.query.NoticeAdminSummaryQuery;
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
    public static AdminNoticeSummaryResponse from(NoticeAdminSummaryQuery query) {
        return new AdminNoticeSummaryResponse(
                query.id(), query.title(), query.category(), query.visibility(),
                query.pinned(), query.notifyOnPublish(), query.expiresAt(), query.createdAt()
        );
    }
}

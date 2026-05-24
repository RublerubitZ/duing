package com.duing.domain.notice.service.dto.query;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;
import java.time.LocalDateTime;

/**
 * 어드민 공지 목록 행. {@link Notice} 엔티티의 표시 필드만 추려 평탄화한 Query DTO.
 */
public record NoticeAdminSummaryQuery(
        Long id,
        String title,
        NoticeCategory category,
        NoticeVisibility visibility,
        boolean pinned,
        boolean notifyOnPublish,
        LocalDateTime expiresAt,
        LocalDateTime createdAt
) {
    public static NoticeAdminSummaryQuery from(Notice notice) {
        return new NoticeAdminSummaryQuery(
                notice.getId(),
                notice.getTitle(),
                notice.getCategory(),
                notice.getVisibility(),
                notice.isPinned(),
                notice.isNotifyOnPublish(),
                notice.getExpiresAt(),
                notice.getCreatedAt()
        );
    }
}

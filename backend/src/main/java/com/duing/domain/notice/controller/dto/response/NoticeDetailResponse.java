package com.duing.domain.notice.controller.dto.response;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import java.time.LocalDateTime;
import java.util.List;

public record NoticeDetailResponse(
        Long id,
        String title,
        String summary,
        String content,
        String coverImageUrl,
        String linkUrl,
        NoticeCategory category,
        List<String> tags,
        NoticeVisibility visibility,
        NoticeClubScopeRole clubScopeRole,
        List<Long> targetClubIds,
        boolean pinned,
        LocalDateTime expiresAt,
        boolean notifyOnPublish,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        List<String> bodyImageUrls,
        EventInfo eventInfo
) {
    public record EventInfo(
            LocalDateTime startAt,
            LocalDateTime endAt,
            String location,
            String host,
            String audience
    ) {
        public static EventInfo from(Notice notice) {
            if (notice.getEventStartAt() == null && notice.getEventEndAt() == null
                    && notice.getLocation() == null && notice.getHost() == null
                    && notice.getAudience() == null) {
                return null;
            }
            return new EventInfo(
                    notice.getEventStartAt(), notice.getEventEndAt(),
                    notice.getLocation(), notice.getHost(), notice.getAudience());
        }
    }

    public static NoticeDetailResponse from(Notice notice, List<Long> targetClubIds, boolean exposeAdminFields) {
        return new NoticeDetailResponse(
                notice.getId(), notice.getTitle(), notice.getSummary(), notice.getContent(),
                notice.getCoverImageUrl(), notice.getLinkUrl(),
                notice.getCategory(), notice.getTags(),
                exposeAdminFields ? notice.getVisibility() : null,
                exposeAdminFields ? notice.getClubScopeRole() : null,
                exposeAdminFields ? targetClubIds : null,
                notice.isPinned(), notice.getExpiresAt(),
                exposeAdminFields && notice.isNotifyOnPublish(),
                notice.getCreatedAt(), notice.getUpdatedAt(),
                notice.getBodyImageUrls(),
                EventInfo.from(notice)
        );
    }
}

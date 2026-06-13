package com.duing.domain.notice.service.dto.command;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import java.time.LocalDateTime;
import java.util.List;

public record UpdateNoticeCommand(
        Long noticeId,
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
        Boolean pinned,
        LocalDateTime expiresAt,
        Boolean clearExpiresAt,
        Boolean notifyOnPublish,
        LocalDateTime eventStartAt,
        LocalDateTime eventEndAt,
        String location,
        String host,
        String audience,
        Boolean clearEvent,
        List<String> bodyImageUrls
) {}

package com.duing.domain.notice.controller.dto.request;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;

public record UpdateNoticeRequest(
        @Size(max = 120) String title,
        @Size(max = 300) String summary,
        @Size(max = 50000) String content,
        @Size(max = 500) String coverImageUrl,
        @Size(max = 2000)
        @Pattern(regexp = "^$|^https?://.+$", message = "링크는 http:// 또는 https:// 로 시작해야 합니다.") String linkUrl,
        NoticeCategory category,
        @Size(max = 8) List<@Size(max = 20) String> tags,
        NoticeVisibility visibility,
        NoticeClubScopeRole clubScopeRole,
        List<Long> targetClubIds,
        Boolean pinned,
        LocalDateTime expiresAt,
        Boolean clearExpiresAt,
        Boolean notifyOnPublish,
        LocalDateTime eventStartAt,
        LocalDateTime eventEndAt,
        @Size(max = 200) String location,
        @Size(max = 200) String host,
        @Size(max = 200) String audience,
        Boolean clearEvent,
        NoticeContentFormat contentFormat
) {
    public UpdateNoticeCommand toCommand(Long noticeId) {
        return new UpdateNoticeCommand(
                noticeId, title, summary, content, coverImageUrl, linkUrl,
                category, tags, visibility, clubScopeRole, targetClubIds,
                pinned, expiresAt, clearExpiresAt, notifyOnPublish,
                eventStartAt, eventEndAt, location, host, audience, clearEvent, contentFormat
        );
    }
}

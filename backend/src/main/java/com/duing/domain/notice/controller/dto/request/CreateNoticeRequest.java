package com.duing.domain.notice.controller.dto.request;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;

public record CreateNoticeRequest(
        @NotBlank @Size(max = 120) String title,
        @NotBlank @Size(max = 300) String summary,
        @NotBlank @Size(max = 50000) String content,
        @NotBlank @Size(max = 500) String coverImageUrl,
        @Size(max = 2000) String linkUrl,
        @NotNull NoticeCategory category,
        @Size(max = 8) List<@Size(max = 20) String> tags,
        @NotNull NoticeVisibility visibility,
        NoticeClubScopeRole clubScopeRole,
        List<Long> targetClubIds,
        boolean pinned,
        LocalDateTime expiresAt,
        boolean notifyOnPublish,
        LocalDateTime eventStartAt,
        LocalDateTime eventEndAt,
        @Size(max = 200) String location,
        @Size(max = 200) String host,
        @Size(max = 200) String audience,
        NoticeContentFormat contentFormat
) {
    public CreateNoticeCommand toCommand(Long authorId) {
        return new CreateNoticeCommand(
                title, summary, content, coverImageUrl, linkUrl,
                category, tags == null ? List.of() : tags,
                visibility, clubScopeRole,
                targetClubIds == null ? List.of() : targetClubIds,
                pinned, expiresAt, notifyOnPublish,
                eventStartAt, eventEndAt, location, host, audience,
                contentFormat,
                authorId
        );
    }
}

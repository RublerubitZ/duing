package com.duing.domain.notice.service.dto.command;

import java.time.LocalDateTime;

public record UpdateClubNoticeCommand(
        Long clubId,
        Long noticeId,
        String title,
        String summary,
        String content,
        String coverImageUrl,
        Boolean pinned,
        LocalDateTime expiresAt
) {}

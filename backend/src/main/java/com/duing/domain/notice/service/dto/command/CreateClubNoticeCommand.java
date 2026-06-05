package com.duing.domain.notice.service.dto.command;

import java.time.LocalDateTime;

public record CreateClubNoticeCommand(
        Long clubId,
        Long authorId,
        String title,
        String summary,
        String content,
        String coverImageUrl,
        boolean pinned,
        LocalDateTime expiresAt
) {}

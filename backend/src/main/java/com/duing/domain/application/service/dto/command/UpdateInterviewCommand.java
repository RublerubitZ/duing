package com.duing.domain.application.service.dto.command;

import java.time.LocalDateTime;

public record UpdateInterviewCommand(
        Long applicationId,
        Long currentUserId,
        LocalDateTime interviewAt,
        String interviewLocation
) {
}

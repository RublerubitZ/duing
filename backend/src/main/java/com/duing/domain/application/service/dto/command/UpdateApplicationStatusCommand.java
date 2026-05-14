package com.duing.domain.application.service.dto.command;

import com.duing.domain.application.entity.ApplicationStatus;

public record UpdateApplicationStatusCommand(
        Long applicationId,
        Long currentUserId,
        ApplicationStatus status
) {}
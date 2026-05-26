package com.duing.domain.club.service.dto.command;

import com.duing.domain.club.entity.RecertificationStatus;

public record ProcessRecertificationCommand(
        Long requestId,
        Long handlerAdminId,
        RecertificationStatus status,
        String actionNote
) {}

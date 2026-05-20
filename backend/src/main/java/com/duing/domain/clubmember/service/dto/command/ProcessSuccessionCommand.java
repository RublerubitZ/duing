package com.duing.domain.clubmember.service.dto.command;

import com.duing.domain.clubmember.entity.SuccessionStatus;

public record ProcessSuccessionCommand(
        Long requestId, Long handlerAdminId, SuccessionStatus status, String actionNote) {}

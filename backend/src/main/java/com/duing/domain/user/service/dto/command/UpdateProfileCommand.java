package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.Grade;

public record UpdateProfileCommand(
        Long userId,
        String name,
        Grade grade
) {}

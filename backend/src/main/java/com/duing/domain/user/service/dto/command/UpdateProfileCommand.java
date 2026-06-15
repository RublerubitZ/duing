package com.duing.domain.user.service.dto.command;

public record UpdateProfileCommand(
        Long userId,
        String name,
        String phone
) {}

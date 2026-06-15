package com.duing.domain.user.service.dto.command;

public record ChangePasswordCommand(
        Long userId,
        String currentPassword,
        String newPassword
) {}

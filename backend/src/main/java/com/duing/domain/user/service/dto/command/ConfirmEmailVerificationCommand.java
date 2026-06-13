package com.duing.domain.user.service.dto.command;

public record ConfirmEmailVerificationCommand(
        String email,
        String code
) {}

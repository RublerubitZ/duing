package com.duing.domain.user.service.dto.command;

public record SendEmailVerificationCommand(
        String email
) {}

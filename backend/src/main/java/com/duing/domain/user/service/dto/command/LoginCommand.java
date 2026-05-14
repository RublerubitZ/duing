package com.duing.domain.user.service.dto.command;

public record LoginCommand(
        String email,
        String rawPassword
) {}

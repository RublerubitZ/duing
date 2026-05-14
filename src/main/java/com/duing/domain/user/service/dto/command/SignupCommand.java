package com.duing.domain.user.service.dto.command;

public record SignupCommand(
        String studentId,
        String name,
        String email,
        String rawPassword
) {}

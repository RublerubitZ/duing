package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;

public record SignupCommand(
        String studentId,
        String name,
        String rawPassword,
        Grade grade,
        College college,
        String major,
        String verificationToken
) {}

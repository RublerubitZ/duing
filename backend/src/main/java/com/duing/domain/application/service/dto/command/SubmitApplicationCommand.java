package com.duing.domain.application.service.dto.command;

import java.util.List;

public record SubmitApplicationCommand(
        Long recruitmentId,
        Long userId,
        List<String> answers
) {}

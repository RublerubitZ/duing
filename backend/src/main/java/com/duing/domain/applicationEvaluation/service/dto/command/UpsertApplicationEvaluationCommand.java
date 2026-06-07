package com.duing.domain.applicationEvaluation.service.dto.command;

public record UpsertApplicationEvaluationCommand(
        Long applicationId,
        Long evaluatorId,
        int score,
        String memo
) {}

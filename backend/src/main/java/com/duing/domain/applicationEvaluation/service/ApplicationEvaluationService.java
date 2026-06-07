package com.duing.domain.applicationEvaluation.service;

import com.duing.domain.applicationEvaluation.service.dto.command.UpsertApplicationEvaluationCommand;

public interface ApplicationEvaluationService {
    void upsert(UpsertApplicationEvaluationCommand command);
    void deleteMine(Long applicationId, Long evaluatorId);
}

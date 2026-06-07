package com.duing.domain.applicationEvaluation.controller.dto.request;

import com.duing.domain.applicationEvaluation.service.dto.command.UpsertApplicationEvaluationCommand;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpsertApplicationEvaluationRequest(
        @NotNull(message = "score 는 필수입니다.")
        @Min(value = 1, message = "score 는 1~5 사이여야 합니다.")
        @Max(value = 5, message = "score 는 1~5 사이여야 합니다.")
        Integer score,

        @Size(max = 2000, message = "memo 는 2000자 이내여야 합니다.")
        String memo
) {
    public UpsertApplicationEvaluationCommand toCommand(Long applicationId, Long evaluatorId) {
        return new UpsertApplicationEvaluationCommand(applicationId, evaluatorId, score, memo);
    }
}

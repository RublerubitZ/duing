package com.duing.domain.draft.controller.dto.request;

import com.duing.domain.draft.entity.ApplicationDraft.DraftAnswer;
import com.duing.domain.draft.service.dto.command.UpsertDraftCommand;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record UpsertDraftRequest(
        @NotNull(message = "answers 는 필수 입력값입니다.")
        List<DraftAnswerPayload> answers
) {

    public record DraftAnswerPayload(Long questionId, String value) {}

    public UpsertDraftCommand toCommand(Long userId, Long recruitmentId) {
        List<DraftAnswer> draftAnswers = answers.stream()
                .map(payload -> new DraftAnswer(payload.questionId(), payload.value()))
                .toList();
        return new UpsertDraftCommand(userId, recruitmentId, draftAnswers);
    }
}
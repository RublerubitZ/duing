package com.duing.domain.draft.controller.dto.request;

import com.duing.domain.draft.entity.ApplicationDraft.DraftAnswer;
import com.duing.domain.draft.service.dto.command.UpsertDraftCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record UpsertDraftRequest(
        // 임시저장 답변 개수 상한(50)은 모집 질문 개수 상한과 동일하게 둔다(제출 시 답변-질문 개수 일치 검증).
        // 개별 값 길이 상한은 List 원소에 @Valid 로 캐스케이드해 DraftAnswerPayload.value 에서 검증한다.
        @NotNull(message = "answers 는 필수 입력값입니다.")
        @Size(max = 50, message = "임시저장 답변은 최대 50개까지 저장할 수 있습니다.")
        List<@Valid DraftAnswerPayload> answers
) {

    public record DraftAnswerPayload(
            Long questionId,
            @Size(max = 2000, message = "답변은 2000자 이하여야 합니다.") String value
    ) {}

    public UpsertDraftCommand toCommand(Long userId, Long recruitmentId) {
        List<DraftAnswer> draftAnswers = answers.stream()
                .map(payload -> new DraftAnswer(payload.questionId(), payload.value()))
                .toList();
        return new UpsertDraftCommand(userId, recruitmentId, draftAnswers);
    }
}
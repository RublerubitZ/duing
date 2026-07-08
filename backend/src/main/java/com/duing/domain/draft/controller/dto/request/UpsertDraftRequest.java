package com.duing.domain.draft.controller.dto.request;

import com.duing.domain.draft.service.dto.command.UpsertDraftCommand;
import com.duing.domain.draft.service.dto.command.UpsertDraftCommand.DraftAnswerEntry;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record UpsertDraftRequest(
        // 임시저장 답변 개수 상한(50)은 모집 질문 개수 상한과 동일하게 둔다(제출 시 답변-질문 개수 일치 검증).
        // 개별 값 길이 상한은 List 원소에 @Valid 로 캐스케이드해 DraftAnswerPayload.value/values 에서 검증한다.
        // 원소 @NotNull 은 필수다 — @Size 컨테이너 제약도 @Valid 캐스케이드도 null 원소를 유효로 간주하므로
        // (Bean Validation 규약) answers:[null] 이 toCommand 까지 흘러들어와 NPE(500)가 된다.
        @NotNull(message = "answers 는 필수 입력값입니다.")
        @Size(max = 50, message = "임시저장 답변은 최대 50개까지 저장할 수 있습니다.")
        List<@NotNull(message = "임시저장 답변 항목은 null 일 수 없습니다.") @Valid DraftAnswerPayload> answers
) {

    public record DraftAnswerPayload(
            // legacy FE 는 questionId 를 JSON number 로 보낸다 — Jackson 이 숫자를 String 으로 강제변환한다.
            // 신 FE 는 질문 UUID(String) 를 그대로 보낸다.
            String questionId,
            // TODO(legacy-questions-v1): 신 FE 전환 후 제거 — values 로 대체된 legacy 단일 문자열 통로.
            @Size(max = 2000, message = "답변은 2000자 이하여야 합니다.") String value,
            @Size(max = 20, message = "답변 선택지는 최대 20개까지 저장할 수 있습니다.")
            List<@Size(max = 2000, message = "답변은 2000자 이하여야 합니다.") String> values
    ) {}

    public UpsertDraftCommand toCommand(Long userId, Long recruitmentId) {
        List<DraftAnswerEntry> draftAnswers = answers.stream()
                .map(payload -> new DraftAnswerEntry(payload.questionId(), payload.value(), payload.values()))
                .toList();
        return new UpsertDraftCommand(userId, recruitmentId, draftAnswers);
    }
}
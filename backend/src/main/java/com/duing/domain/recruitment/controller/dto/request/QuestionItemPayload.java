package com.duing.domain.recruitment.controller.dto.request;

import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.service.dto.command.QuestionItemCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 구조화 질문 페이로드. id 는 수정 시 왕복용 — 생성 시엔 서버가 무시하고 새로 발급한다 (스펙 §2.2). */
public record QuestionItemPayload(
        String id,

        @NotBlank(message = "질문 항목은 빈 문자열일 수 없습니다.")
        @Size(max = 500, message = "질문은 500자 이하여야 합니다.")
        String text,

        @NotNull(message = "질문 유형은 필수 입력값입니다.")
        QuestionType type,

        // null 이면 필수 질문으로 간주한다 (기본값 = 필수).
        Boolean required,

        // 원소 @NotNull 은 필수다 — @Size 컨테이너 제약은 null 원소를 유효로 간주하므로(Bean Validation 규약)
        // choices:[null] 이 toCommand 까지 흘러들어와 NPE(500)가 된다.
        @Size(max = 20, message = "선택지는 질문당 최대 20개까지 등록할 수 있습니다.")
        List<@NotNull(message = "선택지는 비어 있을 수 없습니다.") @Valid ChoiceItemPayload> choices
) {
    public record ChoiceItemPayload(
            String id,
            @NotBlank(message = "선택지는 빈 문자열일 수 없습니다.")
            @Size(max = 200, message = "선택지는 200자 이하여야 합니다.")
            String label
    ) {}

    public QuestionItemCommand toCommand() {
        return new QuestionItemCommand(
                id, text, type, required == null || required,
                choices == null ? List.of() : choices.stream()
                        .map(choice -> new QuestionItemCommand.ChoiceItemCommand(choice.id(), choice.label()))
                        .toList());
    }
}

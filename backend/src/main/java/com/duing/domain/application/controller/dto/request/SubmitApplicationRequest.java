package com.duing.domain.application.controller.dto.request;

import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record SubmitApplicationRequest(
        // 답변 개수 상한(50)은 모집 질문 개수 상한과 일치한다 — 제출 시 answers.size() == questions.size()
        // 를 검증하므로(GeneralApplicationService.validateAnswersAgainstForm) 어긋나면 정상 제출이 막힌다.
        // 개별 답변은 빈 문자열(무응답)을 허용하므로 @NotBlank 없이 길이 상한만 둔다.
        @NotNull(message = "답변 목록은 필수 입력값입니다.")
        @Size(max = 50, message = "답변은 최대 50개까지 제출할 수 있습니다.")
        List<@Size(max = 2000, message = "답변은 2000자 이하여야 합니다.") String> answers
) {
    public SubmitApplicationCommand toCommand(Long recruitmentId, Long userId) {
        return new SubmitApplicationCommand(recruitmentId, userId, answers);
    }
}

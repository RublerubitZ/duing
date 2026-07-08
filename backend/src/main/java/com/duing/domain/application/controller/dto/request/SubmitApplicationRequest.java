package com.duing.domain.application.controller.dto.request;

import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record SubmitApplicationRequest(
        // TODO(legacy-questions-v1): 신 FE 전환 후 제거 — 위치 기반 legacy 통로.
        // 답변 개수 상한(50)은 모집 질문 개수 상한과 일치한다 — 제출 시 answers.size() == questions.size()
        // 를 검증하므로(GeneralApplicationService.validateAnswersAgainstForm) 어긋나면 정상 제출이 막힌다.
        // 개별 답변은 빈 문자열(무응답)을 허용하므로 @NotBlank 없이 길이 상한만 둔다.
        // answerItems 와 정확히 하나만 채워야 하며, 그 검증은 SubmitApplicationCommand 컴팩트 생성자가 담당한다.
        @Size(max = 50, message = "답변은 최대 50개까지 제출할 수 있습니다.")
        List<@Size(max = 2000, message = "답변은 2000자 이하여야 합니다.") String> answers,

        // 원소 @NotNull 은 필수다 — @Size 컨테이너 제약도 @Valid 캐스케이드도 null 원소를 유효로 간주하므로
        // (Bean Validation 규약) answerItems:[null] 이 toCommand 까지 흘러들어와 NPE(500)가 된다.
        @Size(max = 50, message = "답변은 최대 50개까지 제출할 수 있습니다.")
        List<@NotNull(message = "답변 항목은 비어 있을 수 없습니다.") @Valid AnswerItemPayload> answerItems
) {
    /**
     * questionId 기반 구조화 답변. 컨테이너 {@code @Size} 는 null 원소를 유효로 통과시키므로
     * 원소 {@code @NotNull} 을 함께 둬, null 이 jsonb 까지 흘러 조회 응답에 새는 경로를 선제 차단한다.
     * {@code values} 자체가 null 인 경우는 ApplicationAnswer 컴팩트 생성자가 빈 목록으로 정규화한다.
     */
    public record AnswerItemPayload(
            @NotBlank(message = "questionId 는 필수 입력값입니다.")
            String questionId,

            @Size(max = 20, message = "선택 항목은 20개 이하여야 합니다.")
            List<@NotNull(message = "답변 값은 null 일 수 없습니다.")
                    @Size(max = 2000, message = "답변은 2000자 이하여야 합니다.") String> values
    ) {}

    public SubmitApplicationCommand toCommand(Long recruitmentId, Long userId) {
        return new SubmitApplicationCommand(recruitmentId, userId, answers,
                answerItems == null ? null : answerItems.stream()
                        .map(answerItem -> new SubmitApplicationCommand.AnswerItem(
                                answerItem.questionId(), answerItem.values()))
                        .toList());
    }
}

package com.duing.domain.club.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

// JSONB 스키마 진화 대비 — 미래 버전이 키를 추가해도 이 버전으로 롤백 시 역직렬화가 깨지지 않게 한다.
@JsonIgnoreProperties(ignoreUnknown = true)
public record ClubFaq(
        @NotNull(message = "FAQ 질문은 필수입니다.")
        @Size(min = 1, max = 200, message = "FAQ 질문은 1~200자여야 합니다.")
        String question,

        @NotNull(message = "FAQ 답변은 필수입니다.")
        @Size(min = 1, max = 2000, message = "FAQ 답변은 1~2000자여야 합니다.")
        String answer,

        @PositiveOrZero(message = "FAQ 순서는 0 이상이어야 합니다.")
        int order
) {
}

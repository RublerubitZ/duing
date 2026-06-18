package com.duing.domain.cashbook.controller.dto.request;

import jakarta.validation.constraints.NotNull;

public record UpdateCashbookExclusionRequest(
        @NotNull(message = "제외 여부는 필수입니다.") Boolean excluded) {
}

package com.duing.domain.fee.controller.dto.request;

import jakarta.validation.constraints.NotNull;

/**
 * 동아리 BANK 자동매칭 허용/해제 요청. {@code active=true} 면 허용(외부 등록), false 면 해제(외부 해제)다.
 */
public record UpdateBankMatchingRequest(
        @NotNull(message = "자동매칭 허용 여부(active)는 필수입니다.")
        Boolean active
) {
}

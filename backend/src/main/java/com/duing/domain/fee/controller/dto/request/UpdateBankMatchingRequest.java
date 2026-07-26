package com.duing.domain.fee.controller.dto.request;

import jakarta.validation.constraints.NotNull;

/**
 * 동아리 BANK 자동매칭 허용/해제 요청. {@code active=true} 면 허용, false 면 해제다.
 * 외부 부수효과 없는 DB 설정 변경이다(제공사에 계좌 등록 개념이 없다).
 */
public record UpdateBankMatchingRequest(
        @NotNull(message = "자동매칭 허용 여부(active)는 필수입니다.")
        Boolean active
) {
}

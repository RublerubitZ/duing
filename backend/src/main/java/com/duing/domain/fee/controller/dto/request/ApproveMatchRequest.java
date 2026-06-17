package com.duing.domain.fee.controller.dto.request;

import jakarta.validation.constraints.NotNull;

/** 검토 큐 승인 요청. 입금에 매칭할 후보 청구의 id 를 받는다. */
public record ApproveMatchRequest(
        @NotNull(message = "매칭할 청구 id 는 필수입니다.")
        Long feeBillId
) {
}

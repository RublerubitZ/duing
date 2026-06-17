package com.duing.domain.fee.controller.dto.request;

import jakarta.validation.constraints.Size;

public record VoidPaymentRequest(
        @Size(max = 200, message = "정정 사유는 200자를 넘을 수 없습니다.")
        String reason
) {}

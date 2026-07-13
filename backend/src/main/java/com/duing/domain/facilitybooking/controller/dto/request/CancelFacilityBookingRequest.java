package com.duing.domain.facilitybooking.controller.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CancelFacilityBookingRequest(
        @NotBlank(message = "취소 사유는 필수 입력값입니다.")
        @Size(max = 500, message = "취소 사유는 500자 이하로 입력해주세요.") String reason
) {}

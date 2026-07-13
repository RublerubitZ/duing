package com.duing.domain.facilitybooking.controller.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MarkConflictRequest(
        @NotBlank(message = "충돌 상세는 필수 입력값입니다.")
        @Size(max = 500, message = "충돌 상세는 500자 이하로 입력해주세요.") String detail
) {}

package com.duing.domain.user.controller.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 상태 조회는 토큰이 URL 에 남지 않도록 POST body 로 받는다(#626 — Access Log·Sentry breadcrumb 노출 차단). */
public record PhoneVerificationStatusRequest(
        @NotBlank(message = "인증 토큰은 필수 입력값입니다.")
        @Size(max = 36, message = "휴대폰 인증 정보가 올바르지 않습니다.")
        String verificationToken
) {
}

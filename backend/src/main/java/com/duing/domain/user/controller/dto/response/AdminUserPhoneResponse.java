package com.duing.domain.user.controller.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "원본 휴대폰 번호 (ADMIN 전용, 캐시 금지)")
public record AdminUserPhoneResponse(
        @Schema(description = "마스킹되지 않은 원본 번호", example = "010-2210-9983")
        String phone
) {
    public static AdminUserPhoneResponse from(String phone) {
        return new AdminUserPhoneResponse(phone);
    }
}

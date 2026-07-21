package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.service.dto.command.UpdateProfileCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record UpdateProfileRequest(
        // 한국어 기반 서비스 정책 — 가입(SignupRequest)과 동일하게 한글 완성형 2~7자만 허용.
        @NotBlank(message = "이름은 필수 입력값입니다.")
        @Pattern(regexp = "^[가-힣]{2,7}$", message = "이름은 한글 2~7자만 입력할 수 있습니다.")
        String name,

        // 학년 — 생략 시 기존 값 유지(선택). 전화번호는 이 API로 변경할 수 없다(번호 변경은 MO 재인증 필요).
        Grade grade
) {
    // 이름은 저장 전 앞뒤 공백을 제거한다 — 역직렬화 직후(검증 전) 실행되므로 @Pattern 도 trim 값 기준으로 평가된다.
    public UpdateProfileRequest {
        if (name != null) {
            name = name.strip();
        }
    }

    public UpdateProfileCommand toCommand(Long userId) {
        return new UpdateProfileCommand(userId, name, grade);
    }
}

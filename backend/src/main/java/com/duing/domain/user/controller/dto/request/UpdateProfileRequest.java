package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.service.dto.command.UpdateProfileCommand;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        // 한국어 기반 서비스 정책 — 가입(SignupRequest)과 동일하게 한글 완성형 2~7자만 허용.
        @NotBlank(message = "이름은 필수 입력값입니다.")
        @Pattern(regexp = UserNameRules.KOREAN_NAME_PATTERN, message = UserNameRules.KOREAN_NAME_MESSAGE)
        String name,

        // 학년 — 생략 시 기존 값 유지(선택). 전화번호는 이 API로 변경할 수 없다(번호 변경은 MO 재인증 필요).
        Grade grade,

        // 단과대학 — 생략 시 기존 값 유지(선택).
        College college,

        // 전공 학과 — 생략 시 기존 값 유지(선택). 제공되면 공백일 수 없다(아래 @AssertTrue).
        @Size(max = 50, message = "전공 학과는 50자 이하여야 합니다.")
        String major
) {
    // 이름·전공은 저장 전 앞뒤 공백을 제거한다 — 역직렬화 직후(검증 전) 실행되므로 @Pattern·@Size 도 trim 값 기준으로 평가된다.
    public UpdateProfileRequest {
        if (name != null) {
            name = name.strip();
        }
        if (major != null) {
            major = major.strip();
        }
    }

    // 전공은 선택값(null=유지)이지만, 제공됐다면 공백 문자열은 허용하지 않는다(400) — strip 후 빈 값이면 위반.
    @AssertTrue(message = "전공 학과는 공백일 수 없습니다.")
    public boolean isMajorPresentWhenProvided() {
        return major == null || !major.isBlank();
    }

    public UpdateProfileCommand toCommand(Long userId) {
        return new UpdateProfileCommand(userId, name, grade, college, major);
    }
}

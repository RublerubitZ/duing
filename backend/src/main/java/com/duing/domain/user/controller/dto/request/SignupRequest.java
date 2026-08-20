package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.service.dto.command.SignupCommand;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SignupRequest(
        @NotBlank(message = "학번은 필수 입력값입니다.")
        @Pattern(regexp = "\\d{8}", message = "학번은 8자리 숫자여야 합니다.")
        String studentId,

        // 허용 범위와 정책 배경은 UserNameRules.KOREAN_NAME_PATTERN 참고.
        @NotBlank(message = "이름은 필수 입력값입니다.")
        @Pattern(regexp = UserNameRules.KOREAN_NAME_PATTERN, message = UserNameRules.KOREAN_NAME_MESSAGE)
        String name,

        @NotBlank(message = "비밀번호는 필수 입력값입니다.")
        @Pattern(
                regexp = "^(?=.{8,20}$)(?:(?=.*[A-Za-z])(?=.*\\d)|(?=.*[A-Za-z])(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])|(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])).+$",
                message = "비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상을 포함해야 합니다."
        )
        String password,

        @NotNull(message = "학년은 필수 입력값입니다.")
        Grade grade,

        @NotNull(message = "단과대학은 필수 입력값입니다.")
        College college,

        @NotBlank(message = "전공 학과는 필수 입력값입니다.")
        @Size(max = 50, message = "전공 학과는 50자 이하여야 합니다.")
        String major,

        // 전화번호 입력란은 없다 — 번호는 MO 인증 스텝에서 입력되고, 저장 값은 항상 인증 세션에서 나온다 (spec §7.3).
        @NotBlank(message = "휴대폰 인증을 완료해주세요.")
        @Size(max = 36, message = "휴대폰 인증 정보가 올바르지 않습니다.")
        String verificationToken,

        @NotNull(message = "이용약관에 동의해야 합니다.")
        @AssertTrue(message = "이용약관에 동의해야 합니다.")
        Boolean termsOfServiceAgreed,

        @NotNull(message = "개인정보 수집·이용에 동의해야 합니다.")
        @AssertTrue(message = "개인정보 수집·이용에 동의해야 합니다.")
        Boolean privacyPolicyAgreed
) {
    // 이름은 저장 전 앞뒤 공백을 제거한다 — 역직렬화 직후(검증 전) 실행되므로 @Pattern 도 trim 값 기준으로 평가된다.
    public SignupRequest {
        if (name != null) {
            name = name.strip();
        }
    }

    public SignupCommand toCommand() {
        return new SignupCommand(studentId, name, password, grade, college, major, verificationToken);
    }
}

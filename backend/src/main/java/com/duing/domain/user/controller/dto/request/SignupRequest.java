package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.service.dto.command.SignupCommand;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SignupRequest(
        @NotBlank(message = "학번은 필수 입력값입니다.")
        @Pattern(regexp = "\\d{7,10}", message = "학번은 7~10자리 숫자여야 합니다.")
        String studentId,

        @NotBlank(message = "이름은 필수 입력값입니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name,

        @NotBlank(message = "이메일은 필수 입력값입니다.")
        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @Pattern(
                regexp = "^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\\.)*daegu\\.ac\\.kr$",
                message = "대구대학교 이메일(@daegu.ac.kr)만 사용할 수 있습니다."
        )
        @Size(max = 100, message = "이메일은 100자 이하여야 합니다.")
        String email,

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

        @NotBlank(message = "전화번호는 필수 입력값입니다.")
        @Pattern(regexp = "^010-\\d{4}-\\d{4}$", message = "전화번호는 010-XXXX-XXXX 형식이어야 합니다.")
        String phone,

        @AssertTrue(message = "이용약관에 동의해야 합니다.")
        Boolean termsOfServiceAgreed,

        @AssertTrue(message = "개인정보 수집·이용에 동의해야 합니다.")
        Boolean privacyPolicyAgreed
) {
    public SignupCommand toCommand() {
        return new SignupCommand(studentId, name, email, password, grade, college, major, phone);
    }
}

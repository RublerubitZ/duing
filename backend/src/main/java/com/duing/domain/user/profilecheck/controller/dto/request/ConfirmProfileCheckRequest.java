package com.duing.domain.user.profilecheck.controller.dto.request;

import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.profilecheck.service.dto.command.ConfirmProfileCheckCommand;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record ConfirmProfileCheckRequest(
        @NotNull(message = "학년도는 필수 입력값입니다.")
        Integer semesterYear,

        @NotNull(message = "학기는 필수 입력값입니다.")
        @Min(value = 1, message = "학기는 1 또는 2 여야 합니다.")
        @Max(value = 2, message = "학기는 1 또는 2 여야 합니다.")
        Integer semesterTerm,

        // 제안 학년을 수락할 때만 보낸다(절대값 — 다시 보내도 두 번 오르지 않는다). null 이면 현재 정보 그대로 확인.
        Grade grade
) {
    public ConfirmProfileCheckCommand toCommand(Long userId) {
        return new ConfirmProfileCheckCommand(userId, new Semester(semesterYear, semesterTerm), grade);
    }
}

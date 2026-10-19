package com.duing.domain.user.profilecheck.service.dto.command;

import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.profilecheck.entity.Semester;

/** {@code grade} 가 null 이면 현재 정보 그대로 확인, 있으면 서버 제안 학년 수락. */
public record ConfirmProfileCheckCommand(
        Long userId,
        Semester semester,
        Grade grade
) {
}

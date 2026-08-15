package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.AdminApplicantQuery;
import com.duing.domain.user.entity.College;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 총동연 지원자 목록 행. 운영진 목록과 달리 학년·답변 미리보기·평가 점수를 담지 않는다 —
 * 총동연은 심사 주체가 아니라 감독 주체라 신원 확인에 필요한 최소 항목만 본다.
 */
public record AdminApplicantResponse(
        Long applicationId,
        String userName,
        String studentId,
        College college,
        String major,
        ApplicationStatus status,
        Instant submittedAt
) {
    public static AdminApplicantResponse from(AdminApplicantQuery applicant) {
        return new AdminApplicantResponse(
                applicant.applicationId(),
                applicant.userName(),
                applicant.studentId(),
                applicant.college(),
                applicant.major(),
                applicant.status(),
                // 제출 시각은 JPA 감사 필드라 JVM 존 벽시계다(TIMEZONE.md — system regime).
                TimeMapper.systemWallClockToInstant(applicant.submittedAt())
        );
    }
}

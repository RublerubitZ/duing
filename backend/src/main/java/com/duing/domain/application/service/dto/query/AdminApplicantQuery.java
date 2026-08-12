package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.user.entity.College;
import java.time.LocalDateTime;

/**
 * 총동연 지원자 목록의 조회 원본 행 — QueryDSL projection 대상.
 * 총동연은 심사 주체가 아니라 감독 주체라 신원 확인 항목만 보므로, 답변(jsonb)·학년·평가 점수는
 * 애초에 SELECT 하지 않는다.
 */
public record AdminApplicantQuery(
        Long applicationId,
        ApplicationStatus status,
        LocalDateTime submittedAt,
        String userName,
        String studentId,
        College college,
        String major
) {}

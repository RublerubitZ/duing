package com.duing.domain.interview.service.dto.query;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;

/** 라운드 생성 후보 한 행 — application ⋈ user QueryDSL projection (RoundMemberLine 전례). */
public record RoundCandidateQuery(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        College college,
        String major,
        Grade grade,
        ApplicationStatus status,
        LocalDateTime submittedAt
) {}

package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.RoundMemberStatus;

/**
 * 상세 dashboard 멤버 테이블 한 행 — member ⋈ application ⋈ user QueryDSL projection.
 */
public record RoundMemberLine(
        Long memberId,
        Long applicationId,
        String userName,
        String studentId,
        RoundMemberStatus status,
        String alternativeAvailabilityText
) {}

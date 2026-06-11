package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.query.AutoAssignResult;

public interface InterviewAssignmentService {

    /**
     * 자동배정 (스펙 §6.1·§6.2·§9.1 API 8) — COLLECTING 첫 실행은 ASSIGNING 전이 동반,
     * ASSIGNING 재실행은 활성 draft 전체를 현재 상태 기준으로 재계산한다. RESPONDED 만 대상(Rule 1).
     */
    AutoAssignResult autoAssign(Long roundId, Long currentUserId);
}

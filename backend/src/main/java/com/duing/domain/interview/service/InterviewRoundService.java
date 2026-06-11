package com.duing.domain.interview.service;

import com.duing.domain.interview.controller.dto.response.AvailabilityRequestResponse;
import com.duing.domain.interview.service.dto.command.CreateInterviewRoundCommand;
import com.duing.domain.interview.service.dto.query.RoundCandidateQuery;
import java.util.List;

public interface InterviewRoundService {

    /**
     * 라운드 생성 wizard Step1 / 상시모집 대기열의 후보 목록을 조회한다.
     * 기본 후보군 = 큐(INTERVIEW_PENDING && placement-active 멤버십 없음),
     * includeUnderReview=true 시 서류 검토 중(UNDER_REVIEW) 지원자도 포함한다.
     */
    List<RoundCandidateQuery> getRoundCandidates(Long recruitmentId, Long currentUserId, boolean includeUnderReview);

    /**
     * wizard Step2 의 첫 persist — 면접 대상 선정(UNDER_REVIEW→INTERVIEW_PENDING 전이)과
     * 라운드(DRAFT)·멤버 생성을 한 트랜잭션으로 처리한다 (스펙 §9.1 API 2·§10.3).
     */
    Long createRound(CreateInterviewRoundCommand createCommand);

    /**
     * 발송: DRAFT → COLLECTING 전이 + INVITED 전원에게 Availability 요청 알림 (스펙 §9.1 API 5).
     * 가드 3종(슬롯≥1·INVITED≥1·deadline 필수/미래)은 wizard 발송 버튼 조건과 1:1 (§10.3).
     */
    AvailabilityRequestResponse requestAvailability(Long roundId, Long currentUserId);

    /**
     * 재알림: COLLECTING 라운드의 미응답(INVITED) 대상에게 새 회차로 재발송 (스펙 §9.1 API 6).
     */
    AvailabilityRequestResponse remind(Long roundId, Long currentUserId);
}


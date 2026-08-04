package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.command.CreateInterviewRoundCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewRoundCommand;
import com.duing.domain.interview.service.dto.query.AvailabilityRequestResult;
import com.duing.domain.interview.service.dto.query.RoundCandidateQuery;
import com.duing.domain.interview.service.dto.query.RoundDetailQuery;
import com.duing.domain.interview.service.dto.query.RoundSummaryQuery;
import java.util.List;

public interface InterviewRoundService {

    /**
     * 라운드 생성 wizard Step1 / 상시모집 대기열의 후보 목록을 조회한다.
     * 기본 후보군 = 큐(INTERVIEW_PENDING && placement-active 멤버십 없음),
     * includeUndecided=true 시 미결정 상태(SUBMITTED·ON_HOLD) 지원자도 포함한다.
     */
    List<RoundCandidateQuery> getRoundCandidates(Long recruitmentId, Long currentUserId, boolean includeUndecided);

    /**
     * wizard Step2 의 첫 persist — 면접 대상 선정(SUBMITTED·ON_HOLD→INTERVIEW_PENDING 전이)과
     * 라운드(DRAFT)·멤버 생성을 한 트랜잭션으로 처리한다 (스펙 §9.1 API 2·§10.3).
     */
    Long createRound(CreateInterviewRoundCommand createCommand);

    /**
     * 발송: DRAFT → COLLECTING 전이 + INVITED 전원에게 Availability 요청 알림 (스펙 §9.1 API 5).
     * 가드 3종(슬롯≥1·INVITED≥1·deadline 필수/미래)은 wizard 발송 버튼 조건과 1:1 (§10.3).
     */
    AvailabilityRequestResult requestAvailability(Long roundId, Long currentUserId);

    /**
     * 재알림: COLLECTING 라운드의 미응답(INVITED) 대상에게 새 회차로 재발송 (스펙 §9.1 API 6).
     */
    AvailabilityRequestResult remind(Long roundId, Long currentUserId);

    /**
     * 라운드 부분 수정 (스펙 §9.1 API 7) — null 필드는 무변경. title/location 은 ASSIGNING 까지,
     * deadline 은 DRAFT(미래 자유)·COLLECTING(연장만).
     */
    void updateRound(UpdateInterviewRoundCommand updateCommand);

    /**
     * 라운드 취소 (스펙 §9.1 API 12·§16-2) — CANCELLED 전이 + 활성 schedule 전부 정리.
     * 멤버는 전이 없이 자동 재큐잉, 알림 없음 (§8).
     */
    void cancelRound(Long roundId, Long currentUserId);

    /** 라운드 목록 — 최신 생성 순 + 멤버 카운트 요약 (스펙 §9.1 API 3). */
    List<RoundSummaryQuery> getRounds(Long recruitmentId, Long currentUserId);

    /** 라운드 상세 dashboard — 카운트 카드·멤버 테이블(파생 미응답)·슬롯 집계 (스펙 §10.4). */
    RoundDetailQuery getRoundDetail(Long roundId, Long currentUserId);

    void softDeleteAllOnClubClosure(List<Long> recruitmentIds);
}


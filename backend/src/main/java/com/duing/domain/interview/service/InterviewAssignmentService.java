package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.query.AutoAssignResult;
import com.duing.domain.interview.service.dto.query.ConfirmResult;

public interface InterviewAssignmentService {

    /**
     * 자동배정 (스펙 §6.1·§6.2·§9.1 API 8) — COLLECTING 첫 실행은 ASSIGNING 전이 동반,
     * ASSIGNING 재실행은 활성 draft 전체를 현재 상태 기준으로 재계산한다. RESPONDED 만 대상(Rule 1).
     */
    AutoAssignResult autoAssign(Long roundId, Long currentUserId);

    /**
     * 수동 배정/재배정 (스펙 §9.1 API 9) — ASSIGNING 한정, 비제외 멤버 전부 가능
     * (가능없음·미응답 포함 — 운영진 재량), capacity 하드 체크, per-member schedule 교체.
     * 멤버 상태는 불변 (draft semantics — ASSIGNED 전이는 확정 전용).
     */
    void assignSchedule(Long roundId, Long memberId, Long slotId, Long currentUserId);

    /** 배정 해제 (스펙 §9.1 API 9) — ASSIGNING 한정, 활성 배정이 없으면 404. */
    void unassignSchedule(Long roundId, Long memberId, Long currentUserId);

    /**
     * 멤버 제외 (스펙 §9.1 API 10) — DRAFT·COLLECTING·ASSIGNING 에서 EXCLUDED 전이 +
     * 활성 schedule 정리(§16-3) + 대기열 즉시 복귀 (application 은 INTERVIEW_PENDING 유지).
     */
    void excludeMember(Long roundId, Long memberId, Long currentUserId);

    /**
     * 라운드 확정 (스펙 §6.3·§9.1 API 11) — ASSIGNED 전이·INTERVIEW_SCHEDULED 알림의 유일한 지점.
     * 미처리(활성 배정 미보유) 멤버가 있으면 force 없이는 경고 2종 분리 409, force 면 자동 EXCLUDED.
     */
    ConfirmResult confirmRound(Long roundId, boolean force, Long currentUserId);

    /**
     * 회원 탈퇴 정리(#1637) — 취소되지 않은 라운드에서 이 회원의 가능 시간 응답과 배정을 지우고 멤버를 제외한다(확정 멤버 포함).
     * 탈퇴한 지원자는 운영진 인원 목록에 없어 아무도 처리할 수 없으므로, 자동 배정·확정·정원·슬롯별 집계에 남기지 않는다.
     */
    void releaseAllOnWithdrawal(Long userId);
}

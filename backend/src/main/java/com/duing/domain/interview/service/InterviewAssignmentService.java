package com.duing.domain.interview.service;

import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.service.dto.query.AutoAssignResult;
import com.duing.domain.interview.service.dto.query.ConfirmResult;

public interface InterviewAssignmentService {

    /**
     * 자동배정 (스펙 §6.1·§6.2·§9.1 API 8) — COLLECTING 첫 실행은 ASSIGNING 전이 동반,
     * ASSIGNING 재실행은 활성 draft 전체를 현재 상태 기준으로 재계산한다. RESPONDED 만 대상(Rule 1).
     */
    AutoAssignResult autoAssign(Long roundId, Long currentUserId);

    /**
     * 수동 배정/재배정 (스펙 §6.4·§9.1 API 9) — 배정 검토(ASSIGNING)의 초안 배정과 확정(SCHEDULED)의 개별 일정 변경
     * (SCHEDULED 는 성공 시 INTERVIEW_UPDATED 알림). 비제외 멤버 전부 가능 (가능없음·미응답 포함 — 운영진 재량),
     * capacity 하드 체크, per-member schedule 교체. 멤버 상태는 불변 (ASSIGNED 전이는 확정 전용).
     * expectedRoundStatus 는 요청자가 화면에서 본 단계 — 있고 잠근 라운드의 단계와 다르면 RoundStatusChanged(409),
     * null 이면 검사하지 않는다(옛 클라이언트).
     * 결과가 정해진(합격·불합격) 지원은 단계와 무관하게 ApplicationAlreadyDecided(409).
     * 지금 배정과 같은 슬롯이면 아무것도 바꾸지 않는다(알림 없음).
     */
    void assignSchedule(Long roundId, Long memberId, Long slotId, RoundStatus expectedRoundStatus, Long currentUserId);

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

    /**
     * 결과 확정 정리 — 결과(합격·불합격)를 정한 지원을 진행 중 라운드(초안·응답 수집·배정 검토)에서 빼고, 그 라운드의 가능 시간 응답과
     * 초안 배정을 지운다. 결과가 정해진 사람은 면접을 보지 않으므로 응답 미수집·자동 배정·재초대·정원에 남기지 않는다.
     * 확정·취소 라운드와 확정 멤버는 그대로 둔다 — 면접을 본 뒤 결과를 정하는 것이 정상 흐름이라 끝난 면접의 배정 기록을 남긴다.
     * 총동연 정리는 부르지 않는다 — 동아리 폐쇄는 모집·라운드째 지우고, 운영 중단 정리는 모집을 마감한 뒤 일괄 불합격해
     * 그 라운드는 아카이브라 표시만 남는다.
     */
    void releaseOnResultDecided(Long applicationId);
}

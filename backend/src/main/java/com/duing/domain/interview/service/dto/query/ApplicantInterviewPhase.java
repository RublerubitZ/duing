package com.duing.domain.interview.service.dto.query;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;

/**
 * 지원자에게 노출되는 면접 진행 단계 — 서버 단독 파생(SSOT, 스펙 §9.3).
 * raw member/round status 는 이 enum 으로만 변환되어 나가며, FE 재파생은 금지다.
 * EXCLUDED 등 내부 상태는 어떤 조합에서도 노출되지 않는다 (WAITING_NEXT_ROUND·SCHEDULING 중립 카피).
 */
public enum ApplicantInterviewPhase {
    NOT_APPLICABLE,
    DOCUMENT_REVIEW,
    WAITING_ROUND,
    WAITING_NEXT_ROUND,
    AVAILABILITY_REQUESTED,
    AVAILABILITY_CLOSED,
    RESPONDED,
    NO_SLOT_REPORTED,
    SCHEDULING,
    SCHEDULED;

    /**
     * 평가 순서 (스펙 §9.3):
     * 0) 평가~면접 구간 밖(SUBMITTED/ACCEPTED/REJECTED)은 visible 여부와 무관하게 NOT_APPLICABLE.
     * 1) visible 멤버십(DRAFT 제외 — §5.4 isVisibleToApplicant) 유무 — 호출자가 쿼리로 판정해
     *    visibleRoundStatus/memberStatus 를 null 또는 non-null 로 전달한다.
     * 2) visible 없음 → application 상태 분기. 참여 이력(CANCELLED 라운드 또는 EXCLUDED 멤버십)이
     *    있으면 "다음 회차 안내 대기" — DRAFT 멤버십만 있는 경우는 이력이 아니다.
     * 3) visible 있음 → 표 순서대로: INVITED 의 마감 전/후 → RESPONDED → NO_AVAILABLE_SLOT(라운드
     *    단계 무관) → ASSIGNING → SCHEDULED+ASSIGNED. 도달 불가 조합은 중립값 SCHEDULING.
     * 평가~면접 구간 밖(SUBMITTED/ACCEPTED/REJECTED)은 NOT_APPLICABLE — application 결과 뷰가 담당.
     */
    public static ApplicantInterviewPhase derive(ApplicationStatus applicationStatus,
                                                 RoundStatus visibleRoundStatus,
                                                 RoundMemberStatus memberStatus,
                                                 boolean hasConcludedMembership,
                                                 boolean deadlinePassed) {
        // 평가~면접 구간 밖 상태가 최우선이다 (스펙 §9.3 평가 순서 0) — 합불 처리 후 visible 멤버십이
        // 잔존해도 AVAILABILITY_* 류가 노출되면 안 된다 (예: COLLECTING 중 REJECTED 처리된 지원자).
        if (applicationStatus != ApplicationStatus.UNDER_REVIEW
                && applicationStatus != ApplicationStatus.INTERVIEW_PENDING) {
            return NOT_APPLICABLE;
        }
        if (visibleRoundStatus == null) {
            return switch (applicationStatus) {
                case UNDER_REVIEW -> DOCUMENT_REVIEW;
                case INTERVIEW_PENDING -> hasConcludedMembership ? WAITING_NEXT_ROUND : WAITING_ROUND;
                default -> NOT_APPLICABLE;
            };
        }
        if (memberStatus == RoundMemberStatus.INVITED && visibleRoundStatus == RoundStatus.COLLECTING) {
            return deadlinePassed ? AVAILABILITY_CLOSED : AVAILABILITY_REQUESTED;
        }
        if (memberStatus == RoundMemberStatus.RESPONDED && visibleRoundStatus == RoundStatus.COLLECTING) {
            return RESPONDED;
        }
        if (memberStatus == RoundMemberStatus.NO_AVAILABLE_SLOT) {
            return NO_SLOT_REPORTED;
        }
        if (visibleRoundStatus == RoundStatus.ASSIGNING) {
            return SCHEDULING;
        }
        if (memberStatus == RoundMemberStatus.ASSIGNED && visibleRoundStatus == RoundStatus.SCHEDULED) {
            return SCHEDULED;
        }
        return SCHEDULING;
    }
}

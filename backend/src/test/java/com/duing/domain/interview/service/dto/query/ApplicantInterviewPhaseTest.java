package com.duing.domain.interview.service.dto.query;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

// applicantPhase 파생 진리표 (스펙 §9.3 — 평가 순서: visible 유무 → 무소속 분기 → 표 순서 조합).
// raw 내부 상태(EXCLUDED 등)가 phase 로 노출되지 않는 것이 SSOT 의 핵심이다.
class ApplicantInterviewPhaseTest {

    @Test
    @DisplayName("서류 검토 중인 지원자는 DOCUMENT_REVIEW 로 파생된다")
    void underReviewDerivesDocumentReview() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.UNDER_REVIEW, null, null, false, false))
                .isEqualTo(ApplicantInterviewPhase.DOCUMENT_REVIEW);
    }

    @Test
    @DisplayName("면접 대상이지만 라운드 참여 이력이 없으면 WAITING_ROUND 로 파생된다")
    void pendingWithoutHistoryDerivesWaitingRound() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, null, null, false, false))
                .isEqualTo(ApplicantInterviewPhase.WAITING_ROUND);
    }

    @Test
    @DisplayName("취소·제외로 라운드를 거쳐온 면접 대상은 WAITING_NEXT_ROUND 로 파생된다")
    void pendingWithConcludedHistoryDerivesWaitingNextRound() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, null, null, true, false))
                .isEqualTo(ApplicantInterviewPhase.WAITING_NEXT_ROUND);
    }

    @Test
    @DisplayName("평가 구간 밖 상태(제출됨·합격·불합격)는 NOT_APPLICABLE 로 파생된다")
    void outOfScopeStatusesDeriveNotApplicable() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.SUBMITTED, null, null, false, false))
                .isEqualTo(ApplicantInterviewPhase.NOT_APPLICABLE);
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.ACCEPTED, null, null, false, false))
                .isEqualTo(ApplicantInterviewPhase.NOT_APPLICABLE);
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.REJECTED, null, null, true, false))
                .isEqualTo(ApplicantInterviewPhase.NOT_APPLICABLE);
    }

    @Test
    @DisplayName("응답 수집 중 초대 상태이고 마감 전이면 AVAILABILITY_REQUESTED 로 파생된다")
    void invitedCollectingBeforeDeadline() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.COLLECTING,
                RoundMemberStatus.INVITED, false, false))
                .isEqualTo(ApplicantInterviewPhase.AVAILABILITY_REQUESTED);
    }

    @Test
    @DisplayName("응답 수집 중 초대 상태이고 마감이 지났으면 AVAILABILITY_CLOSED 로 파생된다")
    void invitedCollectingAfterDeadline() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.COLLECTING,
                RoundMemberStatus.INVITED, false, true))
                .isEqualTo(ApplicantInterviewPhase.AVAILABILITY_CLOSED);
    }

    @Test
    @DisplayName("응답을 완료한 멤버는 RESPONDED 로 파생된다")
    void respondedCollecting() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.COLLECTING,
                RoundMemberStatus.RESPONDED, false, false))
                .isEqualTo(ApplicantInterviewPhase.RESPONDED);
    }

    @Test
    @DisplayName("가능한 슬롯이 없다고 응답한 멤버는 라운드 단계와 무관하게 NO_SLOT_REPORTED 로 파생된다")
    void noAvailableSlotWinsOverRoundPhase() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.COLLECTING,
                RoundMemberStatus.NO_AVAILABLE_SLOT, false, false))
                .isEqualTo(ApplicantInterviewPhase.NO_SLOT_REPORTED);
        // 표 순서: NO_AVAILABLE_SLOT 행이 ASSIGNING 행보다 위 — 배정 검토 중에도 "조율 중" 카피가 정확하다.
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.ASSIGNING,
                RoundMemberStatus.NO_AVAILABLE_SLOT, false, true))
                .isEqualTo(ApplicantInterviewPhase.NO_SLOT_REPORTED);
    }

    @Test
    @DisplayName("배정 검토 중(ASSIGNING) 라운드의 응답 멤버는 SCHEDULING 로 파생된다")
    void assigningDerivesScheduling() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.ASSIGNING,
                RoundMemberStatus.RESPONDED, false, true))
                .isEqualTo(ApplicantInterviewPhase.SCHEDULING);
    }

    @Test
    @DisplayName("일정이 확정된 라운드의 배정 멤버는 SCHEDULED 로 파생된다")
    void assignedInScheduledRound() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.SCHEDULED,
                RoundMemberStatus.ASSIGNED, false, true))
                .isEqualTo(ApplicantInterviewPhase.SCHEDULED);
    }

    @Test
    @DisplayName("정상 경로로 도달할 수 없는 조합은 중립 카피인 SCHEDULING 으로 방어한다")
    void unreachableCombinationFallsBackToScheduling() {
        // SCHEDULED 라운드의 INVITED — 강제확정 시 자동 EXCLUDED 라 도달 불가, 내부 상태 누출 없는 중립값으로.
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.SCHEDULED,
                RoundMemberStatus.INVITED, false, true))
                .isEqualTo(ApplicantInterviewPhase.SCHEDULING);
    }

    @Test
    @DisplayName("합불 처리 후 라운드 멤버십이 남아 있어도 NOT_APPLICABLE 이 우선한다")
    void outOfScopeStatusWinsOverVisibleMembership() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.REJECTED, RoundStatus.COLLECTING,
                RoundMemberStatus.INVITED, false, false))
                .isEqualTo(ApplicantInterviewPhase.NOT_APPLICABLE);
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.ACCEPTED, RoundStatus.SCHEDULED,
                RoundMemberStatus.ASSIGNED, false, true))
                .isEqualTo(ApplicantInterviewPhase.NOT_APPLICABLE);
    }

    @Test
    @DisplayName("어떤 입력 조합도 내부 멤버 상태명(EXCLUDED 등)을 phase 로 노출하지 않는다")
    void phaseNamesNeverLeakInternalStatuses() {
        for (ApplicantInterviewPhase phase : ApplicantInterviewPhase.values()) {
            assertThat(phase.name()).doesNotContain("EXCLUDED");
            assertThat(phase.name()).doesNotContain("INVITED");
        }
    }
}

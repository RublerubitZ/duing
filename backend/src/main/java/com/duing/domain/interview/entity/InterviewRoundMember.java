package com.duing.domain.interview.entity;

import com.duing.domain.interview.exception.InterviewException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 라운드 멤버십 + 응답 상태 단일 머신.
 * <p>
 * soft delete 를 사용하지 않는다 — 멤버 종결은 {@link RoundMemberStatus#EXCLUDED} 상태로 표현한다.
 * (round_id, application_id) 일반 UNIQUE 를 availability/schedule 의 composite FK 타겟으로
 * 쓰기 위한 결정이다 (스펙 §4 — partial unique 는 FK 타겟이 될 수 없다).
 */
@Getter
@Entity
@Table(name = "interview_round_member")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InterviewRoundMember extends BaseEntity {

    @Column(name = "round_id", nullable = false)
    private Long roundId;

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private RoundMemberStatus status;

    @Column(name = "alternative_availability_text", length = 500)
    private String alternativeAvailabilityText;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewRoundMember(Long roundId, Long applicationId) {
        this.roundId = roundId;
        this.applicationId = applicationId;
        this.status = RoundMemberStatus.INVITED;
    }

    public static InterviewRoundMember invite(Long roundId, Long applicationId) {
        return InterviewRoundMember.builder()
                .roundId(roundId)
                .applicationId(applicationId)
                .build();
    }

    /** 미응답(NO_RESPONSE) 파생 — 저장하지 않고 INVITED ∧ 마감 경과로 판정한다 ({@link RoundMemberStatus} 계약 주석 참조). */
    public boolean isUnresponded(boolean availabilityDeadlinePassed) {
        return this.status.isUnresponded(availabilityDeadlinePassed);
    }

    /**
     * Rule 2 (스펙 §5.5): COLLECTING && 마감 전 추가 슬롯 생성 시 NO_AVAILABLE_SLOT → INVITED 복귀.
     * 대체 가능시간 텍스트는 비운다 — INVITED 상태에 이전 응답이 남으면 dashboard 표시가 오염되고,
     * 재응답 시 어차피 새로 쓰인다.
     */
    public void reinviteAfterSlotAdded() {
        if (this.status != RoundMemberStatus.NO_AVAILABLE_SLOT) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }
        this.status = RoundMemberStatus.INVITED;
        this.alternativeAvailabilityText = null;
    }

    /**
     * 응답(슬롯 선택) — INVITED·RESPONDED·NO_AVAILABLE_SLOT 상호 전환 가능 (스펙 §5.2,
     * COLLECTING && 마감 전 가드는 서비스 담당). 이전 가능없음 텍스트는 stale 이므로 비운다.
     */
    public void markResponded() {
        requireRespondableStatus();
        this.status = RoundMemberStatus.RESPONDED;
        this.alternativeAvailabilityText = null;
    }

    /**
     * 응답(가능한 슬롯 없음) — Rule 1 (스펙 §5.5): 자동배정 대상에서 빠지고 수동 처리 전용이 된다.
     * 텍스트는 비구조 자유텍스트로 매칭에 쓰이지 않는다.
     */
    public void reportNoAvailableSlot(String alternativeText) {
        requireRespondableStatus();
        this.status = RoundMemberStatus.NO_AVAILABLE_SLOT;
        this.alternativeAvailabilityText = normalizeNullable(alternativeText);
    }

    /**
     * 확정: ASSIGNED 전이의 유일한 지점 (§6.3·§16-1). 분류 기준은 "활성 schedule 보유"(서비스 검증)라
     * 수동 배정된 INVITED·NO_AVAILABLE_SLOT 도 대상 — §6.3 문언이 §5.2 주 경로 서술보다 우선한다.
     */
    public void confirmAssigned() {
        if (this.status == RoundMemberStatus.ASSIGNED || this.status == RoundMemberStatus.EXCLUDED) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }
        this.status = RoundMemberStatus.ASSIGNED;
    }

    /**
     * 제외: 라운드 종결의 유일한 멤버 경로 (§5.2 — soft delete 미사용, §16-5). 지원자에겐
     * 중립 phase(WAITING_NEXT_ROUND)로만 보이고 application 은 INTERVIEW_PENDING 유지라
     * 즉시 대기열 복귀한다. 가능없음 텍스트는 운영 기록으로 보존한다.
     */
    public void exclude() {
        if (this.status == RoundMemberStatus.ASSIGNED || this.status == RoundMemberStatus.EXCLUDED) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }
        this.status = RoundMemberStatus.EXCLUDED;
    }

    private void requireRespondableStatus() {
        if (this.status != RoundMemberStatus.INVITED
                && this.status != RoundMemberStatus.RESPONDED
                && this.status != RoundMemberStatus.NO_AVAILABLE_SLOT) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

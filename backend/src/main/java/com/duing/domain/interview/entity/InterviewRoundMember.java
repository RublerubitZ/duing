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
}

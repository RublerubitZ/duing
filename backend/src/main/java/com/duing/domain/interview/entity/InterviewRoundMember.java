package com.duing.domain.interview.entity;

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
}

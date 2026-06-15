package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.RoundStatus;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewRoundRepository extends JpaRepository<InterviewRound, Long> {

    /**
     * 지원자 노출(stepper·applicantPhase) 전용 — isVisibleToApplicant 술어 (스펙 §5.4).
     * DRAFT 라운드는 발송 전이므로 지원자에게 보이지 않는다.
     * 배치·중복방지 검증에는 isActiveForPlacement(DRAFT 포함) 조회를 써야 하며
     * 두 술어를 혼용하지 않는다 — placement 조회는 라운드 생성 PR(BE#2~3)에서 추가된다.
     * 불변식상 결과는 최대 1건이다 (placement-active 멤버십 최대 1개 ⊇ visible).
     */
    @Query("""
            select r
              from InterviewRound r
              join InterviewRoundMember m on m.roundId = r.id
             where m.applicationId = :applicationId
               and m.status <> com.duing.domain.interview.entity.RoundMemberStatus.EXCLUDED
               and r.status in (com.duing.domain.interview.entity.RoundStatus.COLLECTING,
                                com.duing.domain.interview.entity.RoundStatus.ASSIGNING,
                                com.duing.domain.interview.entity.RoundStatus.SCHEDULED)
            """)
    Optional<InterviewRound> findVisibleToApplicantRoundByApplicationId(@Param("applicationId") Long applicationId);

    /** 자동배정·확정·취소 등 round writer 간 직렬화 (스펙 §7) — @Version 충돌 대신 선두에서 잠근다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM InterviewRound r WHERE r.id = :id")
    Optional<InterviewRound> findByIdForUpdate(@Param("id") Long id);

    boolean existsByRecruitmentIdAndStatus(Long recruitmentId, RoundStatus status);

    List<InterviewRound> findByRecruitmentIdOrderByCreatedAtDesc(Long recruitmentId);
}

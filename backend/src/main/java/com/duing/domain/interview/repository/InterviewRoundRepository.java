package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.recruitment.repository.RecruitmentCountRow;
import java.util.Collection;
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

    /**
     * 인가 전용 스칼라 조회 — 잠금 앞에서 엔티티를 읽으면 1차 캐시에 올라가 뒤이은 FOR UPDATE 조회가
     * stale 스냅샷을 돌려준다. 소속 모집 id 만 읽어 인가를 먼저 끝내고 잠금은 그 뒤에 잡는다 (#839).
     */
    @Query("SELECT r.recruitmentId FROM InterviewRound r WHERE r.id = :id")
    Optional<Long> findRecruitmentIdById(@Param("id") Long id);

    boolean existsByRecruitmentIdAndStatus(Long recruitmentId, RoundStatus status);

    /**
     * 기간 종료 자동 마감을 막는 진행 중 면접 라운드 수(모집별) — 잡의 마감 판정과 화면의 자동 마감 전망이 이 한
     * 쿼리를 쓴다(#1572). 삭제된 라운드는 세지 않는다(@SQLRestriction 과 함께 명시). 건수가 0 인 모집은 행이 없다.
     * 빈 컬렉션으로 부르지 않는다.
     */
    @Query("SELECT round.recruitmentId AS recruitmentId, COUNT(round) AS itemCount FROM InterviewRound round "
            + "WHERE round.recruitmentId IN :recruitmentIds AND round.status IN :statuses AND round.deletedAt IS NULL "
            + "GROUP BY round.recruitmentId")
    List<RecruitmentCountRow> countByRecruitmentIdsAndStatusIn(
            @Param("recruitmentIds") Collection<Long> recruitmentIds,
            @Param("statuses") Collection<RoundStatus> statuses);

    List<InterviewRound> findByRecruitmentIdOrderByCreatedAtDesc(Long recruitmentId);
}

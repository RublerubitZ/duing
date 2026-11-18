package com.duing.domain.interview.repository;

import com.duing.domain.application.entity.ApplicationStatus;
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

    boolean existsByRecruitmentIdAndStatusNot(Long recruitmentId, RoundStatus status);

    /**
     * 기간 종료 자동 마감을 막는 진행 중 면접 라운드 수(모집별) — 결과를 기다리는 면접 대상(제외되지 않았고 지원에 결과가 없으며
     * 지원 삭제·지원자 탈퇴가 아닌 멤버)이 남은 라운드만 센다. 잡의 마감 판정과 화면의 자동 마감 전망이 이 한 쿼리를 쓴다(#1572).
     * 그 멤버의 지원은 결과 없는 지원 수에도 같은 기준으로 잡혀 라운드 조건이 혼자 마감을 막는 일은 없다 — 할 일 없는 라운드는 막지 않는다.
     * 삭제된 라운드·지원과 탈퇴한 지원자는 @SQLRestriction 에 기대지 않고 명시해 거른다(결과 없는 지원 수 집계와 같은 기준).
     * {@code u.deletedAt} 조건은 빼지 않는다 — u 를 참조하는 곳이 없으면 Hibernate 가 users 조인째 빼서 탈퇴한 지원자가 다시 잡힌다.
     * 건수가 0 인 모집은 행이 없다. 빈 컬렉션으로 부르지 않는다.
     */
    @Query("SELECT round.recruitmentId AS recruitmentId, COUNT(round) AS itemCount FROM InterviewRound round "
            + "WHERE round.recruitmentId IN :recruitmentIds AND round.status IN :statuses AND round.deletedAt IS NULL "
            + "AND EXISTS (SELECT 1 FROM InterviewRoundMember m, Application a JOIN a.user u "
            + "WHERE m.roundId = round.id AND a.id = m.applicationId "
            + "AND m.status <> com.duing.domain.interview.entity.RoundMemberStatus.EXCLUDED "
            + "AND a.deletedAt IS NULL AND a.status IN :awaitingStatuses AND u.deletedAt IS NULL) "
            + "GROUP BY round.recruitmentId")
    List<RecruitmentCountRow> countByRecruitmentIdsAndStatusInWithAwaitingMembers(
            @Param("recruitmentIds") Collection<Long> recruitmentIds,
            @Param("statuses") Collection<RoundStatus> statuses,
            @Param("awaitingStatuses") Collection<ApplicationStatus> awaitingStatuses);

    List<InterviewRound> findByRecruitmentIdOrderByCreatedAtDesc(Long recruitmentId);
}

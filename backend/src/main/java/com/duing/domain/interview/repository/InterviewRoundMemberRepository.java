package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewRoundMemberRepository
        extends JpaRepository<InterviewRoundMember, Long>, InterviewRoundMemberRepositoryCustom {

    List<InterviewRoundMember> findByRoundIdAndStatus(Long roundId, RoundMemberStatus status);

    Optional<InterviewRoundMember> findByRoundIdAndApplicationId(Long roundId, Long applicationId);

    /** 같은 멤버 행의 동시 writer(응답 vs Rule 2 재초대 등)를 직렬화한다 (스펙 §16-7-2). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM InterviewRoundMember m WHERE m.id = :id")
    Optional<InterviewRoundMember> findByIdForUpdate(@Param("id") Long id);

    /** Rule 2 재초대 대상 잠금 조회 — ORDER BY id 로 잠금 순서를 고정해 교착을 방지한다 (스펙 §16-7-2). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM InterviewRoundMember m WHERE m.roundId = :roundId AND m.status = :status ORDER BY m.id ASC")
    List<InterviewRoundMember> findAllByRoundIdAndStatusForUpdate(@Param("roundId") Long roundId,
                                                                  @Param("status") RoundMemberStatus status);

    /** 소유권(roundId)을 잠금 술어에 포함 — 타 라운드 멤버 행을 잠그지 않고 거부한다 (§16-7-2). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM InterviewRoundMember m WHERE m.id = :id AND m.roundId = :roundId")
    Optional<InterviewRoundMember> findByIdAndRoundIdForUpdate(@Param("id") Long id,
                                                               @Param("roundId") Long roundId);

    /** 확정의 분류·전이는 전 상태 멤버 대상 — 전 멤버 잠금 (§16-7-2·§16-7-4, ORDER BY id). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM InterviewRoundMember m WHERE m.roundId = :roundId ORDER BY m.id ASC")
    List<InterviewRoundMember> findAllByRoundIdForUpdate(@Param("roundId") Long roundId);

    /**
     * 회원 탈퇴 정리 대상(#1637) — 이 회원의 지원서가 든, 취소되지 않은 라운드의 멤버 행.
     * 지원서·라운드 조건은 서브쿼리로 둬 FROM 에 멤버만 남긴다 — FOR UPDATE 가 지원서·라운드 행까지 잠그지 않는다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM InterviewRoundMember m "
            + "WHERE m.applicationId IN (SELECT a.id FROM Application a WHERE a.user.id = :userId) "
            + "AND m.roundId IN (SELECT r.id FROM InterviewRound r "
            + "WHERE r.status <> com.duing.domain.interview.entity.RoundStatus.CANCELLED) "
            + "ORDER BY m.id ASC")
    List<InterviewRoundMember> findAllOfUserInUncancelledRoundsForUpdate(@Param("userId") Long userId);

    /**
     * 결과 확정 정리 대상 — 이 지원서의 멤버 가운데 아직 제외·확정되지 않은 것
     * ({@link RoundMemberStatus#excludableSet()} — exclude() 와 같은 판정), 넘긴 상태의 라운드에서.
     * memberStatuses 에는 excludableSet() 만 넘긴다 — 더 넓으면 exclude() 가 409, 더 좁으면 결과를 정한 사람이 진행 중 라운드에 남는다.
     * 멤버 상태 조건을 빼면 안 된다 — 운영진이 먼저 제외한 멤버십(EXCLUDED)이 진행 중 라운드에 남을 수 있고, 그 행을 잡으면 exclude() 가
     * 409 를 던져 결과를 정할 수 없다. 라운드 조건은 서브쿼리로 둬 FOR UPDATE 가 라운드 행을 잠그지 않는다.
     * 멤버 상태는 잠금 행의 술어라 먼저 커밋된 동시 확정이 ASSIGNED·EXCLUDED 로 바꾼 행은 다시 확인돼 빠진다. 라운드 조건은 문장 스냅샷이라
     * 이 문장이 시작된 뒤 커밋된 취소 라운드의 멤버는 정리될 수 있다 — 결과가 정해진 사람이라 해는 없다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM InterviewRoundMember m "
            + "WHERE m.applicationId = :applicationId "
            + "AND m.status IN :memberStatuses "
            + "AND m.roundId IN (SELECT r.id FROM InterviewRound r WHERE r.status IN :roundStatuses) "
            + "ORDER BY m.id ASC")
    List<InterviewRoundMember> findAllExcludableOfApplicationInRoundsForUpdate(
            @Param("applicationId") Long applicationId,
            @Param("memberStatuses") Collection<RoundMemberStatus> memberStatuses,
            @Param("roundStatuses") Collection<RoundStatus> roundStatuses);

    /**
     * 라운드 생성 가드(#1637) — 넘어온 지원서 중 지원자가 탈퇴한 것. JPQL 의 지원자 조인은 @SQLRestriction 이 탈퇴자를
     * 걸러 버려 탈퇴자를 찾을 수 없으므로 네이티브로 둔다.
     */
    @Query(value = "SELECT a.id FROM application a JOIN users u ON u.id = a.user_id "
            + "WHERE a.id IN (:applicationIds) AND u.deleted_at IS NOT NULL", nativeQuery = true)
    List<Long> findApplicationIdsOfWithdrawnApplicants(@Param("applicationIds") Collection<Long> applicationIds);
}

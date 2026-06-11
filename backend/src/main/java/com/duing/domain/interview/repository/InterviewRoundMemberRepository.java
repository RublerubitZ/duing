package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.RoundMemberStatus;
import jakarta.persistence.LockModeType;
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
}

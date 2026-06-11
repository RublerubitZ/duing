package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewSlot;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewSlotRepository extends JpaRepository<InterviewSlot, Long> {

    long countByRoundId(Long roundId);

    List<InterviewSlot> findByRoundIdOrderByStartTimeAsc(Long roundId);

    /**
     * 응답 시 선택 슬롯 행을 잠가 슬롯 시간변경/삭제의 참조 검사와 직렬화한다 (스펙 §16-7-1).
     * ORDER BY id 고정으로 잠금 순서를 일관시켜 교착을 방지한다. JPQL 이므로 @SQLRestriction 이
     * 적용되어 soft-deleted 슬롯은 결과에서 빠진다 — 호출자는 size 불일치로 감지한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM InterviewSlot s WHERE s.id IN :ids ORDER BY s.id ASC")
    List<InterviewSlot> findAllByIdInForUpdate(@Param("ids") Collection<Long> ids);

    /**
     * 슬롯 시간변경·삭제의 "선택 참조 0" 검증을 응답 API 의 삽입과 직렬화한다 (스펙 §16-7-1 —
     * 응답 측의 findAllByIdInForUpdate 와 같은 행을 잠가야 check-then-act 가 안전해진다).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM InterviewSlot s WHERE s.id = :id")
    Optional<InterviewSlot> findByIdForUpdate(@Param("id") Long id);
}


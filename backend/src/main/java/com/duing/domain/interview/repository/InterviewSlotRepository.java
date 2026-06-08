package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewSlot;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewSlotRepository
        extends JpaRepository<InterviewSlot, Long>, InterviewSlotRepositoryCustom {

    List<InterviewSlot> findByRecruitmentIdOrderByStartTimeAsc(Long recruitmentId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM InterviewSlot s WHERE s.id = :id")
    Optional<InterviewSlot> findByIdForUpdate(@Param("id") Long id);

    /**
     * Task 10 의 M9 수동 배정/이동에서 source/target slot 을 동시 lock 하기 위해 사용.
     * 본 메서드는 Task 4 에서 정의만 추가, 호출처는 Task 10 PR 에서 생긴다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM InterviewSlot s WHERE s.id IN :ids ORDER BY s.id ASC")
    List<InterviewSlot> findAllByIdInForUpdate(@Param("ids") List<Long> ids);
}

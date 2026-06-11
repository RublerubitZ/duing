package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewAvailability;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewAvailabilityRepository
        extends JpaRepository<InterviewAvailability, Long>, InterviewAvailabilityRepositoryCustom {

    long countByApplicationId(Long applicationId);

    long countBySlotId(Long slotId);

    List<InterviewAvailability> findByApplicationId(Long applicationId);

    List<InterviewAvailability> findByRoundIdAndApplicationId(Long roundId, Long applicationId);

    /** 응답 upsert — 라운드 한정 전체 교체의 삭제 단계 (V46 partial unique 패턴으로 재삽입 허용). */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE InterviewAvailability a SET a.deletedAt = CURRENT_TIMESTAMP "
            + "WHERE a.roundId = :roundId AND a.applicationId = :applicationId AND a.deletedAt IS NULL")
    void softDeleteByRoundIdAndApplicationId(@Param("roundId") Long roundId,
                                             @Param("applicationId") Long applicationId);
}

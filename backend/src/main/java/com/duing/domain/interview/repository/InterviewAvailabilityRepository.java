package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewAvailability;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewAvailabilityRepository extends JpaRepository<InterviewAvailability, Long> {

    long countBySlotId(Long slotId);

    long countByApplicationId(Long applicationId);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE InterviewAvailability a SET a.deletedAt = CURRENT_TIMESTAMP WHERE a.applicationId = :applicationId AND a.deletedAt IS NULL")
    void softDeleteByApplicationId(@Param("applicationId") Long applicationId);

    List<InterviewAvailability> findByApplicationId(Long applicationId);

    List<InterviewAvailability> findByRecruitmentId(Long recruitmentId);
}

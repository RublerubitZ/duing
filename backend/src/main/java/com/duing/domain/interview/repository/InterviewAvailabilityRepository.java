package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewAvailability;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewAvailabilityRepository extends JpaRepository<InterviewAvailability, Long> {

    long countBySlotId(Long slotId);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM InterviewAvailability a WHERE a.applicationId = :applicationId")
    void deleteByApplicationId(@Param("applicationId") Long applicationId);

    List<InterviewAvailability> findByApplicationId(Long applicationId);

    List<InterviewAvailability> findByRecruitmentId(Long recruitmentId);
}

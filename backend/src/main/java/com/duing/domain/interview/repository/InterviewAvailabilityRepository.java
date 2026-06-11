package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewAvailability;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewAvailabilityRepository
        extends JpaRepository<InterviewAvailability, Long>, InterviewAvailabilityRepositoryCustom {

    long countByApplicationId(Long applicationId);

    List<InterviewAvailability> findByApplicationId(Long applicationId);
}

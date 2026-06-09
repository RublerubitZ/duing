package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewScheduleRepository extends JpaRepository<InterviewSchedule, Long> {

    long countBySlotIdAndStatus(Long slotId, InterviewScheduleStatus status);

    boolean existsByApplicationId(Long applicationId);

    Optional<InterviewSchedule> findByApplicationId(Long applicationId);

    List<InterviewSchedule> findByRecruitmentId(Long recruitmentId);
}

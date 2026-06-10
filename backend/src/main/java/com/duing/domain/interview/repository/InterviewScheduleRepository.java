package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewScheduleRepository
        extends JpaRepository<InterviewSchedule, Long>, InterviewScheduleRepositoryCustom {

    long countBySlotIdAndStatus(Long slotId, InterviewScheduleStatus status);

    boolean existsByApplicationId(Long applicationId);

    boolean existsByApplicationIdAndStatus(Long applicationId, InterviewScheduleStatus status);

    Optional<InterviewSchedule> findByApplicationId(Long applicationId);

    List<InterviewSchedule> findByRecruitmentId(Long recruitmentId);

    @Query("""
            select s
              from InterviewSchedule s
              join InterviewSlot slot on slot.id = s.slotId
             where s.status = com.duing.domain.interview.entity.InterviewScheduleStatus.ASSIGNED
               and slot.startTime between :start and :end
               and slot.deletedAt is null
            """)
    List<InterviewSchedule> findAssignedBetween(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);
}

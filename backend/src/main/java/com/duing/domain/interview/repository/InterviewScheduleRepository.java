package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import java.time.LocalDateTime;
import java.util.Collection;
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

    /**
     * 응답 DTO 의 nested {@code interview} 채움용 — 지원 ID 다건을 한 번에 끌어와 N+1 을 방지한다.
     * CANCELLED 상태도 함께 반환되므로 호출자는 status 필터링을 명시해야 한다.
     */
    List<InterviewSchedule> findByApplicationIdIn(Collection<Long> applicationIds);

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

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

    Optional<InterviewSchedule> findByApplicationId(Long applicationId);

    List<InterviewSchedule> findByRoundIdAndStatus(Long roundId, InterviewScheduleStatus status);

    /**
     * 응답 DTO 의 nested {@code interview} 채움용 — 지원 ID 다건을 한 번에 끌어와 N+1 을 방지한다.
     * CANCELLED 상태도 함께 반환되므로 호출자는 status 필터링을 명시해야 한다.
     */
    List<InterviewSchedule> findByApplicationIdIn(Collection<Long> applicationIds);

    /**
     * 면접 24h 전 리마인더 윈도 대상 조회. INTERVIEW_PENDING 상태 지원자만 포함한다.
     * ACCEPTED/REJECTED 로 이미 전이된 지원자는 ASSIGNED schedule 이 남아 있어도 리마인더 대상에서 제외된다 (Codex review BE-2).
     */
    @Query("""
            select s
              from InterviewSchedule s
              join InterviewSlot slot on slot.id = s.slotId
              join Application a on a.id = s.applicationId
             where s.status = com.duing.domain.interview.entity.InterviewScheduleStatus.ASSIGNED
               and a.status = com.duing.domain.application.entity.ApplicationStatus.INTERVIEW_PENDING
               and slot.startTime between :start and :end
               and slot.deletedAt is null
            """)
    List<InterviewSchedule> findAssignedBetween(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);
}

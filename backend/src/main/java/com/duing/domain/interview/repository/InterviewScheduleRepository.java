package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewScheduleRepository
        extends JpaRepository<InterviewSchedule, Long>, InterviewScheduleRepositoryCustom {

    /**
     * 자동배정 재실행의 draft 교체 (스펙 §6.2). plain @Modifying — 이 TX 는 schedule 을 PC 에
     * 로드하지 않으므로 clear 가 불필요하고, clear 를 쓰면 직전 openAssigning() 의 round dirty
     * 변경이 유실된다 (BE#8 detached 사고의 교훈).
     */
    @Modifying
    @Query("UPDATE InterviewSchedule s SET s.deletedAt = CURRENT_TIMESTAMP "
            + "WHERE s.roundId = :roundId AND s.deletedAt IS NULL")
    void softDeleteByRoundId(@Param("roundId") Long roundId);

    Optional<InterviewSchedule> findByRoundIdAndApplicationIdAndStatus(Long roundId, Long applicationId,
                                                                        InterviewScheduleStatus status);

    List<InterviewSchedule> findByRoundIdAndStatus(Long roundId, InterviewScheduleStatus status);

    /**
     * 응답 DTO 의 nested {@code interview} 채움용 — 지원 ID 다건을 한 번에 끌어와 N+1 을 방지한다.
     * CANCELLED 상태도 함께 반환되므로 호출자는 status 필터링을 명시해야 한다.
     */
    List<InterviewSchedule> findByApplicationIdIn(Collection<Long> applicationIds);

    long countBySlotIdAndStatus(Long slotId, InterviewScheduleStatus status);

    /**
     * 면접 24h 전 리마인더 윈도 대상 조회. INTERVIEW_PENDING 상태 지원자만 포함한다.
     * ACCEPTED/REJECTED 로 이미 전이된 지원자는 ASSIGNED schedule 이 남아 있어도 리마인더 대상에서 제외된다 (Codex review BE-2).
     * 마감된 모집도 제외한다 — 마감 후에는 면접을 진행할 수 없으므로 "내일 면접" 알림이 나가면 거짓이 된다
     * (마감 임박 알림이 status='OPEN' 을 거는 것과 같은 기준).
     */
    @Query("""
            select s
              from InterviewSchedule s
              join InterviewSlot slot on slot.id = s.slotId
              join Application a on a.id = s.applicationId
             where s.status = com.duing.domain.interview.entity.InterviewScheduleStatus.ASSIGNED
               and a.status = com.duing.domain.application.entity.ApplicationStatus.INTERVIEW_PENDING
               and a.recruitment.status = com.duing.domain.recruitment.entity.RecruitmentStatus.OPEN
               and slot.startTime between :start and :end
               and slot.deletedAt is null
            """)
    List<InterviewSchedule> findAssignedBetween(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);
}

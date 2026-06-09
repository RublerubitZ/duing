package com.duing.domain.interview.repository;

import com.duing.domain.application.service.dto.query.ApplicantDetailQuery.AvailabilityItem;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.QInterviewSchedule;
import com.duing.domain.interview.entity.QInterviewSlot;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class InterviewScheduleRepositoryImpl implements InterviewScheduleRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Optional<AvailabilityItem> findAssignedSlotByApplicationId(Long applicationId) {
        QInterviewSchedule schedule = QInterviewSchedule.interviewSchedule;
        QInterviewSlot slot = QInterviewSlot.interviewSlot;

        AvailabilityItem result = queryFactory
                .select(Projections.constructor(AvailabilityItem.class,
                        slot.id,
                        slot.startTime,
                        slot.endTime))
                .from(schedule)
                .join(slot).on(slot.id.eq(schedule.slotId))
                .where(schedule.applicationId.eq(applicationId)
                        .and(schedule.status.eq(InterviewScheduleStatus.ASSIGNED)))
                .fetchOne();
        return Optional.ofNullable(result);
    }
}

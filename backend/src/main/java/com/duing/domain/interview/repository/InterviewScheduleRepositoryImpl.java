package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.QInterviewSchedule;
import com.duing.domain.interview.entity.QInterviewSlot;
import com.duing.domain.interview.service.dto.query.InterviewSlotTimeWindow;
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
    public Optional<InterviewSlotTimeWindow> findAssignedSlotByApplicationId(Long applicationId) {
        QInterviewSchedule schedule = QInterviewSchedule.interviewSchedule;
        QInterviewSlot slot = QInterviewSlot.interviewSlot;

        InterviewSlotTimeWindow result = queryFactory
                .select(Projections.constructor(InterviewSlotTimeWindow.class,
                        slot.id,
                        slot.startTime,
                        slot.endTime))
                .from(schedule)
                .join(slot).on(slot.id.eq(schedule.slotId).and(slot.deletedAt.isNull()))
                .where(schedule.applicationId.eq(applicationId)
                        .and(schedule.status.eq(InterviewScheduleStatus.ASSIGNED)))
                .fetchOne();
        return Optional.ofNullable(result);
    }
}

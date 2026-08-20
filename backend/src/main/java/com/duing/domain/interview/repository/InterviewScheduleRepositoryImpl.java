package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.QInterviewRound;
import com.duing.domain.interview.entity.QInterviewSchedule;
import com.duing.domain.interview.entity.QInterviewSlot;
import com.duing.domain.interview.service.dto.query.AssignedInterviewSlot;
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
    public Optional<AssignedInterviewSlot> findAssignedSlotByApplicationId(Long applicationId) {
        QInterviewSchedule schedule = QInterviewSchedule.interviewSchedule;
        QInterviewSlot slot = QInterviewSlot.interviewSlot;
        QInterviewRound round = QInterviewRound.interviewRound;

        AssignedInterviewSlot result = queryFactory
                .select(Projections.constructor(AssignedInterviewSlot.class,
                        slot.id,
                        slot.startTime,
                        slot.endTime,
                        round.location))
                .from(schedule)
                .join(slot).on(slot.id.eq(schedule.slotId).and(slot.deletedAt.isNull()))
                .leftJoin(round).on(round.id.eq(schedule.roundId).and(round.deletedAt.isNull()))
                .where(schedule.applicationId.eq(applicationId)
                        .and(schedule.status.eq(InterviewScheduleStatus.ASSIGNED)))
                .fetchOne();
        return Optional.ofNullable(result);
    }
}

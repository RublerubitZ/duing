package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.QInterviewAvailability;
import com.duing.domain.interview.entity.QInterviewSchedule;
import com.duing.domain.interview.entity.QInterviewSlot;
import com.duing.domain.interview.service.dto.query.SlotListView;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class InterviewSlotRepositoryImpl implements InterviewSlotRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<SlotListView> findSlotListViewByRecruitmentId(Long recruitmentId) {
        QInterviewSlot slot = QInterviewSlot.interviewSlot;
        QInterviewAvailability availability = QInterviewAvailability.interviewAvailability;
        QInterviewSchedule schedule = QInterviewSchedule.interviewSchedule;

        return queryFactory
                .select(Projections.constructor(SlotListView.class,
                        slot.id,
                        slot.startTime,
                        slot.endTime,
                        slot.capacity,
                        JPAExpressions.select(availability.count())
                                .from(availability)
                                .where(availability.slotId.eq(slot.id)),
                        JPAExpressions.select(schedule.count())
                                .from(schedule)
                                .where(schedule.slotId.eq(slot.id)
                                        .and(schedule.status.eq(InterviewScheduleStatus.ASSIGNED)))))
                .from(slot)
                .where(slot.recruitmentId.eq(recruitmentId))
                .orderBy(slot.startTime.asc())
                .fetch();
    }
}

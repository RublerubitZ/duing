package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.QInterviewAvailability;
import com.duing.domain.interview.entity.QInterviewSlot;
import com.duing.domain.interview.service.dto.query.InterviewSlotTimeWindow;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class InterviewAvailabilityRepositoryImpl implements InterviewAvailabilityRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<InterviewSlotTimeWindow> findAvailabilityItemsByApplicationId(Long applicationId) {
        QInterviewAvailability availability = QInterviewAvailability.interviewAvailability;
        QInterviewSlot slot = QInterviewSlot.interviewSlot;

        return queryFactory
                .select(Projections.constructor(InterviewSlotTimeWindow.class,
                        slot.id,
                        slot.startTime,
                        slot.endTime))
                .from(availability)
                .join(slot).on(slot.id.eq(availability.slotId).and(slot.deletedAt.isNull()))
                .where(availability.applicationId.eq(applicationId))
                .orderBy(slot.startTime.asc())
                .fetch();
    }
}

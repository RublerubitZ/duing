package com.duing.domain.interview.repository;

import static com.duing.domain.interview.entity.QInterviewAvailability.interviewAvailability;

import com.duing.domain.interview.entity.QInterviewSlot;
import com.duing.domain.interview.service.dto.query.InterviewSlotTimeWindow;
import com.duing.domain.interview.service.dto.query.MemberSelectionCount;
import com.duing.domain.interview.service.dto.query.SlotSelectionCount;
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
        QInterviewSlot slot = QInterviewSlot.interviewSlot;

        return queryFactory
                .select(Projections.constructor(InterviewSlotTimeWindow.class,
                        slot.id,
                        slot.startTime,
                        slot.endTime))
                .from(interviewAvailability)
                .join(slot).on(slot.id.eq(interviewAvailability.slotId).and(slot.deletedAt.isNull()))
                .where(interviewAvailability.applicationId.eq(applicationId))
                .orderBy(slot.startTime.asc())
                .fetch();
    }

    @Override
    public List<SlotSelectionCount> countByRoundIdGroupedBySlot(Long roundId) {
        return queryFactory
                .select(Projections.constructor(SlotSelectionCount.class,
                        interviewAvailability.slotId,
                        interviewAvailability.count()))
                .from(interviewAvailability)
                .where(interviewAvailability.roundId.eq(roundId))
                .groupBy(interviewAvailability.slotId)
                .fetch();
    }

    @Override
    public List<MemberSelectionCount> countByRoundIdGroupedByApplication(Long roundId) {
        return queryFactory
                .select(Projections.constructor(MemberSelectionCount.class,
                        interviewAvailability.applicationId,
                        interviewAvailability.count()))
                .from(interviewAvailability)
                .where(interviewAvailability.roundId.eq(roundId))
                .groupBy(interviewAvailability.applicationId)
                .fetch();
    }
}

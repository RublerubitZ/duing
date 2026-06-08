package com.duing.common.fixture;

import com.duing.domain.interview.entity.InterviewSlot;
import java.time.LocalDateTime;

public final class InterviewSlotFixture {

    private InterviewSlotFixture() {}

    public static InterviewSlot create(Long recruitmentId, LocalDateTime startTime, int capacity) {
        LocalDateTime endTime = startTime.plusHours(1);
        return InterviewSlot.create(recruitmentId, startTime, endTime, capacity);
    }
}

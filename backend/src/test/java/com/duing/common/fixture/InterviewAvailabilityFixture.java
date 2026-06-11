package com.duing.common.fixture;

import com.duing.domain.interview.entity.InterviewAvailability;

public final class InterviewAvailabilityFixture {

    private InterviewAvailabilityFixture() {}

    public static InterviewAvailability link(Long applicationId, Long slotId, Long roundId) {
        return InterviewAvailability.create(applicationId, slotId, roundId);
    }
}

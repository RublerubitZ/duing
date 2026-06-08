package com.duing.common.fixture;

import com.duing.domain.interview.entity.InterviewSchedule;
import java.time.LocalDateTime;

public final class InterviewScheduleFixture {

    private InterviewScheduleFixture() {}

    public static InterviewSchedule assigned(Long applicationId, Long slotId, Long recruitmentId) {
        return InterviewSchedule.create(applicationId, slotId, recruitmentId, LocalDateTime.now());
    }
}

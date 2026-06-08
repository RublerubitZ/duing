package com.duing.common.fixture;

import com.duing.domain.interview.entity.InterviewConfig;
import java.time.LocalDateTime;

public final class InterviewConfigFixture {

    private InterviewConfigFixture() {}

    public static InterviewConfig create(Long recruitmentId, LocalDateTime deadline) {
        return InterviewConfig.create(recruitmentId, deadline);
    }

    public static InterviewConfig createOpen(Long recruitmentId) {
        LocalDateTime futureDeadline = LocalDateTime.now().plusDays(7);
        return InterviewConfig.create(recruitmentId, futureDeadline);
    }

    public static InterviewConfig createClosed(Long recruitmentId) {
        LocalDateTime pastDeadline = LocalDateTime.now().minusDays(1);
        return InterviewConfig.create(recruitmentId, pastDeadline);
    }
}

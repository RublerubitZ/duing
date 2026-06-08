package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.InterviewScheduleStatus;
import java.time.LocalDateTime;

public record MyInterviewScheduleResponse(
        boolean assigned,
        InterviewScheduleDetail schedule
) {

    public record InterviewScheduleDetail(
            Long scheduleId,
            Long slotId,
            LocalDateTime startTime,
            LocalDateTime endTime,
            InterviewScheduleStatus status,
            LocalDateTime assignedAt
    ) {}
}

package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.InterviewScheduleStatus;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 운영진 대시보드용 슬롯별 그룹핑 일정 조회 뷰.
 */
public record ScheduleListView(
        Long slotId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        int capacity,
        List<AssignedItem> assigned
) {
    public record AssignedItem(
            Long scheduleId,
            Long applicationId,
            InterviewScheduleStatus status,
            LocalDateTime assignedAt
    ) {}
}

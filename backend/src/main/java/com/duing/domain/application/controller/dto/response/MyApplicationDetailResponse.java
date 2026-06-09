package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.MyApplicationDetailQuery;
import java.time.LocalDateTime;
import java.util.List;

public record MyApplicationDetailResponse(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        List<String> questions,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime interviewAt,
        String interviewLocation,
        LocalDateTime submittedAt,
        int interviewAvailabilityCount,
        boolean interviewScheduleAssigned,
        LocalDateTime availabilityDeadline
) {
    public static MyApplicationDetailResponse from(MyApplicationDetailQuery detailQuery) {
        return new MyApplicationDetailResponse(
                detailQuery.id(),
                detailQuery.recruitmentId(),
                detailQuery.recruitmentTitle(),
                detailQuery.clubId(),
                detailQuery.clubName(),
                detailQuery.questions(),
                detailQuery.answers(),
                detailQuery.status(),
                detailQuery.interviewAt(),
                detailQuery.interviewLocation(),
                detailQuery.submittedAt(),
                detailQuery.interviewAvailabilityCount(),
                detailQuery.interviewScheduleAssigned(),
                detailQuery.availabilityDeadline()
        );
    }
}

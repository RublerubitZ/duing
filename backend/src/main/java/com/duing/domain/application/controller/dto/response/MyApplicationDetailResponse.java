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
        AssignedInterview interview,
        LocalDateTime submittedAt,
        int interviewAvailabilityCount,
        LocalDateTime availabilityDeadline
) {

    /**
     * 지원자에게 현재 배정된 면접 일정과 장소.
     * ASSIGNED schedule + InterviewConfig.location 이 모두 존재할 때만 채워지고, 그 외엔 응답에서 {@code null}.
     */
    public record AssignedInterview(
            LocalDateTime startAt,
            LocalDateTime endAt,
            String location
    ) {}

    public static MyApplicationDetailResponse from(MyApplicationDetailQuery detailQuery) {
        AssignedInterview interview = detailQuery.interview() == null ? null
                : new AssignedInterview(
                        detailQuery.interview().startAt(),
                        detailQuery.interview().endAt(),
                        detailQuery.interview().location());
        return new MyApplicationDetailResponse(
                detailQuery.id(),
                detailQuery.recruitmentId(),
                detailQuery.recruitmentTitle(),
                detailQuery.clubId(),
                detailQuery.clubName(),
                detailQuery.questions(),
                detailQuery.answers(),
                detailQuery.status(),
                interview,
                detailQuery.submittedAt(),
                detailQuery.interviewAvailabilityCount(),
                detailQuery.availabilityDeadline()
        );
    }
}

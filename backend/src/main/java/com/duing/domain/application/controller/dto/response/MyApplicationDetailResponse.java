package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.MyApplicationDetailQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
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
        Instant submittedAt,
        int interviewAvailabilityCount,
        LocalDateTime availabilityDeadline,
        boolean useInterview
) {

    /**
     * 지원자에게 현재 배정된 면접 일정과 장소.
     * ASSIGNED schedule 이 있으면 채워지고, 미배정/CANCELLED 만 있으면 응답에서 {@code null}.
     * <p>
     * {@code location} 은 nullable — {@link com.duing.domain.interview.entity.InterviewRound} 의 location
     * 이 비어 있는 라운드는 interview 객체는 노출하되 location 만 {@code null} 로 채운다 (Codex review BE-3).
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
                TimeMapper.systemWallClockToInstant(detailQuery.submittedAt()),
                detailQuery.interviewAvailabilityCount(),
                detailQuery.availabilityDeadline(),
                detailQuery.useInterview()
        );
    }
}

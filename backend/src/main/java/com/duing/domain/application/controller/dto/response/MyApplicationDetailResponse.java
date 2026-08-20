package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.MyApplicationDetailQuery;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

public record MyApplicationDetailResponse(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        /** 모집 마감 여부 — 지원자 화면이 면접 안내·철회 UI 를 접을지 판단하는 근거다. */
        RecruitmentStatus recruitmentStatus,
        Long clubId,
        String clubName,
        List<String> questions,
        List<String> answers,
        ApplicationStatus status,
        AssignedInterviewResponse interview,
        Instant submittedAt,
        int interviewAvailabilityCount,
        LocalDateTime availabilityDeadline,
        boolean useInterview
) {

    public static MyApplicationDetailResponse from(MyApplicationDetailQuery detailQuery) {
        AssignedInterviewResponse interview = AssignedInterviewResponse.from(detailQuery.interview());
        return new MyApplicationDetailResponse(
                detailQuery.id(),
                detailQuery.recruitmentId(),
                detailQuery.recruitmentTitle(),
                detailQuery.recruitmentStatus(),
                detailQuery.clubId(),
                detailQuery.clubName(),
                detailQuery.questions(),
                detailQuery.answers(),
                detailQuery.status().asApplicantVisible(),
                interview,
                TimeMapper.systemWallClockToInstant(detailQuery.submittedAt()),
                detailQuery.interviewAvailabilityCount(),
                detailQuery.availabilityDeadline(),
                detailQuery.useInterview()
        );
    }
}

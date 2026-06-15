package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.service.dto.query.RoundCandidateQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;

public record RoundCandidateResponse(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        College college,
        String major,
        Grade grade,
        ApplicationStatus status,
        LocalDateTime submittedAt
) {
    public static RoundCandidateResponse from(RoundCandidateQuery candidateQuery) {
        return new RoundCandidateResponse(
                candidateQuery.applicationId(),
                candidateQuery.userId(),
                candidateQuery.userName(),
                candidateQuery.studentId(),
                candidateQuery.college(),
                candidateQuery.major(),
                candidateQuery.grade(),
                candidateQuery.status(),
                candidateQuery.submittedAt());
    }
}

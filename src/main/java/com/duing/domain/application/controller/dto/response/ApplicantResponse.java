package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicantResponse(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        String email,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime submittedAt
) {
    public static ApplicantResponse from(ApplicantQuery applicantQuery) {
        return new ApplicantResponse(
                applicantQuery.applicationId(),
                applicantQuery.userId(),
                applicantQuery.userName(),
                applicantQuery.studentId(),
                applicantQuery.email(),
                applicantQuery.answers(),
                applicantQuery.status(),
                applicantQuery.submittedAt()
        );
    }
}
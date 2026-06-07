package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicantResponse(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        String email,
        College college,
        String major,
        Grade grade,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime submittedAt,
        LocalDateTime interviewAt
) {
    public static ApplicantResponse from(ApplicantQuery applicantQuery) {
        return new ApplicantResponse(
                applicantQuery.applicationId(),
                applicantQuery.userId(),
                applicantQuery.userName(),
                applicantQuery.studentId(),
                applicantQuery.email(),
                applicantQuery.college(),
                applicantQuery.major(),
                applicantQuery.grade(),
                applicantQuery.answers(),
                applicantQuery.status(),
                applicantQuery.submittedAt(),
                applicantQuery.interviewAt()
        );
    }
}

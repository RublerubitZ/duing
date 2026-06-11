package com.duing.domain.interview.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;

public record RoundCandidateQuery(
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
    public static RoundCandidateQuery from(Application application) {
        return new RoundCandidateQuery(
                application.getId(),
                application.getUser().getId(),
                application.getUser().getName(),
                application.getUser().getStudentId(),
                application.getUser().getCollege(),
                application.getUser().getMajor(),
                application.getUser().getGrade(),
                application.getStatus(),
                application.getCreatedAt());
    }
}

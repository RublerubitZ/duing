package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicantQuery(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        String email,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime submittedAt
) {
    public static ApplicantQuery from(Application application) {
        return new ApplicantQuery(
                application.getId(),
                application.getUser().getId(),
                application.getUser().getName(),
                application.getUser().getStudentId(),
                application.getUser().getEmail(),
                application.getAnswers(),
                application.getStatus(),
                application.getCreatedAt()
        );
    }
}

package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicantQuery(
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
        LocalDateTime interviewAt,
        Integer myScore
) {
    /**
     * 기존 호출자 backward-compatibility 유지 — myScore 를 null 로 위임한다.
     */
    public static ApplicantQuery from(Application application) {
        return fromAll(application, null);
    }

    public static ApplicantQuery fromAll(Application application, Integer myScore) {
        return new ApplicantQuery(
                application.getId(),
                application.getUser().getId(),
                application.getUser().getName(),
                application.getUser().getStudentId(),
                application.getUser().getEmail(),
                application.getUser().getCollege(),
                application.getUser().getMajor(),
                application.getUser().getGrade(),
                application.getAnswers(),
                application.getStatus(),
                application.getCreatedAt(),
                application.getInterviewAt(),
                myScore
        );
    }
}

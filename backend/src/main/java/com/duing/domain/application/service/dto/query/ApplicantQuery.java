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
        LocalDateTime interviewStartAt,
        Integer myScore
) {
    /**
     * interviewStartAt 은 ASSIGNED InterviewSchedule 이 가리키는 슬롯의 startTime 으로
     * QueryDSL repository 에서 직접 채워 넘긴다. ASSIGNED schedule 이 없으면 null.
     * 더 이상 {@code Application.getInterviewAt()} 스칼라 필드를 읽지 않는다.
     */
    public static ApplicantQuery of(Application application,
                                    LocalDateTime interviewStartAt,
                                    Integer myScore) {
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
                interviewStartAt,
                myScore
        );
    }
}

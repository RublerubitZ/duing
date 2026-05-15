package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import java.time.LocalDateTime;
import java.util.List;

public record MyApplicationDetailQuery(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        List<String> questions,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime interviewAt,
        String interviewLocation,
        LocalDateTime submittedAt
) {
    public static MyApplicationDetailQuery from(Application application) {
        var recruitment = application.getRecruitment();
        var club = recruitment.getClub();
        RecruitmentForm form = recruitment.getForm();
        return new MyApplicationDetailQuery(
                application.getId(),
                recruitment.getId(),
                recruitment.getTitle(),
                club.getId(),
                club.getName(),
                form == null ? List.of() : form.getQuestions(),
                application.getAnswers(),
                application.getStatus(),
                application.getInterviewAt(),
                application.getInterviewLocation(),
                application.getCreatedAt()
        );
    }
}

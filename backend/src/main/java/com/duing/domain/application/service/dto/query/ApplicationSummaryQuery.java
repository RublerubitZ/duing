package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.club.entity.ClubCategory;
import java.time.LocalDateTime;

public record ApplicationSummaryQuery(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        ClubCategory category,
        String logoUrl,
        ApplicationStatus status,
        LocalDateTime interviewAt,
        String interviewLocation,
        LocalDateTime submittedAt
) {
    public static ApplicationSummaryQuery from(Application application) {
        return new ApplicationSummaryQuery(
                application.getId(),
                application.getRecruitment().getId(),
                application.getRecruitment().getTitle(),
                application.getRecruitment().getClub().getId(),
                application.getRecruitment().getClub().getName(),
                application.getRecruitment().getClub().getCategory(),
                application.getRecruitment().getClub().getLogoUrl(),
                application.getStatus(),
                application.getInterviewAt(),
                application.getInterviewLocation(),
                application.getCreatedAt()
        );
    }
}

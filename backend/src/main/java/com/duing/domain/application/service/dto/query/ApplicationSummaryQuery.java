package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import java.time.LocalDateTime;

public record ApplicationSummaryQuery(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        ApplicationStatus status,
        LocalDateTime submittedAt
) {
    public static ApplicationSummaryQuery from(Application application) {
        return new ApplicationSummaryQuery(
                application.getId(),
                application.getRecruitment().getId(),
                application.getRecruitment().getTitle(),
                application.getRecruitment().getClub().getId(),
                application.getRecruitment().getClub().getName(),
                application.getStatus(),
                application.getCreatedAt()
        );
    }
}

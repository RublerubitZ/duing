package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record RecruitmentSummaryQuery(
        Long id,
        Long clubId,
        String clubName,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        RecruitmentDisplayStatus displayStatus,
        boolean effectivelyOpen,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole,
        LocalDateTime closedAt
) {
    public static RecruitmentSummaryQuery from(Recruitment recruitment, LocalDate today) {
        return new RecruitmentSummaryQuery(
                recruitment.getId(),
                recruitment.getClub().getId(),
                recruitment.getClub().getName(),
                recruitment.getTitle(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                recruitment.getCapacity(),
                recruitment.getStatus(),
                RecruitmentDisplayStatus.resolve(
                        recruitment.getStatus(),
                        recruitment.getStartDate(),
                        recruitment.getEndDate(),
                        today),
                recruitment.isEffectivelyOpen(today),
                recruitment.getApplicationMode(),
                recruitment.getExternalFormUrl(),
                recruitment.isUseInterview(),
                recruitment.getTargetRole(),
                recruitment.getClosedAt()
        );
    }
}

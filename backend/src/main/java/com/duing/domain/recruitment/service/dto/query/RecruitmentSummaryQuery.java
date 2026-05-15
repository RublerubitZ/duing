package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;

public record RecruitmentSummaryQuery(
        Long id,
        Long clubId,
        String clubName,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        boolean effectivelyOpen,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole
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
                recruitment.isEffectivelyOpen(today),
                recruitment.getApplicationMode(),
                recruitment.getExternalFormUrl(),
                recruitment.isUseInterview(),
                recruitment.getTargetRole()
        );
    }
}

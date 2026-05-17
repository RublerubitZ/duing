package com.duing.domain.notification.event;

import java.time.LocalDate;

public record RecruitmentOpenedEvent(
        Long recruitmentId,
        Long clubId,
        String clubName,
        String recruitmentTitle,
        LocalDate endDate
) {}

package com.duing.domain.recruitment.stats.service.dto.query;

import java.time.LocalDate;

public record StatsDailyPointQuery(
        LocalDate date,
        long submittedCount
) {
}
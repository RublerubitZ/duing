package com.duing.domain.recruitment.stats.controller.dto.response;

import com.duing.domain.recruitment.stats.service.dto.query.StatsDailyPointQuery;
import java.time.LocalDate;

public record StatsDailyPointResponse(
        LocalDate date,
        long submittedCount
) {

    public static StatsDailyPointResponse from(StatsDailyPointQuery statsDailyPointQuery) {
        return new StatsDailyPointResponse(
                statsDailyPointQuery.date(),
                statsDailyPointQuery.submittedCount()
        );
    }
}
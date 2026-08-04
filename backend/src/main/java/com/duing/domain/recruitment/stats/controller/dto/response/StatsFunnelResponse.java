package com.duing.domain.recruitment.stats.controller.dto.response;

import com.duing.domain.recruitment.stats.service.dto.query.StatsFunnelQuery;

public record StatsFunnelResponse(
        long submitted,
        Long interviewEntered,
        long accepted
) {

    public static StatsFunnelResponse from(StatsFunnelQuery statsFunnelQuery) {
        return new StatsFunnelResponse(
                statsFunnelQuery.submitted(),
                statsFunnelQuery.interviewEntered(),
                statsFunnelQuery.accepted()
        );
    }
}

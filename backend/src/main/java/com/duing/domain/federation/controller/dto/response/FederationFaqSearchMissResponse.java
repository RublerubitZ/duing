package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationFaqSearchMiss;
import java.time.LocalDateTime;

public record FederationFaqSearchMissResponse(
        String keyword,
        long missCount,
        LocalDateTime lastSearchedAt
) {
    public static FederationFaqSearchMissResponse from(FederationFaqSearchMiss searchMiss) {
        return new FederationFaqSearchMissResponse(
                searchMiss.getKeyword(), searchMiss.getMissCount(), searchMiss.getLastSearchedAt());
    }
}

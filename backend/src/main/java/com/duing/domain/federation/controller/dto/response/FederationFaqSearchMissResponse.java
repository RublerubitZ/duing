package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationFaqSearchMiss;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record FederationFaqSearchMissResponse(
        String keyword,
        long missCount,
        Instant lastSearchedAt
) {
    public static FederationFaqSearchMissResponse from(FederationFaqSearchMiss searchMiss) {
        // last_searched_at 은 DB NOW()(timestamptz) 기록 — JDBC 왕복 시 JVM 기본 존 wall-clock 으로 읽히므로 system 변환.
        return new FederationFaqSearchMissResponse(
                searchMiss.getKeyword(), searchMiss.getMissCount(),
                TimeMapper.systemWallClockToInstant(searchMiss.getLastSearchedAt()));
    }
}

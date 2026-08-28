package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.service.dto.query.ClubStatsQuery;
import java.util.Map;

public record ClubStatsResponse(
        long totalCount,
        long recruitingCount,
        /** 카테고리별 공개 동아리 수. 동아리가 없는 카테고리도 0 으로 포함된다. */
        Map<ClubCategory, Long> categoryCounts
) {
    public static ClubStatsResponse from(ClubStatsQuery statsQuery) {
        return new ClubStatsResponse(
                statsQuery.totalCount(),
                statsQuery.recruitingCount(),
                statsQuery.categoryCounts());
    }
}

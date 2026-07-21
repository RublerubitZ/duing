package com.duing.domain.facility.controller.dto.response;

import com.duing.domain.facility.controller.dto.response.FacilityUsageResponse.FacilityUsage;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.service.dto.query.FacilityUsageResult;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/** §7.3 단일 시설 상세 응답 — usage 의 시설 1건 슬라이스 + lastUpdatedAt/stale/source. */
public record FacilityDetailResponse(String yearMonth, Instant lastUpdatedAt, boolean stale,
                                     DataSource source, FacilityUsage facility) {

    public static FacilityDetailResponse from(FacilityUsageResult result) {
        FacilityUsage facility = result.facilities().isEmpty()
                ? null
                : FacilityUsageResponse.toFacility(result.facilities().get(0));
        return new FacilityDetailResponse(
                result.yearMonth().toString(),
                TimeMapper.seoulWallClockToInstant(result.crawledAt()),
                result.stale(),
                result.source(),
                facility);
    }
}

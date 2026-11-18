package com.duing.domain.adminconsole.service;

import com.duing.domain.facilitybooking.service.FacilityWeeklyOccupancyQueryService;
import com.duing.domain.facilitybooking.service.dto.query.FacilityWeeklyOccupancyQuery;
import java.time.Clock;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주간 브리핑 시설 히트맵 — 주 범위 검증(서버 seoulClock)만 콘솔이 하고 칸 집계는 시설 예약 도메인에 맡긴다
 * (크롤 행 분류·슬롯 조립이 그 도메인 소관). 콘솔 컨트롤러는 Clock 을 받지 않아 검증을 여기 둔다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminWeeklyFacilityHeatmapQueryService {

    private final FacilityWeeklyOccupancyQueryService facilityWeeklyOccupancyQueryService;
    private final Clock clock;

    public FacilityWeeklyOccupancyQuery getHeatmap(LocalDate weekStart) {
        return facilityWeeklyOccupancyQueryService.getWeeklyOccupancy(WeekBounds.startedWeek(weekStart, clock).firstDay());
    }
}

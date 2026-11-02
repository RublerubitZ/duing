package com.duing.domain.facilitybooking.service.dto.query;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 주간 시설 점유 — 보관하지 않은 시설(sort_order·id 순)마다 월~일 하루의 점유 칸 수(09~22시 1시간 칸, 0~13).
 * currentMonthCrawledAt 은 이번 달 학교 일정 수집 시각(KST 벽시계, seoul regime). 기록이 없으면 null.
 */
public record FacilityWeeklyOccupancyQuery(List<FacilityRow> facilities, LocalDateTime currentMonthCrawledAt) {

    public record FacilityRow(Long facilityId, String roomName, Integer sortOrder, List<Integer> occupiedSlotCounts) {
    }
}

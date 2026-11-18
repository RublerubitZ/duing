package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.facilitybooking.service.dto.query.FacilityWeeklyOccupancyQuery;
import com.duing.domain.facilitybooking.service.dto.query.FacilityWeeklyOccupancyQuery.FacilityRow;
import com.duing.global.time.TimeMapper;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

@Schema(description = "주간 브리핑 시설 히트맵 — 시설별 하루 예약 시간 칸 수(09~22시 1시간 칸, 0~13). 예약 캘린더의 차단 칸과 같은 판정")
public record AdminWeeklyFacilityHeatmapResponse(
        @Schema(description = "보관하지 않은 시설(sort_order·id 순)")
        List<FacilityHeatmapRowResponse> facilities,

        @Schema(description = "이번 달 학교 일정 수집 시각. 수집 기록이 없으면 null", nullable = true)
        Instant currentMonthCrawledAt
) {

    public static AdminWeeklyFacilityHeatmapResponse from(FacilityWeeklyOccupancyQuery query) {
        return new AdminWeeklyFacilityHeatmapResponse(
                query.facilities().stream().map(FacilityHeatmapRowResponse::from).toList(),
                // crawled_at 은 now(seoulClock) 으로 기록한 KST 벽시계(seoul regime).
                TimeMapper.seoulWallClockToInstant(query.currentMonthCrawledAt()));
    }

    @Schema(description = "시설 한 줄")
    public record FacilityHeatmapRowResponse(
            @Schema(example = "3") Long facilityId,
            @Schema(example = "학생회관 강당") String roomName,
            @Schema(example = "1") Integer sortOrder,
            @Schema(description = "월~일 7칸 — 그날 예약이 걸친 1시간 칸 수(0~13)") List<Integer> occupiedSlotCounts
    ) {
        static FacilityHeatmapRowResponse from(FacilityRow row) {
            return new FacilityHeatmapRowResponse(row.facilityId(), row.roomName(), row.sortOrder(), row.occupiedSlotCounts());
        }
    }
}

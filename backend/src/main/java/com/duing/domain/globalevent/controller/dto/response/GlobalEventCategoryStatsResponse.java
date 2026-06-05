package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEventCategory;
import java.util.EnumMap;
import java.util.Map;

public record GlobalEventCategoryStatsResponse(
        Map<GlobalEventCategory, Long> distribution
) {
    public static GlobalEventCategoryStatsResponse from(Map<GlobalEventCategory, Long> stats) {
        Map<GlobalEventCategory, Long> normalized = new EnumMap<>(GlobalEventCategory.class);
        for (GlobalEventCategory categoryValue : GlobalEventCategory.values()) {
            normalized.put(categoryValue, stats.getOrDefault(categoryValue, 0L));
        }
        return new GlobalEventCategoryStatsResponse(normalized);
    }
}

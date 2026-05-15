package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;
import java.util.List;

public record ClubSearchCondition(
        ClubCategory category,
        String division,
        String keyword,
        List<String> tags,
        Boolean recruiting
) {
    public boolean hasTags() {
        return tags != null && !tags.isEmpty();
    }

    public boolean recruitingOnly() {
        return Boolean.TRUE.equals(recruiting);
    }
}

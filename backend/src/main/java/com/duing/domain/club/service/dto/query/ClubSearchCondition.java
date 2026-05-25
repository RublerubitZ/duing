package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.user.entity.College;
import java.util.List;

public record ClubSearchCondition(
        ClubCategory category,
        String division,
        String keyword,
        List<String> tags,
        Boolean recruiting,
        Boolean centralClub,
        College college,
        ClubSortOption sortOption
) {
    public boolean hasTags() {
        return tags != null && !tags.isEmpty();
    }

    public boolean recruitingOnly() {
        return Boolean.TRUE.equals(recruiting);
    }

    /** 미지정이면 RECENT 로 폴백. */
    public ClubSortOption sortOptionOrDefault() {
        return sortOption == null ? ClubSortOption.RECENT : sortOption;
    }
}

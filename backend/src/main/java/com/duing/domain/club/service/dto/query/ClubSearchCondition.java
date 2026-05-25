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
        RecruitmentStatusFilter recruitmentStatus,
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

    /**
     * recruitmentStatus 미지정 + 구 recruiting=true 만 들어왔을 때 AVAILABLE 로 보정한다.
     * recruitmentStatus 가 지정되어 있으면 recruiting 은 무시한다.
     */
    public RecruitmentStatusFilter effectiveRecruitmentStatus() {
        if (recruitmentStatus != null) {
            return recruitmentStatus;
        }
        if (Boolean.TRUE.equals(recruiting)) {
            return RecruitmentStatusFilter.AVAILABLE;
        }
        return null;
    }
}
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
     *
     * <p>recruiting=false 는 의도적으로 매핑하지 않는다 (no-op = 전체).
     * 구 UI 에서 "모집 마감" 필터가 recruiting=false 를 전송했지만, 신규 클라이언트는
     * 명시적으로 {@code recruitmentStatus=CLOSED} 를 사용해야 한다.
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
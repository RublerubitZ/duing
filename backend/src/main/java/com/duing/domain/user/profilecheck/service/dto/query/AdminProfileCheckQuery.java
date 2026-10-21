package com.duing.domain.user.profilecheck.service.dto.query;

import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.profilecheck.repository.ProfileCheckCounts;

/**
 * 운영진 화면 상태. {@code enabled} 는 실효 노출 여부(켜져 있고 기록 학기 = 오늘 학기), {@code semester} 는 통계
 * 기준 학기(켤 때 기록된 학기, 없으면 오늘), {@code currentSemester} 는 오늘 학기다.
 */
public record AdminProfileCheckQuery(
        boolean enabled,
        Semester semester,
        Semester currentSemester,
        String title,
        String message,
        ProfileCheckCounts counts
) {
}

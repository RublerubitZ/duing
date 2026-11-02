package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import java.time.LocalDate;

/**
 * 모집 기간이 이번 주에 끝나는 진행 중(raw OPEN) 모집 한 줄 — 결과 안 정한 지원(ApplicationStatus.activeSet)을 함께 센다.
 * 외부 폼 모집은 두잉 지원이 없어 0 이고, 화면에 비울지는 응답 매핑이 정한다(AdminRecruitmentRow 와 같은 분리).
 */
public record ClosingRecruitmentRow(
        Long recruitmentId,
        String title,
        Long clubId,
        String clubName,
        LocalDate endDate,
        ApplicationMode applicationMode,
        long undecidedApplicationCount
) {
}

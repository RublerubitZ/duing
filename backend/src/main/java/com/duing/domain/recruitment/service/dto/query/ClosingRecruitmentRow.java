package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
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
        RecruitmentStatus status,
        LocalDate startDate,
        LocalDate endDate,
        ApplicationMode applicationMode,
        long undecidedApplicationCount
) {
    /**
     * 표시 상태는 "오늘"에서 파생한다 — 화면이 기기 시계로 종료일을 직접 비교하면 시계가 어긋난 순간
     * 브리핑과 모집 상세가 같은 모집을 다르게 부른다(#896). today 는 이번 주를 정한 같은 seoulClock 의 날짜다.
     */
    public RecruitmentDisplayStatus displayStatus(LocalDate today) {
        return RecruitmentDisplayStatus.resolve(status, startDate, endDate, today);
    }
}

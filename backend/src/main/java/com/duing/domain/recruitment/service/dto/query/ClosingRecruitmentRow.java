package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import java.time.LocalDate;

/**
 * 모집 기간이 이번 주에 끝나는 진행 중(raw OPEN) 모집 한 줄. 결과 안 정한 지원 수는 싣지 않는다 — 서비스가 자동 마감 전망과
 * 같은 집계 쿼리(탈퇴한 지원자 제외)로 따로 세고, 외부 폼 모집에서 비울지는 응답 매핑이 정한다.
 */
public record ClosingRecruitmentRow(
        Long recruitmentId,
        String title,
        Long clubId,
        String clubName,
        RecruitmentStatus status,
        LocalDate startDate,
        LocalDate endDate,
        ApplicationMode applicationMode
) {
    /**
     * 표시 상태는 "오늘"에서 파생한다 — 화면이 기기 시계로 종료일을 직접 비교하면 시계가 어긋난 순간
     * 브리핑과 모집 상세가 같은 모집을 다르게 부른다(#896). today 는 이번 주를 정한 같은 seoulClock 의 날짜다.
     */
    public RecruitmentDisplayStatus displayStatus(LocalDate today) {
        return RecruitmentDisplayStatus.resolve(status, startDate, endDate, today);
    }
}

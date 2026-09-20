package com.duing.domain.recruitment.stats.repository;

import com.duing.domain.application.entity.ApplicationStatus;
import java.time.LocalDate;
import java.util.Map;

public interface RecruitmentStatsRepositoryCustom {

    Map<ApplicationStatus, Long> findSummaryByRecruitmentId(Long recruitmentId);

    Map<LocalDate, Long> findDailySubmissionCounts(Long recruitmentId, LocalDate startDate, LocalDate endDate);

    /** 면접 단계에 한 번이라도 진입한 지원 수 — 상태 이력(INTERVIEW_PENDING 진입) 또는 현재 상태(INTERVIEW_PENDING·ACCEPTED) 기준 DISTINCT. */
    long countInterviewEntered(Long recruitmentId);
}

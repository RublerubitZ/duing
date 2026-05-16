package com.duing.domain.recruitment.stats.repository;

import com.duing.domain.application.entity.ApplicationStatus;
import java.time.LocalDate;
import java.util.Map;

public interface RecruitmentStatsRepositoryCustom {

    Map<ApplicationStatus, Long> findSummaryByRecruitmentId(Long recruitmentId);

    Map<LocalDate, Long> findDailySubmissionCounts(Long recruitmentId, LocalDate startDate, LocalDate endDate);
}
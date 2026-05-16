package com.duing.domain.recruitment.stats.repository;

import com.duing.domain.application.entity.ApplicationStatus;
import java.util.Map;

public interface RecruitmentStatsRepositoryCustom {

    Map<ApplicationStatus, Long> findSummaryByRecruitmentId(Long recruitmentId);
}
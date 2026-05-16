package com.duing.domain.recruitment.stats.service;

import com.duing.domain.recruitment.stats.service.dto.query.StatsSummaryQuery;

public interface RecruitmentStatsService {

    StatsSummaryQuery getSummary(Long recruitmentId, Long currentUserId);
}
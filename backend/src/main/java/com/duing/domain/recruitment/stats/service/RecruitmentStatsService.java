package com.duing.domain.recruitment.stats.service;

import com.duing.domain.recruitment.stats.service.dto.query.StatsDailyPointQuery;
import com.duing.domain.recruitment.stats.service.dto.query.StatsFunnelQuery;
import com.duing.domain.recruitment.stats.service.dto.query.StatsSummaryQuery;
import java.util.List;

public interface RecruitmentStatsService {

    StatsSummaryQuery getSummary(Long recruitmentId, Long currentUserId);

    List<StatsDailyPointQuery> getDaily(Long recruitmentId, Long currentUserId);

    StatsFunnelQuery getFunnel(Long recruitmentId, Long currentUserId);
}
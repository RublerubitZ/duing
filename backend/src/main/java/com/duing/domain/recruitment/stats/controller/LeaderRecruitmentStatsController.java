package com.duing.domain.recruitment.stats.controller;

import com.duing.domain.recruitment.stats.api.LeaderRecruitmentStatsApi;
import com.duing.domain.recruitment.stats.controller.dto.response.StatsDailyPointResponse;
import com.duing.domain.recruitment.stats.controller.dto.response.StatsFunnelResponse;
import com.duing.domain.recruitment.stats.controller.dto.response.StatsSummaryResponse;
import com.duing.domain.recruitment.stats.service.RecruitmentStatsService;
import com.duing.domain.recruitment.stats.service.dto.query.StatsDailyPointQuery;
import com.duing.domain.recruitment.stats.service.dto.query.StatsFunnelQuery;
import com.duing.domain.recruitment.stats.service.dto.query.StatsSummaryQuery;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class LeaderRecruitmentStatsController implements LeaderRecruitmentStatsApi {

    private final RecruitmentStatsService recruitmentStatsService;

    @Override
    public ResponseEntity<ApiResponse<StatsSummaryResponse>> getSummary(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        StatsSummaryQuery statsSummaryQuery = recruitmentStatsService.getSummary(recruitmentId, currentUser.id());
        return ResponseEntity.ok(ApiResponse.success(StatsSummaryResponse.from(statsSummaryQuery)));
    }

    @Override
    public ResponseEntity<ApiResponse<List<StatsDailyPointResponse>>> getDaily(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<StatsDailyPointQuery> dailyPointQueries = recruitmentStatsService.getDaily(recruitmentId, currentUser.id());
        List<StatsDailyPointResponse> dailyPointResponses = dailyPointQueries.stream()
                .map(StatsDailyPointResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(dailyPointResponses));
    }

    @Override
    public ResponseEntity<ApiResponse<StatsFunnelResponse>> getFunnel(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        StatsFunnelQuery statsFunnelQuery = recruitmentStatsService.getFunnel(recruitmentId, currentUser.id());
        return ResponseEntity.ok(ApiResponse.success(StatsFunnelResponse.from(statsFunnelQuery)));
    }
}
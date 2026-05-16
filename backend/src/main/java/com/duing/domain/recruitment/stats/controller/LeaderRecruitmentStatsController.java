package com.duing.domain.recruitment.stats.controller;

import com.duing.domain.recruitment.stats.api.LeaderRecruitmentStatsApi;
import com.duing.domain.recruitment.stats.controller.dto.response.StatsSummaryResponse;
import com.duing.domain.recruitment.stats.service.RecruitmentStatsService;
import com.duing.domain.recruitment.stats.service.dto.query.StatsSummaryQuery;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
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
}
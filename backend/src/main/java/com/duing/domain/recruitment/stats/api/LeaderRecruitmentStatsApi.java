package com.duing.domain.recruitment.stats.api;

import com.duing.domain.recruitment.stats.controller.dto.response.StatsSummaryResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "모집 통계(동아리 운영진)", description = "동아리 운영진 전용 모집 통계 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderRecruitmentStatsApi {

    @Operation(
            summary = "모집 통계 요약 조회",
            description = "모집 공고의 지원 현황을 상태별로 집계하여 반환합니다. "
                    + "전체/제출됨/검토중/면접대기/합격/불합격 수와 capacity 대비 합격 비율을 포함합니다."
    )
    @GetMapping("/leader/recruitments/{recruitmentId}/stats/summary")
    ResponseEntity<ApiResponse<StatsSummaryResponse>> getSummary(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}
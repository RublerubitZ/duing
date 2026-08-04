package com.duing.domain.recruitment.stats.api;

import com.duing.domain.recruitment.stats.controller.dto.response.StatsDailyPointResponse;
import com.duing.domain.recruitment.stats.controller.dto.response.StatsFunnelResponse;
import com.duing.domain.recruitment.stats.controller.dto.response.StatsSummaryResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
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
                    + "전체/제출됨/보류/면접대기/합격/불합격 수와 capacity 대비 합격 비율을 포함합니다. "
                    + "total 은 나머지 상태 수의 합과 항상 일치합니다."
    )
    @GetMapping("/leader/recruitments/{recruitmentId}/stats/summary")
    ResponseEntity<ApiResponse<StatsSummaryResponse>> getSummary(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "모집 일자별 지원 추이 조회",
            description = "모집 기간(startDate ~ endDate) 전 일자에 대해 KST 기준 일별 지원 제출 건수를 반환합니다. "
                    + "지원이 없는 날짜는 submittedCount=0 으로 padding 되어 프론트 차트에서 빈 날도 점으로 렌더됩니다."
    )
    @GetMapping("/leader/recruitments/{recruitmentId}/stats/daily")
    ResponseEntity<ApiResponse<List<StatsDailyPointResponse>>> getDaily(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "모집 단계별 Funnel 조회",
            description = "제출 → 면접 진입 → 합격의 3단계 카운트를 반환합니다. "
                    + "useInterview=false 인 모집의 경우 interviewEntered 는 null 로 응답되어 프론트가 2단계 funnel 로 표시할 수 있습니다."
    )
    @GetMapping("/leader/recruitments/{recruitmentId}/stats/funnel")
    ResponseEntity<ApiResponse<StatsFunnelResponse>> getFunnel(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}
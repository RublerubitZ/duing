package com.duing.domain.recruitment.api;

import com.duing.domain.recruitment.controller.dto.response.RecruitmentDetailResponse;
import com.duing.domain.recruitment.controller.dto.response.RecruitmentSummaryResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.YearMonth;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "모집 공고", description = "모집 공고 탐색 (공개)")
public interface RecruitmentApi {

    @Operation(summary = "모집 달력 조회", description = "yearMonth(yyyy-MM)와 기간이 겹치는 모집 공고를 시작일순으로 반환한다.")
    @GetMapping("/recruitments")
    ResponseEntity<ApiResponse<List<RecruitmentSummaryResponse>>> getCalendar(
            @Parameter(description = "조회 연월 (예: 2026-05)", example = "2026-05")
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth
    );

    @Operation(summary = "모집 공고 상세 조회")
    @GetMapping("/recruitments/{recruitmentId}")
    ResponseEntity<ApiResponse<RecruitmentDetailResponse>> getRecruitment(@PathVariable Long recruitmentId);
}

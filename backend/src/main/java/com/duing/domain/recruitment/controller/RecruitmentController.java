package com.duing.domain.recruitment.controller;

import com.duing.domain.recruitment.api.RecruitmentApi;
import com.duing.domain.recruitment.controller.dto.response.RecruitmentDetailResponse;
import com.duing.domain.recruitment.controller.dto.response.RecruitmentSummaryResponse;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.global.response.ApiResponse;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class RecruitmentController implements RecruitmentApi {

    private final RecruitmentService recruitmentService;

    @Override
    public ResponseEntity<ApiResponse<List<RecruitmentSummaryResponse>>> getCalendar(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        boolean hasAnyRangeBound = from != null || to != null;
        boolean hasRange = from != null && to != null;
        if ((yearMonth != null) == hasAnyRangeBound || hasAnyRangeBound != hasRange) {
            throw new RecruitmentException.InvalidCalendarRangeException(
                    "조회 기간은 yearMonth 또는 from·to 중 하나로만 지정해야 합니다.");
        }
        // yearMonth 는 호환 경로 — 월 경계로 풀어 범위 조회와 같은 서비스·캐시를 탄다.
        LocalDate periodStart = hasRange ? from : yearMonth.atDay(1);
        LocalDate periodEnd = hasRange ? to : yearMonth.atEndOfMonth();
        List<RecruitmentSummaryResponse> calendar = recruitmentService.getCalendar(periodStart, periodEnd).stream()
                .map(RecruitmentSummaryResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(calendar));
    }

    @Override
    public ResponseEntity<ApiResponse<RecruitmentDetailResponse>> getRecruitment(@PathVariable Long recruitmentId) {
        RecruitmentDetailResponse response = RecruitmentDetailResponse.from(
                recruitmentService.getById(recruitmentId));
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}

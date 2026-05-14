package com.duing.domain.recruitment.controller;

import com.duing.domain.recruitment.api.RecruitmentApi;
import com.duing.domain.recruitment.controller.dto.response.RecruitmentDetailResponse;
import com.duing.domain.recruitment.controller.dto.response.RecruitmentSummaryResponse;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.global.response.ApiResponse;
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
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth
    ) {
        List<RecruitmentSummaryResponse> calendar = recruitmentService.getCalendar(yearMonth).stream()
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

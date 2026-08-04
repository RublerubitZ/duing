package com.duing.domain.recruitment.controller;

import com.duing.domain.recruitment.api.AdminRecruitmentApi;
import com.duing.domain.recruitment.controller.dto.response.AdminRecruitmentDetailResponse;
import com.duing.domain.recruitment.controller.dto.response.AdminRecruitmentSummaryResponse;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.AdminRecruitmentQueryService;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSearchCondition;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSort;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminRecruitmentController implements AdminRecruitmentApi {

    private final AdminRecruitmentQueryService adminRecruitmentQueryService;

    @Override
    public ResponseEntity<ApiResponse<List<AdminRecruitmentSummaryResponse>>> searchRecruitments(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) RecruitmentStatus status,
            @RequestParam(required = false) ApplicationMode mode,
            @RequestParam(defaultValue = "LATEST") AdminRecruitmentSort sort
    ) {
        List<AdminRecruitmentSummaryResponse> recruitments = adminRecruitmentQueryService
                .search(new AdminRecruitmentSearchCondition(q, status, mode, sort))
                .stream()
                .map(AdminRecruitmentSummaryResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(recruitments));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminRecruitmentDetailResponse>> getRecruitmentDetail(
            @PathVariable Long recruitmentId
    ) {
        return ResponseEntity.ok(ApiResponse.success(AdminRecruitmentDetailResponse.from(
                adminRecruitmentQueryService.getDetail(recruitmentId))));
    }
}

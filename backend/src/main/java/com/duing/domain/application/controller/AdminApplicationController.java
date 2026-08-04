package com.duing.domain.application.controller;

import com.duing.domain.application.api.AdminApplicationApi;
import com.duing.domain.application.controller.dto.response.AdminApplicantListResponse;
import com.duing.domain.application.controller.dto.response.AdminApplicationDetailResponse;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.AdminApplicationQueryService;
import com.duing.domain.application.service.dto.query.AdminApplicantSort;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminApplicationController implements AdminApplicationApi {

    private final AdminApplicationQueryService adminApplicationQueryService;

    @Override
    public ResponseEntity<ApiResponse<AdminApplicantListResponse>> getApplicants(
            @PathVariable Long recruitmentId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) ApplicationStatus status,
            @RequestParam(defaultValue = "LATEST") AdminApplicantSort sort
    ) {
        // 총동연 화면에는 단과대·제출일 필터가 없어 운영진 검색 조건의 해당 자리를 비워 재구성한다.
        ApplicantSearchCondition condition = new ApplicantSearchCondition(status, null, q, null, null);
        return ResponseEntity.ok(ApiResponse.success(AdminApplicantListResponse.from(
                adminApplicationQueryService.getApplicants(recruitmentId, condition, sort))));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminApplicationDetailResponse>> getApplicationDetail(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(AdminApplicationDetailResponse.from(
                adminApplicationQueryService.getApplicationDetail(applicationId, currentUser.id()))));
    }
}

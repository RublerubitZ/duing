package com.duing.domain.application.controller;

import com.duing.domain.application.api.LeaderApplicationApi;
import com.duing.domain.application.controller.dto.request.BulkUpdateApplicationStatusRequest;
import com.duing.domain.application.controller.dto.request.UpdateApplicationInterviewRequest;
import com.duing.domain.application.controller.dto.request.UpdateApplicationStatusRequest;
import com.duing.domain.application.controller.dto.response.ApplicantDetailResponse;
import com.duing.domain.application.controller.dto.response.ApplicantNeighborsResponse;
import com.duing.domain.application.controller.dto.response.ApplicantResponse;
import com.duing.domain.application.controller.dto.response.BulkUpdateApplicationStatusResponse;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.ApplicationService;
import com.duing.domain.application.service.dto.query.ApplicantNeighborsQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.domain.user.entity.College;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class LeaderApplicationController implements LeaderApplicationApi {

    private final ApplicationService applicationService;

    @Override
    public ResponseEntity<ApiResponse<List<ApplicantResponse>>> getApplicants(
            @PathVariable Long recruitmentId,
            @RequestParam(required = false) ApplicationStatus status,
            @RequestParam(required = false) College college,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedTo,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ApplicantSearchCondition condition = new ApplicantSearchCondition(status, college, q, submittedFrom, submittedTo);
        List<ApplicantResponse> applicants = applicationService
                .getApplicants(recruitmentId, currentUser.id(), condition).stream()
                .map(ApplicantResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(applicants));
    }

    @Override
    public ResponseEntity<ApiResponse<ApplicantDetailResponse>> getApplicantDetail(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ApplicantDetailResponse response = ApplicantDetailResponse.from(
                applicationService.getApplicantDetail(applicationId, currentUser.id()));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateStatus(
            @PathVariable Long applicationId,
            @Valid @RequestBody UpdateApplicationStatusRequest updateApplicationStatusRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        applicationService.updateStatus(
                updateApplicationStatusRequest.toCommand(applicationId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<BulkUpdateApplicationStatusResponse>> bulkUpdateStatus(
            @Valid @RequestBody BulkUpdateApplicationStatusRequest bulkUpdateApplicationStatusRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        BulkUpdateApplicationStatusResponse response = BulkUpdateApplicationStatusResponse.from(
                applicationService.bulkUpdateStatus(
                        bulkUpdateApplicationStatusRequest.toCommand(currentUser.id())));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateInterview(
            @PathVariable Long applicationId,
            @Valid @RequestBody UpdateApplicationInterviewRequest updateApplicationInterviewRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        applicationService.updateInterview(
                updateApplicationInterviewRequest.toCommand(applicationId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<ApplicantNeighborsResponse>> getApplicantNeighbors(
            @PathVariable Long recruitmentId,
            @PathVariable Long applicationId,
            @RequestParam(required = false) ApplicationStatus status,
            @RequestParam(required = false) College college,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedTo,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ApplicantSearchCondition condition = new ApplicantSearchCondition(status, college, q, submittedFrom, submittedTo);
        ApplicantNeighborsQuery neighborsQuery = applicationService.getNeighbors(
                recruitmentId, applicationId, currentUser.id(), condition);
        return ResponseEntity.ok(ApiResponse.success(ApplicantNeighborsResponse.from(neighborsQuery)));
    }
}

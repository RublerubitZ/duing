package com.duing.domain.application.controller;

import com.duing.domain.application.api.LeaderApplicationApi;
import com.duing.domain.application.controller.dto.request.UpdateApplicationStatusRequest;
import com.duing.domain.application.controller.dto.response.ApplicantDetailResponse;
import com.duing.domain.application.controller.dto.response.ApplicantResponse;
import com.duing.domain.application.service.ApplicationService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class LeaderApplicationController implements LeaderApplicationApi {

    private final ApplicationService applicationService;

    @Override
    public ResponseEntity<ApiResponse<List<ApplicantResponse>>> getApplicants(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<ApplicantResponse> applicants = applicationService
                .getApplicants(recruitmentId, currentUser.id()).stream()
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
}

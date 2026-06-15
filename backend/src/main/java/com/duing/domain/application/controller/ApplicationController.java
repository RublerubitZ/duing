package com.duing.domain.application.controller;

import com.duing.domain.application.api.ApplicationApi;
import com.duing.domain.application.controller.dto.request.SubmitApplicationRequest;
import com.duing.domain.application.controller.dto.response.ApplicationSummaryResponse;
import com.duing.domain.application.controller.dto.response.MyApplicationDetailResponse;
import com.duing.domain.application.service.ApplicationService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ApplicationController implements ApplicationApi {

    private final ApplicationService applicationService;

    @Override
    public ResponseEntity<ApiResponse<Long>> submit(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody SubmitApplicationRequest submitApplicationRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long applicationId = applicationService.submit(
                submitApplicationRequest.toCommand(recruitmentId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(applicationId));
    }

    @Override
    public ResponseEntity<ApiResponse<List<ApplicationSummaryResponse>>> getMyApplications(
            ApplicationScope scope,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<ApplicationSummaryResponse> myApplications = applicationService
                .getMyApplications(currentUser.id(), scope.toStatuses()).stream()
                .map(ApplicationSummaryResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(myApplications));
    }

    @Override
    public ResponseEntity<ApiResponse<MyApplicationDetailResponse>> getMyApplicationDetail(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        MyApplicationDetailResponse myApplicationDetail = MyApplicationDetailResponse.from(
                applicationService.getMyApplicationDetail(applicationId, currentUser.id()));
        return ResponseEntity.ok(ApiResponse.success(myApplicationDetail));
    }

    @Override
    public ResponseEntity<Void> withdraw(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        applicationService.withdraw(applicationId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}
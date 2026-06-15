package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.ApplicantInterviewApi;
import com.duing.domain.interview.controller.dto.request.RespondInterviewAvailabilityRequest;
import com.duing.domain.interview.controller.dto.response.ApplicantInterviewResponse;
import com.duing.domain.interview.service.ApplicantInterviewService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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
public class ApplicantInterviewController implements ApplicantInterviewApi {

    private final ApplicantInterviewService applicantInterviewService;

    @Override
    public ResponseEntity<ApiResponse<ApplicantInterviewResponse>> getMyInterview(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(ApplicantInterviewResponse.from(
                applicantInterviewService.getMyInterview(applicationId, currentUser.id()))));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> respondAvailability(
            @PathVariable Long applicationId,
            @Valid @RequestBody RespondInterviewAvailabilityRequest respondInterviewAvailabilityRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        applicantInterviewService.respondAvailability(
                respondInterviewAvailabilityRequest.toCommand(applicationId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
}

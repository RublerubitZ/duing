package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.InterviewAvailabilityApi;
import com.duing.domain.interview.controller.dto.request.UpdateAvailabilityRequest;
import com.duing.domain.interview.controller.dto.response.MyInterviewAvailabilitiesResponse;
import com.duing.domain.interview.service.InterviewAvailabilityService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class InterviewAvailabilityController implements InterviewAvailabilityApi {

    private final InterviewAvailabilityService interviewAvailabilityService;

    @Override
    public ResponseEntity<ApiResponse<MyInterviewAvailabilitiesResponse>> findMyAvailabilities(
            Long applicationId,
            UserPrincipal currentUser
    ) {
        MyInterviewAvailabilitiesResponse response =
                interviewAvailabilityService.findMyAvailabilities(applicationId, currentUser.id());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> replace(
            Long applicationId,
            UpdateAvailabilityRequest request,
            UserPrincipal currentUser
    ) {
        interviewAvailabilityService.replace(request.toCommand(applicationId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
}

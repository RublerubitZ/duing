package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.LeaderInterviewAssignmentApi;
import com.duing.domain.interview.controller.dto.response.AutoAssignResponse;
import com.duing.domain.interview.service.InterviewAssignmentService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class LeaderInterviewAssignmentController implements LeaderInterviewAssignmentApi {

    private final InterviewAssignmentService interviewAssignmentService;

    @Override
    public ResponseEntity<ApiResponse<AutoAssignResponse>> autoAssign(
            @PathVariable Long roundId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(AutoAssignResponse.from(
                interviewAssignmentService.autoAssign(roundId, currentUser.id()))));
    }
}

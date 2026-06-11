package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.LeaderInterviewAssignmentApi;
import com.duing.domain.interview.controller.dto.request.AssignScheduleRequest;
import com.duing.domain.interview.controller.dto.response.AutoAssignResponse;
import com.duing.domain.interview.controller.dto.response.ConfirmRoundResponse;
import com.duing.domain.interview.service.InterviewAssignmentService;
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
import org.springframework.web.bind.annotation.RequestParam;
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

    @Override
    public ResponseEntity<ApiResponse<Void>> assignSchedule(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @Valid @RequestBody AssignScheduleRequest assignScheduleRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewAssignmentService.assignSchedule(
                roundId, memberId, assignScheduleRequest.slotId(), currentUser.id());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> unassignSchedule(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewAssignmentService.unassignSchedule(roundId, memberId, currentUser.id());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> excludeMember(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewAssignmentService.excludeMember(roundId, memberId, currentUser.id());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<ConfirmRoundResponse>> confirmRound(
            @PathVariable Long roundId,
            @RequestParam(defaultValue = "false") boolean force,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(ConfirmRoundResponse.from(
                interviewAssignmentService.confirmRound(roundId, force, currentUser.id()))));
    }
}

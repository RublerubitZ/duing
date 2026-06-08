package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.ManagerInterviewScheduleApi;
import com.duing.domain.interview.controller.dto.request.AssignInterviewScheduleRequest;
import com.duing.domain.interview.controller.dto.response.AutoAssignResultResponse;
import com.duing.domain.interview.controller.dto.response.MatchingCandidatesResponse;
import com.duing.domain.interview.service.InterviewScheduleService;
import com.duing.domain.interview.service.dto.query.ScheduleListView;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ManagerInterviewScheduleController implements ManagerInterviewScheduleApi {

    private final InterviewScheduleService interviewScheduleService;

    @Override
    public ResponseEntity<ApiResponse<AutoAssignResultResponse>> autoAssign(
            Long recruitmentId,
            UserPrincipal currentUser
    ) {
        AutoAssignResultResponse result = interviewScheduleService.autoAssign(recruitmentId, currentUser.id());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @Override
    public ResponseEntity<ApiResponse<List<ScheduleListView>>> listSchedules(
            Long recruitmentId,
            UserPrincipal currentUser
    ) {
        List<ScheduleListView> schedules = interviewScheduleService.listSchedules(recruitmentId, currentUser.id());
        return ResponseEntity.ok(ApiResponse.success(schedules));
    }

    @Override
    public ResponseEntity<ApiResponse<MatchingCandidatesResponse>> listCandidates(
            Long recruitmentId,
            UserPrincipal currentUser
    ) {
        MatchingCandidatesResponse candidates = interviewScheduleService.listCandidates(recruitmentId, currentUser.id());
        return ResponseEntity.ok(ApiResponse.success(candidates));
    }

    @Override
    public ResponseEntity<Void> assign(
            Long applicationId,
            AssignInterviewScheduleRequest request,
            UserPrincipal currentUser
    ) {
        interviewScheduleService.assign(request.toCommand(applicationId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> cancel(
            Long applicationId,
            UserPrincipal currentUser
    ) {
        interviewScheduleService.cancel(applicationId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}

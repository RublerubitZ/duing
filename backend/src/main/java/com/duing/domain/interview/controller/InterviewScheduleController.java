package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.InterviewScheduleApi;
import com.duing.domain.interview.controller.dto.response.MyInterviewScheduleResponse;
import com.duing.domain.interview.service.InterviewScheduleService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class InterviewScheduleController implements InterviewScheduleApi {

    private final InterviewScheduleService interviewScheduleService;

    @Override
    public ResponseEntity<ApiResponse<MyInterviewScheduleResponse>> getMySchedule(
            Long applicationId,
            UserPrincipal currentUser
    ) {
        MyInterviewScheduleResponse scheduleResponse =
                interviewScheduleService.findMySchedule(applicationId, currentUser.id());
        return ResponseEntity.ok(ApiResponse.success(scheduleResponse));
    }
}

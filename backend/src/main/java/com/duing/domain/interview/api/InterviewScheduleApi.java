package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.response.MyInterviewScheduleResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

@Tag(name = "지원자 면접 일정", description = "지원자 본인의 면접 일정 조회")
@SecurityRequirement(name = "BearerAuth")
@RequestMapping("/api/v1/applications/{applicationId}/interview-schedule")
public interface InterviewScheduleApi {

    @Operation(
            summary = "본인 면접 일정 조회 (GET)",
            description = "배정 여부와 무관하게 200을 반환한다. CANCELLED 상태도 포함해 노출한다."
    )
    @GetMapping
    ResponseEntity<ApiResponse<MyInterviewScheduleResponse>> getMySchedule(
            @PathVariable Long applicationId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.request.UpdateAvailabilityRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;

@Tag(name = "지원자 면접 가능시간", description = "지원자 본인의 면접 가능시간 전체 교체")
@SecurityRequirement(name = "BearerAuth")
@RequestMapping("/api/v1/applications/{applicationId}/interview-availabilities")
public interface InterviewAvailabilityApi {

    @Operation(summary = "면접 가능시간 전체 교체 (PUT)")
    @PutMapping
    ResponseEntity<ApiResponse<Void>> replace(
            @PathVariable Long applicationId,
            @Valid @RequestBody UpdateAvailabilityRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

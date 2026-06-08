package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.request.CreateInterviewConfigRequest;
import com.duing.domain.interview.controller.dto.request.UpdateInterviewConfigRequest;
import com.duing.domain.interview.controller.dto.response.CreateInterviewConfigResponse;
import com.duing.domain.interview.controller.dto.response.InterviewConfigResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;

@Tag(name = "운영진 면접 설정", description = "운영진 면접 설정 생성 및 수정")
@SecurityRequirement(name = "BearerAuth")
@RequestMapping("/api/v1/recruitments/{recruitmentId}/interview-config")
public interface ManagerInterviewConfigApi {

    @Operation(summary = "면접 설정 조회 (운영진)")
    @GetMapping
    ResponseEntity<ApiResponse<InterviewConfigResponse>> get(
            @PathVariable Long recruitmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "면접 모집 활성화 + deadline 설정")
    @PostMapping
    ResponseEntity<ApiResponse<CreateInterviewConfigResponse>> create(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateInterviewConfigRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "면접 설정 갱신")
    @PatchMapping
    ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody UpdateInterviewConfigRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

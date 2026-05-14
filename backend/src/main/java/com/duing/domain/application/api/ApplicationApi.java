package com.duing.domain.application.api;

import com.duing.domain.application.controller.dto.request.SubmitApplicationRequest;
import com.duing.domain.application.controller.dto.response.ApplicationSummaryResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "지원", description = "지원 제출 및 내 지원 현황")
@SecurityRequirement(name = "BearerAuth")
public interface ApplicationApi {

    @Operation(summary = "지원 제출", description = "모집 공고에 지원한다. 답변 개수는 RecruitmentForm 의 질문 개수와 일치해야 한다.")
    @PostMapping("/recruitments/{recruitmentId}/applications")
    ResponseEntity<ApiResponse<Long>> submit(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody SubmitApplicationRequest submitApplicationRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "내 지원 목록 조회", description = "본인이 제출한 지원을 최신순으로 반환한다.")
    @GetMapping("/users/me/applications")
    ResponseEntity<ApiResponse<List<ApplicationSummaryResponse>>> getMyApplications(
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}

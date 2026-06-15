package com.duing.domain.application.api;

import com.duing.domain.application.controller.ApplicationScope;
import com.duing.domain.application.controller.dto.request.SubmitApplicationRequest;
import com.duing.domain.application.controller.dto.response.ApplicationSummaryResponse;
import com.duing.domain.application.controller.dto.response.MyApplicationDetailResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

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

    @Operation(summary = "내 지원 목록 조회",
            description = "본인이 제출한 지원을 최신순으로 반환한다. scope 로 상태 그룹 필터링: all(기본·전체) / active(SUBMITTED·UNDER_REVIEW·INTERVIEW_PENDING) / archived(ACCEPTED·REJECTED).")
    @GetMapping("/users/me/applications")
    ResponseEntity<ApiResponse<List<ApplicationSummaryResponse>>> getMyApplications(
            @RequestParam(name = "scope", defaultValue = "ALL") ApplicationScope scope,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "내 지원 상세 조회", description = "본인 지원만 조회 가능. 답변·면접 일시·장소 포함.")
    @GetMapping("/users/me/applications/{applicationId}")
    ResponseEntity<ApiResponse<MyApplicationDetailResponse>> getMyApplicationDetail(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "지원 철회",
            description = "본인의 SUBMITTED 상태 지원을 철회한다. 검토가 시작된 지원은 철회할 수 없다.")
    @DeleteMapping("/users/me/applications/{applicationId}")
    ResponseEntity<Void> withdraw(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}

package com.duing.domain.applicationEvaluation.api;

import com.duing.domain.applicationEvaluation.controller.dto.request.UpsertApplicationEvaluationRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "지원자 평가(동아리장)", description = "운영진의 지원자 평가 — 본인 평가만 작성·수정·삭제")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderApplicationEvaluationApi {

    @Operation(summary = "내 평가 upsert", description = "본인 평가가 없으면 생성, 있으면 score/memo 를 갱신한다. 멱등.")
    @PutMapping("/leader/applications/{applicationId}/evaluations/me")
    ResponseEntity<ApiResponse<Void>> upsertMyEvaluation(
            @PathVariable Long applicationId,
            @Valid @RequestBody UpsertApplicationEvaluationRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "내 평가 삭제", description = "본인 평가를 삭제. 없는 상태에서 호출해도 204 (idempotent).")
    @DeleteMapping("/leader/applications/{applicationId}/evaluations/me")
    ResponseEntity<ApiResponse<Void>> deleteMyEvaluation(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}

package com.duing.domain.applicationEvaluation.controller;

import com.duing.domain.applicationEvaluation.api.LeaderApplicationEvaluationApi;
import com.duing.domain.applicationEvaluation.controller.dto.request.UpsertApplicationEvaluationRequest;
import com.duing.domain.applicationEvaluation.service.ApplicationEvaluationService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class LeaderApplicationEvaluationController implements LeaderApplicationEvaluationApi {

    private final ApplicationEvaluationService evaluationService;

    @Override
    public ResponseEntity<ApiResponse<Void>> upsertMyEvaluation(
            @PathVariable Long applicationId,
            @Valid @RequestBody UpsertApplicationEvaluationRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        evaluationService.upsert(request.toCommand(applicationId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteMyEvaluation(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        evaluationService.deleteMine(applicationId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}

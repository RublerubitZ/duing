package com.duing.domain.draft.controller;

import com.duing.domain.draft.api.ApplicationDraftApi;
import com.duing.domain.draft.controller.dto.request.UpsertDraftRequest;
import com.duing.domain.draft.controller.dto.response.DraftResponse;
import com.duing.domain.draft.service.ApplicationDraftService;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/recruitments/{recruitmentId}/draft")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ApplicationDraftController implements ApplicationDraftApi {

    private final ApplicationDraftService draftService;

    @Override
    public ResponseEntity<ApiResponse<DraftResponse>> get(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        DraftResponse draftResponse = draftService.find(currentUser.id(), recruitmentId)
                .map(DraftResponse::existing)
                .orElseGet(DraftResponse::empty);
        return ResponseEntity.ok(ApiResponse.success(draftResponse));
    }

    @Override
    public ResponseEntity<Void> upsert(
            @PathVariable Long recruitmentId,
            @RequestBody @Valid UpsertDraftRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        draftService.upsert(request.toCommand(currentUser.id(), recruitmentId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> delete(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        draftService.discard(currentUser.id(), recruitmentId);
        return ResponseEntity.noContent().build();
    }
}
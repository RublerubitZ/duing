package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.LeaderFeePolicyApi;
import com.duing.domain.fee.controller.dto.request.CreateFeePolicyRequest;
import com.duing.domain.fee.controller.dto.request.UpdateFeePolicyRequest;
import com.duing.domain.fee.controller.dto.response.FeePolicyResponse;
import com.duing.domain.fee.service.FeePolicyService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class LeaderFeePolicyController implements LeaderFeePolicyApi {

    private final FeePolicyService feePolicyService;

    @Override
    public ResponseEntity<ApiResponse<Long>> create(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateFeePolicyRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long policyId = feePolicyService.create(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(policyId));
    }

    @Override
    public ResponseEntity<ApiResponse<List<FeePolicyResponse>>> getPolicies(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<FeePolicyResponse> responses = feePolicyService.getPolicies(clubId, currentUser.id())
                .stream().map(FeePolicyResponse::from).toList();
        return ResponseEntity.ok(ApiResponse.success(responses));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long clubId,
            @PathVariable Long policyId,
            @Valid @RequestBody UpdateFeePolicyRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        feePolicyService.update(request.toCommand(clubId, currentUser.id(), policyId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable Long clubId,
            @PathVariable Long policyId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        feePolicyService.delete(clubId, currentUser.id(), policyId);
        return ResponseEntity.noContent().build();
    }
}

package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.LeaderFeeBillApi;
import com.duing.domain.fee.controller.dto.request.GenerateBillsRequest;
import com.duing.domain.fee.controller.dto.response.GenerateBillsResponse;
import com.duing.domain.fee.service.FeeBillService;
import com.duing.domain.fee.service.dto.query.GenerateBillsResult;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
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
public class LeaderFeeBillController implements LeaderFeeBillApi {

    private final FeeBillService feeBillService;

    @Override
    public ResponseEntity<ApiResponse<GenerateBillsResponse>> generate(
            @PathVariable Long clubId,
            @PathVariable Long policyId,
            @Valid @RequestBody GenerateBillsRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        GenerateBillsResult result = feeBillService.generate(
                request.toCommand(clubId, currentUser.id(), policyId));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(GenerateBillsResponse.from(result)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> cancel(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        feeBillService.cancel(clubId, currentUser.id(), billId);
        return ResponseEntity.noContent().build();
    }
}

package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.request.GenerateBillsRequest;
import com.duing.domain.fee.controller.dto.response.GenerateBillsResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "회비 청구 (운영진)", description = "LEADER/OFFICER 회비 청구 발행·취소")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderFeeBillApi {

    @Operation(summary = "회비 청구 일괄 발행 (LEADER/OFFICER, 멱등)")
    @PostMapping("/leader/clubs/{clubId}/fee-policies/{policyId}/bills")
    ResponseEntity<ApiResponse<GenerateBillsResponse>> generate(
            @PathVariable Long clubId,
            @PathVariable Long policyId,
            @Valid @RequestBody GenerateBillsRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 청구 취소 (LEADER/OFFICER)")
    @DeleteMapping("/leader/clubs/{clubId}/fee-bills/{billId}")
    ResponseEntity<ApiResponse<Void>> cancel(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

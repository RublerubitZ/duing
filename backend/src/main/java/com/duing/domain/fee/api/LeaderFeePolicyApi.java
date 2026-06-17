package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.request.CreateFeePolicyRequest;
import com.duing.domain.fee.controller.dto.request.UpdateFeePolicyRequest;
import com.duing.domain.fee.controller.dto.response.FeePolicyResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "회비 정책 (운영진)", description = "LEADER/OFFICER 회비 정책 CRUD")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderFeePolicyApi {

    @Operation(summary = "회비 정책 생성 (LEADER/OFFICER)")
    @PostMapping("/leader/clubs/{clubId}/fee-policies")
    ResponseEntity<ApiResponse<Long>> create(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateFeePolicyRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 정책 목록 조회 (LEADER/OFFICER)")
    @GetMapping("/leader/clubs/{clubId}/fee-policies")
    ResponseEntity<ApiResponse<List<FeePolicyResponse>>> getPolicies(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 정책 수정 (LEADER/OFFICER)")
    @PatchMapping("/leader/clubs/{clubId}/fee-policies/{policyId}")
    ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long clubId,
            @PathVariable Long policyId,
            @Valid @RequestBody UpdateFeePolicyRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 정책 삭제 (LEADER/OFFICER)")
    @DeleteMapping("/leader/clubs/{clubId}/fee-policies/{policyId}")
    ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable Long clubId,
            @PathVariable Long policyId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

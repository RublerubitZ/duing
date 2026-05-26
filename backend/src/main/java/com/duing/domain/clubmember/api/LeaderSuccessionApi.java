package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.request.CreateLeaderSuccessionRequestRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "회장 승계", description = "잠수 LEADER 에 대한 OFFICER 승계 요청 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderSuccessionApi {

    @Operation(summary = "승계 요청 제출 (OFFICER)",
            description = "본인이 OFFICER 인 동아리의 LEADER 가 잠수 상태일 때 승계 의사를 제출한다.")
    @PostMapping("/clubs/{clubId}/leader-succession-requests")
    ResponseEntity<ApiResponse<Long>> createRequest(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateLeaderSuccessionRequestRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

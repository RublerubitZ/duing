package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.CreateRecertificationRequestRequest;
import com.duing.domain.club.controller.dto.response.RecertificationContextResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "재인증 (LEADER)", description = "LEADER 의 중앙동아리 재인증 컨텍스트 조회 및 신청 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderRecertificationApi {

    @Operation(summary = "재인증 신청 컨텍스트 조회 (LEADER)",
            description = "현재 OPEN 라운드·중앙동아리 여부·이미 제출한 PENDING 신청을 한 번에 반환한다.")
    @GetMapping("/clubs/{clubId}/recertification-context")
    ResponseEntity<ApiResponse<RecertificationContextResponse>> getContext(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "재인증 제출 (LEADER)",
            description = "본인이 LEADER 인 중앙동아리에 한해 OPEN 라운드에 재인증 의사를 제출한다.")
    @PostMapping("/clubs/{clubId}/recertification-requests")
    ResponseEntity<ApiResponse<Long>> createRequest(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateRecertificationRequestRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

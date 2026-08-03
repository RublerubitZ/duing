package com.duing.domain.joincode.api;

import com.duing.domain.joincode.controller.dto.response.JoinRequestDetailResponse;
import com.duing.domain.joincode.controller.dto.response.JoinRequestSummaryResponse;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "가입 요청", description = "가입 코드로 접수된 동아리 가입 요청 처리 (운영진 전용)")
public interface ClubJoinRequestApi {

    @Operation(summary = "가입 요청 목록 조회 (LEADER/OFFICER)",
            description = "상태별 가입 요청을 최신순으로 반환한다. status 를 생략하면 대기 중(PENDING)만 조회된다. "
                    + "전화번호는 목록에 포함되지 않는다 — 상세 조회에서만 확인할 수 있다.")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/join-requests")
    ResponseEntity<ApiResponse<List<JoinRequestSummaryResponse>>> getJoinRequests(
            @PathVariable Long clubId,
            @Parameter(description = "요청 상태 필터 (PENDING | APPROVED | REJECTED)", example = "PENDING")
            @RequestParam(defaultValue = "PENDING") JoinRequestStatus status,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "가입 요청 상세 조회 (LEADER/OFFICER)",
            description = "명단 대조에 필요한 전화번호를 포함한다. 다른 동아리의 요청은 존재를 알리지 않고 404 를 반환한다.")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/join-requests/{joinRequestId}")
    ResponseEntity<ApiResponse<JoinRequestDetailResponse>> getJoinRequest(
            @PathVariable Long clubId,
            @PathVariable Long joinRequestId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

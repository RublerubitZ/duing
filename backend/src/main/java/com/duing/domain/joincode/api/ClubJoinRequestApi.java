package com.duing.domain.joincode.api;

import com.duing.domain.joincode.controller.dto.request.BulkApproveJoinRequestsRequest;
import com.duing.domain.joincode.controller.dto.request.DecideJoinRequestRequest;
import com.duing.domain.joincode.controller.dto.response.BulkApproveJoinRequestsResponse;
import com.duing.domain.joincode.controller.dto.response.JoinRequestDecisionResponse;
import com.duing.domain.joincode.controller.dto.response.JoinRequestDetailResponse;
import com.duing.domain.joincode.controller.dto.response.JoinRequestSummaryResponse;
import com.duing.domain.joincode.entity.JoinRequestStatus;
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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "가입 요청", description = "가입 링크로 접수된 동아리 가입 요청 처리 (운영진 전용)")
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

    @Operation(summary = "가입 요청 승인·거절 (LEADER/OFFICER)",
            description = "승인 시 잔여 인원을 차감하고 회원을 생성한다(기수는 요청 생성 시점 스냅샷). "
                    + "승인 요청이라도 이미 다른 경로로 가입된 회원이면 인원 차감 없이 자동 거절되므로, "
                    + "요청자가 이미 탈퇴한 계정이어도 같은 방식으로 자동 거절되므로, "
                    + "그 결과를 운영 콘솔에 전달하기 위해 PATCH 204 규약 대신 200 + result "
                    + "(APPROVED | REJECTED | AUTO_REJECTED | AUTO_REJECTED_WITHDRAWN) 로 응답한다. "
                    + "잔여 인원 부족·이미 처리된 요청·동시 처리 충돌은 409.")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}/join-requests/{joinRequestId}")
    ResponseEntity<ApiResponse<JoinRequestDecisionResponse>> decideJoinRequest(
            @PathVariable Long clubId,
            @PathVariable Long joinRequestId,
            @Valid @RequestBody DecideJoinRequestRequest decideJoinRequestRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "가입 요청 일괄 승인 (LEADER/OFFICER)",
            description = "건별 트랜잭션으로 승인해 한 건이 실패해도 나머지는 그대로 커밋된다. "
                    + "건별 처리 결과(승인 건수·실패 사유)를 반환해야 하므로 PATCH 204 규약 대신 200 + body 로 응답한다. "
                    + "실패 사유(잔여 인원 부족·이미 처리됨·자동 거절 등)는 failures 배열에 담겨 돌아온다.")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}/join-requests/bulk-approve")
    ResponseEntity<ApiResponse<BulkApproveJoinRequestsResponse>> bulkApproveJoinRequests(
            @PathVariable Long clubId,
            @Valid @RequestBody BulkApproveJoinRequestsRequest bulkApproveJoinRequestsRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

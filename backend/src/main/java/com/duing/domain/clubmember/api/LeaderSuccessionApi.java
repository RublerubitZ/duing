package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.request.CreateLeaderSuccessionRequestRequest;
import com.duing.domain.clubmember.controller.dto.response.MyLatestSuccessionRequestResponse;
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

@Tag(name = "회장 승계", description = "잠수 LEADER 에 대한 OFFICER 승계 요청 제출·내 최근 요청 조회 API")
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

    @Operation(summary = "내 최근 승계 요청 조회 (LEADER/OFFICER)",
            description = "현재 사용자가 이 동아리에서 한 가장 최근 승계 요청 1건과 총동연 처리 결과"
                    + "(상태·처리 메모·처리 시각)를 요청자 본인에게만 보여 준다. 다른 운영진의 요청은 보이지 않고,"
                    + " 승인돼 회장이 된 뒤에도 조회된다. 처리자·현 회장은 내보내지 않는다. 요청이 없으면 200 + data null.")
    @GetMapping("/clubs/{clubId}/leader-succession-requests/me/latest")
    ResponseEntity<ApiResponse<MyLatestSuccessionRequestResponse>> getMyLatestRequest(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

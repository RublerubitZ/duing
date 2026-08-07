package com.duing.domain.joincode.api;

import com.duing.domain.joincode.controller.dto.request.CreateJoinCodeRequest;
import com.duing.domain.joincode.controller.dto.response.JoinCodeResponse;
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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "가입 링크", description = "외부 폼 모집 합격자 등록용 가입 링크 (운영진 전용)")
public interface ClubJoinCodeApi {

    @Operation(summary = "가입 링크 생성 (LEADER/OFFICER)",
            description = "진행 중인 외부 폼(EXTERNAL) 모집에서만 생성할 수 있으며 그 모집에 귀속된다. 모집당 활성 링크는"
                    + " 1개로, 기존 활성 링크가 있으면 자동 폐기되는 재생성이다(재생성도 같은 조건). 자체 폼 모집이거나"
                    + " 모집이 진행 중이 아니면 409, 모집이 해당 동아리 소속이 아니면 404."
                    + " joinWindowDays 는 모집 종료 기준 가입 가능 기간 프리셋(0/7/14, 미지정 시 7)이며 그 외 값은 400.")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/clubs/{clubId}/recruitments/{recruitmentId}/join-codes")
    ResponseEntity<ApiResponse<JoinCodeResponse>> createJoinCode(
            @PathVariable Long clubId,
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateJoinCodeRequest createJoinCodeRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "활성 가입 링크 조회 (LEADER/OFFICER)",
            description = "해당 모집의 폐기되지 않은 가입 링크 1건을 반환한다. 활성 링크가 없으면 200 + data null."
                    + " 상태 카드용으로 그 링크의 누적 가입 신청 수(totalRequestCount, 거절 후 재요청 포함 전 상태)와"
                    + " 승인 대기 수(pendingCount)를 함께 내려준다.")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/recruitments/{recruitmentId}/join-codes/active")
    ResponseEntity<ApiResponse<JoinCodeResponse>> getActiveJoinCode(
            @PathVariable Long clubId,
            @PathVariable Long recruitmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "가입 링크 폐기 (LEADER/OFFICER)",
            description = "이미 폐기된 링크를 다시 폐기해도 성공하며 최초 폐기 시각은 보존된다(멱등).")
    @SecurityRequirement(name = "bearerAuth")
    @DeleteMapping("/clubs/{clubId}/recruitments/{recruitmentId}/join-codes/{joinCodeId}")
    ResponseEntity<Void> revokeJoinCode(
            @PathVariable Long clubId,
            @PathVariable Long recruitmentId,
            @PathVariable Long joinCodeId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

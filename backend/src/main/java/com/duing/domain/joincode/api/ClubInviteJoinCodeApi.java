package com.duing.domain.joincode.api;

import com.duing.domain.joincode.controller.dto.request.CreateClubInviteCodeRequest;
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

@Tag(name = "부원 초대 링크", description = "모집과 무관한 동아리 단위 부원 초대 링크 (운영진 전용)")
public interface ClubInviteJoinCodeApi {

    @Operation(summary = "부원 초대 링크 생성 (LEADER/OFFICER)",
            description = "모집 여부·상태와 무관하게 언제든 발급할 수 있다. 동아리당 활성 링크는 1개로,"
                    + " 기존 활성 링크가 있으면 자동 폐기되는 재생성이다. expiresInHours 는 유효기간"
                    + " 프리셋(24|72, 미지정 시 24)이며 그 외 값은 400. autoApprove 가 true 면 링크로 들어온"
                    + " 신청이 즉시 승인·가입 처리된다(생성 후 변경 불가 — 바꾸려면 재발급).")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/clubs/{clubId}/join-codes")
    ResponseEntity<ApiResponse<JoinCodeResponse>> createClubInviteCode(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateClubInviteCodeRequest createClubInviteCodeRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "활성 부원 초대 링크 조회 (LEADER/OFFICER)",
            description = "해당 동아리의 폐기되지 않은 초대 링크 1건을 반환한다. 활성 링크가 없으면 200 + data null."
                    + " 상태 카드용으로 그 링크의 누적 가입 신청 수(totalRequestCount, 거절 후 재요청 포함 전 상태)와"
                    + " 승인 대기 수(pendingCount)를 함께 내려준다. 모집 귀속 링크는 여기에 잡히지 않는다.")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/join-codes/active")
    ResponseEntity<ApiResponse<JoinCodeResponse>> getActiveClubInviteCode(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "부원 초대 링크 폐기 (LEADER/OFFICER)",
            description = "이미 폐기된 링크를 다시 폐기해도 성공하며 최초 폐기 시각은 보존된다(멱등)."
                    + " 모집 귀속 링크나 다른 동아리의 링크 id 는 존재를 알리지 않고 404.")
    @SecurityRequirement(name = "bearerAuth")
    @DeleteMapping("/clubs/{clubId}/join-codes/{joinCodeId}")
    ResponseEntity<Void> revokeClubInviteCode(
            @PathVariable Long clubId,
            @PathVariable Long joinCodeId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

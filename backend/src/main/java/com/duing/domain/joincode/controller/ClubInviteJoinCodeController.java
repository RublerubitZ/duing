package com.duing.domain.joincode.controller;

import com.duing.domain.joincode.api.ClubInviteJoinCodeApi;
import com.duing.domain.joincode.controller.dto.request.CreateClubInviteCodeRequest;
import com.duing.domain.joincode.controller.dto.response.JoinCodeResponse;
import com.duing.domain.joincode.service.JoinCodeService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ClubInviteJoinCodeController implements ClubInviteJoinCodeApi {

    private final JoinCodeService joinCodeService;

    @Override
    public ResponseEntity<ApiResponse<JoinCodeResponse>> createClubInviteCode(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateClubInviteCodeRequest createClubInviteCodeRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        JoinCodeResponse created = JoinCodeResponse.from(joinCodeService.createClubInvite(
                createClubInviteCodeRequest.toCommand(clubId, currentUser.id())));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created));
    }

    @Override
    public ResponseEntity<ApiResponse<JoinCodeResponse>> getActiveClubInviteCode(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        // 활성 링크가 없으면 data null — FE jsonOkNullable 규약과 정합.
        JoinCodeResponse activeInviteCode =
                joinCodeService.findActiveClubInvite(clubId, currentUser.id())
                        .map(JoinCodeResponse::from)
                        .orElse(null);
        return ResponseEntity.ok(ApiResponse.success(activeInviteCode));
    }

    @Override
    public ResponseEntity<Void> revokeClubInviteCode(
            @PathVariable Long clubId,
            @PathVariable Long joinCodeId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        joinCodeService.revokeClubInvite(clubId, joinCodeId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}

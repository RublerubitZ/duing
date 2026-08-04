package com.duing.domain.joincode.controller;

import com.duing.domain.joincode.api.ClubJoinCodeApi;
import com.duing.domain.joincode.controller.dto.request.CreateJoinCodeRequest;
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
public class ClubJoinCodeController implements ClubJoinCodeApi {

    private final JoinCodeService joinCodeService;

    @Override
    public ResponseEntity<ApiResponse<JoinCodeResponse>> createJoinCode(
            @PathVariable Long clubId,
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateJoinCodeRequest createJoinCodeRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        JoinCodeResponse created = JoinCodeResponse.from(joinCodeService.create(
                createJoinCodeRequest.toCommand(clubId, recruitmentId, currentUser.id())));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created));
    }

    @Override
    public ResponseEntity<ApiResponse<JoinCodeResponse>> getActiveJoinCode(
            @PathVariable Long clubId,
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        // 활성 코드가 없으면 data null — FE jsonOkNullable 규약과 정합.
        JoinCodeResponse activeJoinCode =
                joinCodeService.findActive(clubId, recruitmentId, currentUser.id())
                        .map(JoinCodeResponse::from)
                        .orElse(null);
        return ResponseEntity.ok(ApiResponse.success(activeJoinCode));
    }

    @Override
    public ResponseEntity<Void> revokeJoinCode(
            @PathVariable Long clubId,
            @PathVariable Long recruitmentId,
            @PathVariable Long joinCodeId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        joinCodeService.revoke(clubId, recruitmentId, joinCodeId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}

package com.duing.domain.joincode.controller;

import com.duing.domain.joincode.api.AdminClubJoinCodeApi;
import com.duing.domain.joincode.controller.dto.request.ForceRevokeJoinCodeRequest;
import com.duing.domain.joincode.controller.dto.response.AdminClubJoinCodeResponse;
import com.duing.domain.joincode.service.AdminClubJoinCodeService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminClubJoinCodeController implements AdminClubJoinCodeApi {

    private final AdminClubJoinCodeService adminClubJoinCodeService;

    @Override
    public ResponseEntity<ApiResponse<List<AdminClubJoinCodeResponse>>> getJoinCodes(
            @PathVariable Long clubId
    ) {
        List<AdminClubJoinCodeResponse> joinCodes = adminClubJoinCodeService.getJoinCodes(clubId)
                .stream()
                .map(AdminClubJoinCodeResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(joinCodes));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> forceRevokeJoinCode(
            @PathVariable Long clubId,
            @PathVariable Long joinCodeId,
            @Valid @RequestBody ForceRevokeJoinCodeRequest forceRevokeJoinCodeRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        adminClubJoinCodeService.forceRevoke(
                clubId, joinCodeId, currentUser.id(), forceRevokeJoinCodeRequest.reason());
        return ResponseEntity.noContent().build();
    }
}

package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.ClubMembershipApi;
import com.duing.domain.clubmember.controller.dto.response.MyClubMembershipResponse;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ClubMembershipController implements ClubMembershipApi {

    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<MyClubMembershipResponse>> getMyMembership(
            Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ClubMember clubMember = clubAuthService.resolveMembership(currentUser.id(), clubId);
        return ResponseEntity.ok(ApiResponse.success(MyClubMembershipResponse.from(clubMember)));
    }
}

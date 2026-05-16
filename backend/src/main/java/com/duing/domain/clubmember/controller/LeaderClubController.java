package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.LeaderClubApi;
import com.duing.domain.clubmember.controller.dto.response.ManagedClubResponse;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class LeaderClubController implements LeaderClubApi {

    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<List<ManagedClubResponse>>> getManagedClubs(
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<ManagedClubResponse> managedClubs = clubAuthService.findManagedClubs(currentUser.id())
                .stream()
                .map(ManagedClubResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(managedClubs));
    }
}
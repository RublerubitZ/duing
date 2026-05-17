package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.ClubMemberApi;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberResponse;
import com.duing.domain.clubmember.service.ClubMemberQueryService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ClubMemberController implements ClubMemberApi {

    private final ClubMemberQueryService clubMemberQueryService;

    @Override
    public ResponseEntity<ApiResponse<List<ClubMemberResponse>>> listMembers(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<ClubMemberResponse> members = clubMemberQueryService.getMembers(clubId, currentUser.id()).stream()
                .map(ClubMemberResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(members));
    }
}
package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.AdminClubMemberApi;
import com.duing.domain.clubmember.controller.dto.response.AdminClubMemberResponse;
import com.duing.domain.clubmember.service.ClubMemberQueryService;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminClubMemberController implements AdminClubMemberApi {

    private final ClubMemberQueryService clubMemberQueryService;

    @Override
    public ResponseEntity<ApiResponse<List<AdminClubMemberResponse>>> getClubMembers(
            @PathVariable Long clubId
    ) {
        List<AdminClubMemberResponse> members = clubMemberQueryService.getMembersForAdmin(clubId).stream()
                .map(AdminClubMemberResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(members));
    }
}

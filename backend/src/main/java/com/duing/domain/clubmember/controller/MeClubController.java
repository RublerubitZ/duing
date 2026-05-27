package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.MeClubApi;
import com.duing.domain.clubmember.controller.dto.response.MyClubResponse;
import com.duing.domain.clubmember.service.ClubMemberQueryService;
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
public class MeClubController implements MeClubApi {

    private final ClubMemberQueryService clubMemberQueryService;

    @Override
    public ResponseEntity<ApiResponse<List<MyClubResponse>>> getMyClubs(
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<MyClubResponse> myClubs = clubMemberQueryService.findMyClubs(currentUser.id())
                .stream()
                .map(MyClubResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(myClubs));
    }
}

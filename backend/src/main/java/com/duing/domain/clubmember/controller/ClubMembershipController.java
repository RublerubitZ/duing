package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.ClubMembershipApi;
import com.duing.domain.clubmember.controller.dto.response.MyClubMembershipResponse;
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

    /**
     * "이 동아리의 멤버인가"를 묻는 판정 조회다. 비멤버는 거부가 아니라 조회 결과가 없는 것이므로
     * 200 + data:null 로 답한다 — 403 으로 답하면 정상 탐색이 오류 로그로 쌓이고, 호출자가 정상 흐름을
     * 오류 처리에서 조립하게 된다. 반면 비 ACTIVE 동아리는 실제 접근 거부이므로 403 을 유지한다
     * (스펙 Part B — 상태별 안내 문구가 클라이언트 안내에 그대로 쓰인다).
     */
    @Override
    public ResponseEntity<ApiResponse<MyClubMembershipResponse>> getMyMembership(
            Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        MyClubMembershipResponse membership = clubAuthService
                .findAccessibleMembership(currentUser.id(), clubId)
                .map(MyClubMembershipResponse::from)
                .orElse(null);
        return ResponseEntity.ok(ApiResponse.success(membership));
    }
}

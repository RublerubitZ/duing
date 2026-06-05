package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.response.MyClubMembershipResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "동아리 멤버십", description = "본 사용자의 동아리 멤버십·권한 판정 API")
@SecurityRequirement(name = "BearerAuth")
public interface ClubMembershipApi {

    @Operation(summary = "내 동아리 멤버십 조회",
            description = "본 사용자가 해당 동아리의 활성 멤버인지 판정하고, 역할·가입일·도메인별 권한 매트릭스를 반환한다.")
    @GetMapping("/clubs/{clubId}/membership")
    ResponseEntity<ApiResponse<MyClubMembershipResponse>> getMyMembership(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

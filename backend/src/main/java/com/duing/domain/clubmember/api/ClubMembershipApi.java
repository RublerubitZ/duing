package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.response.MyClubMembershipResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
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
            description = "본 사용자가 해당 동아리의 활성 멤버인지 판정하고, 역할·가입일·도메인별 권한 매트릭스를 반환한다. "
                    + "멤버가 아닌 것은 거부가 아니라 조회 결과 없음이므로 200 + data:null 로 응답한다 "
                    + "(존재하지 않는 동아리도 동일 — 존재 은닉).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "200", description = "멤버십. 멤버가 아니면 data 가 null"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "동아리가 ACTIVE 가 아님 — 멤버 내부 영역 접근 차단(스펙 Part B). "
                            + "message 에 상태별 안내가 담기며 클라이언트가 그대로 노출한다",
                    content = @Content)
    })
    @GetMapping("/clubs/{clubId}/membership")
    ResponseEntity<ApiResponse<MyClubMembershipResponse>> getMyMembership(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

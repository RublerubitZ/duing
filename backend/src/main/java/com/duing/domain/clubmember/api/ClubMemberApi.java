package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.response.ClubMemberResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "동아리 멤버", description = "동아리 멤버 관리 (운영진)")
public interface ClubMemberApi {

    @Operation(summary = "동아리 멤버 목록 (LEADER/OFFICER)",
            description = "LEADER→OFFICER→MEMBER 순, 그룹 내 가입일 오름차순. 페이지네이션 없음.")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/members")
    ResponseEntity<ApiResponse<List<ClubMemberResponse>>> listMembers(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
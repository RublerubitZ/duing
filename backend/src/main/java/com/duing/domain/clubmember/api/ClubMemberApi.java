package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.request.UpdateMemberRoleRequest;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberExportResponse;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberResponse;
import com.duing.domain.clubmember.controller.dto.response.TransferLeaderResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

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

    @Operation(summary = "멤버 명단 CSV용 export (LEADER)",
            description = "회장 전용. includePhone=true 면 전화번호 포함(기본 false). CSV 생성은 프론트.")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/members/export")
    ResponseEntity<ApiResponse<List<ClubMemberExportResponse>>> exportMembers(
            @PathVariable Long clubId,
            @RequestParam(defaultValue = "false") boolean includePhone,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "멤버 역할 변경 (LEADER)",
            description = "OFFICER ↔ MEMBER 만 가능. LEADER 변경은 회장 인계 사용.")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}/members/{memberId}/role")
    ResponseEntity<Void> updateMemberRole(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Valid @RequestBody UpdateMemberRoleRequest updateMemberRoleRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "본인 탈퇴 (모든 멤버, LEADER 거부)")
    @SecurityRequirement(name = "bearerAuth")
    @DeleteMapping("/clubs/{clubId}/members/me")
    ResponseEntity<Void> leaveClub(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "멤버 강퇴 (LEADER)")
    @SecurityRequirement(name = "bearerAuth")
    @DeleteMapping("/clubs/{clubId}/members/{memberId}")
    ResponseEntity<Void> removeMember(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회장 인계 (LEADER)",
            description = "단일 트랜잭션 + PESSIMISTIC_WRITE 로 두 멤버의 역할을 교환한다.")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/clubs/{clubId}/members/{memberId}/transfer-leader")
    ResponseEntity<ApiResponse<TransferLeaderResponse>> transferLeader(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

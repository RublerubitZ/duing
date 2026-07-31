package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.request.UpdateMemberGenerationRequest;
import com.duing.domain.clubmember.controller.dto.request.UpdateMemberRoleRequest;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberExportResponse;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberResponse;
import com.duing.domain.clubmember.controller.dto.response.MemberPhoneResponse;
import com.duing.domain.clubmember.controller.dto.response.TransferLeaderResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
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

    @Operation(summary = "멤버 명단 CSV용 export (LEADER/OFFICER)",
            description = "운영진(LEADER/OFFICER) 전용. includePhone=true 면 전화번호 포함(기본 false). CSV 생성은 프론트. "
                    + "memberIds 를 주면 그 멤버만 내려준다(화면 필터 결과 그대로 내보낼 때) — 생략하면 전체.")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/members/export")
    ResponseEntity<ApiResponse<List<ClubMemberExportResponse>>> exportMembers(
            @PathVariable Long clubId,
            @RequestParam(defaultValue = "false") boolean includePhone,
            @RequestParam(required = false) List<Long> memberIds,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회원 원본 연락처 조회 (LEADER/OFFICER)",
            description = "운영진(LEADER/OFFICER) 전용. 마스킹되지 않은 원본 번호를 반환하며, 조회 사실(조회자·대상·시각)을 감사 로그로 남긴다. "
                    + "응답은 캐시하지 않는다(no-store). 목록·export 는 계속 마스킹만 제공한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "200", description = "원본 연락처"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "운영진이 아니거나, 동아리가 ACTIVE 가 아님", content = @Content),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "조회할 수 없는 멤버 — 존재하지 않는 memberId, 타 동아리 memberId, "
                            + "탈퇴한 회원(User soft-delete 후 남은 멤버십 행)을 구분하지 않는다(존재 은닉)",
                    content = @Content)
    })
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/members/{memberId}/phone")
    ResponseEntity<ApiResponse<MemberPhoneResponse>> getMemberPhone(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
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

    @Operation(summary = "멤버 기수 변경 (LEADER)",
            description = "generation 을 지정하거나 null 로 비운다. use_generation 표시 설정과 무관하게 저장된다.")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}/members/{memberId}/generation")
    ResponseEntity<Void> updateMemberGeneration(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Valid @RequestBody UpdateMemberGenerationRequest updateMemberGenerationRequest,
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

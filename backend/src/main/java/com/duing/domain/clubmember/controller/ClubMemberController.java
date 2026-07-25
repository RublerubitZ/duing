package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.ClubMemberApi;
import com.duing.domain.clubmember.controller.dto.request.UpdateMemberGenerationRequest;
import com.duing.domain.clubmember.controller.dto.request.UpdateMemberRoleRequest;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberExportResponse;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberResponse;
import com.duing.domain.clubmember.controller.dto.response.MemberPhoneResponse;
import com.duing.domain.clubmember.controller.dto.response.TransferLeaderResponse;
import com.duing.domain.clubmember.service.ClubMemberCommandService;
import com.duing.domain.clubmember.service.ClubMemberQueryService;
import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ClubMemberController implements ClubMemberApi {

    private final ClubMemberQueryService clubMemberQueryService;
    private final ClubMemberCommandService clubMemberCommandService;

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

    @Override
    public ResponseEntity<ApiResponse<List<ClubMemberExportResponse>>> exportMembers(
            @PathVariable Long clubId,
            @RequestParam(defaultValue = "false") boolean includePhone,
            @RequestParam(required = false) List<Long> memberIds,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<ClubMemberExportResponse> members = clubMemberQueryService
                .getMembersForExport(clubId, currentUser.id(), includePhone, memberIds).stream()
                .map(ClubMemberExportResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(members));
    }

    @Override
    public ResponseEntity<ApiResponse<MemberPhoneResponse>> getMemberPhone(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        String phone = clubMemberQueryService.getMemberPhone(clubId, memberId, currentUser.id());
        // 개인정보 응답이 브라우저·중간 캐시에 남지 않게 한다(패널을 닫으면 사라지는 UX 와 정합).
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(MemberPhoneResponse.from(phone)));
    }

    @Override
    public ResponseEntity<Void> updateMemberRole(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Valid @RequestBody UpdateMemberRoleRequest updateMemberRoleRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubMemberCommandService.updateRole(
                updateMemberRoleRequest.toCommand(clubId, memberId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> updateMemberGeneration(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Valid @RequestBody UpdateMemberGenerationRequest updateMemberGenerationRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubMemberCommandService.updateGeneration(
                updateMemberGenerationRequest.toCommand(clubId, memberId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> leaveClub(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubMemberCommandService.leave(new LeaveClubCommand(clubId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> removeMember(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubMemberCommandService.removeMember(
                new RemoveMemberCommand(clubId, memberId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<TransferLeaderResponse>> transferLeader(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        TransferLeaderResponse response = TransferLeaderResponse.from(
                clubMemberCommandService.transferLeader(
                        new TransferLeaderCommand(clubId, memberId, currentUser.id())));
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.CloseClubRequest;
import com.duing.domain.club.controller.dto.request.CreateClubRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubCentralClubRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubStatusRequest;
import com.duing.domain.club.controller.dto.response.AdminClubSummaryResponse;
import com.duing.domain.club.controller.dto.response.ClubDetailResponse;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "동아리(총동연)", description = "총동연 전용 동아리 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminClubApi {

    @Operation(summary = "동아리 목록 조회 (ADMIN)",
            description = "모든 상태(PENDING_APPROVAL/ACTIVE/INACTIVE) 동아리를 조회한다. status 미지정 시 전체 반환. 응답에 leader 정보 포함.")
    @GetMapping("/admin/clubs")
    ResponseEntity<ApiResponse<PageResponse<AdminClubSummaryResponse>>> getAdminClubs(
            @Parameter(description = "상태 필터 (미지정 시 전체)") @RequestParam(required = false) ClubStatus status,
            @Parameter(description = "카테고리 필터") @RequestParam(required = false) ClubCategory category,
            @Parameter(description = "분류 필터") @RequestParam(required = false) String division,
            @Parameter(description = "이름/설명 키워드") @RequestParam(required = false) String keyword,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "동아리 단건 조회 (ADMIN)",
            description = "상태 무관 동아리 상세 조회. 공개 GET /clubs/{clubId} 와 응답 형태가 동일하지만, ADMIN 권한 가드 하에 PENDING_APPROVAL/REJECTED/INACTIVE 동아리도 조회 가능하다.")
    @GetMapping("/admin/clubs/{clubId}")
    ResponseEntity<ApiResponse<ClubDetailResponse>> getAdminClub(@PathVariable Long clubId);

    @Operation(summary = "동아리 정보 수정 (ADMIN)",
            description = "총동연이 임의 동아리의 기본 정보를 부분 수정한다. 리더 PATCH /clubs/{clubId} 와 동일한 입력·검증을 쓰며, "
                    + "리더 멤버십 대신 ADMIN 권한으로 접근한다. null/미포함 필드는 변경되지 않고, 조회 가능한 모든 상태의 동아리를 수정할 수 있다.")
    @PatchMapping("/admin/clubs/{clubId}")
    ResponseEntity<ApiResponse<ClubDetailResponse>> updateClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubRequest updateClubRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 생성", description = "총동연이 신규 동아리를 등록한다. 기본 상태는 PENDING_APPROVAL.")
    @PostMapping("/admin/clubs")
    ResponseEntity<ApiResponse<Long>> createClub(@Valid @RequestBody CreateClubRequest createClubRequest);

    @Operation(summary = "동아리 상태 변경", description = "운영 상태 변경. REJECTED 전이 시 rejectionReason 필수.")
    @PatchMapping("/admin/clubs/{clubId}/status")
    ResponseEntity<ApiResponse<Void>> updateClubStatus(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubStatusRequest updateClubStatusRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "중앙동아리 토글", description = "ADMIN 이 동아리의 중앙동아리 여부를 변경한다.")
    @PatchMapping("/admin/clubs/{clubId}/central-club")
    ResponseEntity<ApiResponse<Void>> updateClubCentralClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubCentralClubRequest updateClubCentralClubRequest
    );

    @Operation(summary = "동아리 폐쇄",
            description = "운영 중단(INACTIVE) 또는 거절(REJECTED) 동아리를 폐쇄(soft-delete)하고 진행 중인 모집·지원·면접·인증·홍보·멤버십·이벤트·즐겨찾기를 자동 종료한다. "
                    + "요청 본문은 생략 가능하며, 생략하거나 폐쇄 사유가 비어 있으면 기본 사유로 처리된다.")
    @PostMapping("/admin/clubs/{clubId}/close")
    ResponseEntity<ApiResponse<Void>> closeClub(
            @PathVariable Long clubId,
            @Valid @RequestBody(required = false) CloseClubRequest closeClubRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

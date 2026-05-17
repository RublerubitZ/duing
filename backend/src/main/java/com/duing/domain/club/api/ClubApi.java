package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.UpdateClubRequest;
import com.duing.domain.club.controller.dto.response.ClubDetailResponse;
import com.duing.domain.club.controller.dto.response.ClubSummaryResponse;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "동아리", description = "동아리 탐색 (공개)")
public interface ClubApi {

    @Operation(summary = "동아리 목록 조회",
            description = "카테고리·분류·키워드·태그·모집중 필터와 페이지네이션 지원.")
    @GetMapping("/clubs")
    ResponseEntity<ApiResponse<PageResponse<ClubSummaryResponse>>> getClubs(
            @Parameter(description = "카테고리 필터") @RequestParam(required = false) ClubCategory category,
            @Parameter(description = "분류 필터") @RequestParam(required = false) String division,
            @Parameter(description = "이름/설명 키워드") @RequestParam(required = false) String keyword,
            @Parameter(description = "태그 다중 (OR 매칭)") @RequestParam(required = false) List<String> tags,
            @Parameter(description = "오늘 기준 모집중인 동아리만") @RequestParam(required = false) Boolean recruiting,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "동아리 상세 조회")
    @GetMapping("/clubs/{clubId}")
    ResponseEntity<ApiResponse<ClubDetailResponse>> getClub(@PathVariable Long clubId);

    @Operation(summary = "동아리 정보 수정 (LEADER)",
            description = "본인이 LEADER 인 동아리의 기본 정보를 부분 수정한다. null/미포함 필드는 변경되지 않는다.")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}")
    ResponseEntity<ApiResponse<ClubDetailResponse>> updateClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubRequest updateClubRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

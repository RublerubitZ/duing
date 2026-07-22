package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.UpdateClubRequest;
import com.duing.domain.club.controller.dto.response.ClubDetailResponse;
import com.duing.domain.club.controller.dto.response.ClubSummaryResponse;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.service.dto.query.ClubSortOption;
import com.duing.domain.club.service.dto.query.RecruitmentStatusFilter;
import com.duing.domain.user.entity.College;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.DayOfWeek;
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
            @Parameter(description = "deprecated — recruitmentStatus 로 대체. true → AVAILABLE 매핑. false 는 매핑되지 않음(=전체).") @RequestParam(required = false) Boolean recruiting,
            @Parameter(description = "모집 상태 필터 (AVAILABLE / UPCOMING / CLOSED). 미지정 시 전체. recruiting 보다 우선 적용.")
            @RequestParam(required = false) RecruitmentStatusFilter recruitmentStatus,
            @Parameter(description = "true=중앙동아리만, false=학과동아리만, 미지정=전체") @RequestParam(required = false) Boolean centralClub,
            @Parameter(description = "학과동아리의 단과대학 (College enum 코드)") @RequestParam(required = false) College college,
            @Parameter(description = "활동요일 다중 (OR 매칭). 선택 요일 중 하나라도 포함하면 매칭. 미지정/전체 선택 시 필터 미적용.")
            @RequestParam(required = false) List<DayOfWeek> activeDays,
            @Parameter(description = "정렬 옵션 (DEADLINE_SOON / RECENT / ALPHABETICAL / POPULAR). 미지정 시 RECENT. POPULAR 는 활성 모집 지원자수 → 즐겨찾기수 → 활성 모집 시작일.") @RequestParam(required = false) ClubSortOption sort,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "동아리 상세 조회",
            description = "운영 중(ACTIVE) 동아리만 조회할 수 있다. 승인 대기·거절·운영 중단·폐쇄 상태는 404 를 반환한다. "
                    + "대표 연락처(contactPhone)는 공개 범위(contactVisibility)에 따라 노출되며, 비로그인 요청도 허용한다.")
    @GetMapping("/clubs/{clubId}")
    ResponseEntity<ApiResponse<ClubDetailResponse>> getClub(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "동아리 정보 수정 (LEADER)",
            description = "본인이 LEADER 인 동아리의 프로필을 부분 수정한다. null/미포함 필드는 변경되지 않는다. "
                    + "동아리명·카테고리·분과·단과대학은 총동연 전용(PATCH /admin/clubs/{clubId}) — 이 요청으로는 수정할 수 없다.")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}")
    ResponseEntity<ApiResponse<ClubDetailResponse>> updateClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubRequest updateClubRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

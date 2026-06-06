package com.duing.domain.club.controller;

import com.duing.domain.club.api.ClubApi;
import com.duing.domain.club.controller.dto.request.UpdateClubRequest;
import com.duing.domain.club.controller.dto.response.ClubDetailResponse;
import com.duing.domain.club.controller.dto.response.ClubSummaryResponse;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.service.ClubService;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSortOption;
import com.duing.domain.club.service.dto.query.RecruitmentStatusFilter;
import com.duing.domain.user.entity.College;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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
public class ClubController implements ClubApi {

    private final ClubService clubService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<ClubSummaryResponse>>> getClubs(
            @RequestParam(required = false) ClubCategory category,
            @RequestParam(required = false) String division,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) List<String> tags,
            @RequestParam(required = false) Boolean recruiting,
            @RequestParam(required = false) RecruitmentStatusFilter recruitmentStatus,
            @RequestParam(required = false) Boolean centralClub,
            @RequestParam(required = false) College college,
            @RequestParam(required = false) List<DayOfWeek> activeDays,
            @RequestParam(required = false) ClubSortOption sort,
            Pageable pageable
    ) {
        Set<DayOfWeek> activeDaysSet = activeDays == null ? null : Set.copyOf(activeDays);
        ClubSearchCondition condition = new ClubSearchCondition(
                category, division, keyword, tags, recruiting, recruitmentStatus,
                centralClub, college, activeDaysSet, sort);
        Page<ClubSummaryResponse> page = clubService.search(condition, pageable)
                .map(ClubSummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubDetailResponse>> getClub(@PathVariable Long clubId) {
        ClubDetailResponse response = ClubDetailResponse.from(clubService.getById(clubId));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubDetailResponse>> updateClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubRequest updateClubRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubService.update(updateClubRequest.toCommand(clubId, currentUser.id()));
        ClubDetailResponse response = ClubDetailResponse.from(clubService.getById(clubId));
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}

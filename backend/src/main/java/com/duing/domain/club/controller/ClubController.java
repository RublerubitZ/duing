package com.duing.domain.club.controller;

import com.duing.domain.club.api.ClubApi;
import com.duing.domain.club.controller.dto.request.UpdateClubRequest;
import com.duing.domain.club.controller.dto.response.ClubDetailResponse;
import com.duing.domain.club.controller.dto.response.ClubSummaryResponse;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.service.ClubService;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSortOption;
import com.duing.domain.club.service.dto.query.ClubViewer;
import com.duing.domain.club.service.dto.query.RecruitmentStatusFilter;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.UserRole;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.time.DayOfWeek;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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
            @RequestParam(required = false) Boolean favorite,
            @AuthenticationPrincipal UserPrincipal currentUser,
            Pageable pageable
    ) {
        boolean favoriteOnly = Boolean.TRUE.equals(favorite);
        if (favoriteOnly && currentUser == null) {
            // 찜 필터의 기준은 "요청 사용자의 찜" — 비로그인은 기준이 없다. 빈 목록으로 얼버무리면
            // "찜 0건(200)"과 구분이 안 되므로 401 로 구분한다. handleApplicationException 이
            // 401 + 예외 메시지를 그대로 응답에 싣는다 — 새 에러코드(code)는 만들지 않는다.
            throw new ClubException.FavoriteFilterLoginRequiredException();
        }
        Long favoriteUserId = favoriteOnly ? currentUser.id() : null;
        Set<DayOfWeek> activeDaysSet = activeDays == null ? null : Set.copyOf(activeDays);
        ClubSearchCondition condition = new ClubSearchCondition(
                category, division, keyword, tags, recruiting, recruitmentStatus,
                centralClub, college, activeDaysSet, sort, favoriteUserId);
        Page<ClubSummaryResponse> page = clubService.search(condition, pageable)
                .map(ClubSummaryResponse::from);
        // 추천순은 1시간 bucket 단위로만 순서가 바뀌므로 60초 공유 캐시가 순환을 해치지 않는다.
        // favorite=true 는 사용자별 결과라 공유 캐시 금지(no-store) — 사용자 간 결과 오염 방지.
        // ⚠️ cachePublic 은 Authorization 이 붙은 응답의 공유 캐시 저장을 허용한다(RFC 9111) —
        // ClubSummaryResponse 에 사용자별 필드(isFavorited 류)를 추가하는 순간 사용자 간 데이터
        // 오염이 되므로, 그런 필드가 필요해지면 이 캐시 정책부터 함께 바꿔야 한다.
        CacheControl cacheControl = favoriteOnly
                ? CacheControl.noStore()
                : CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic();
        return ResponseEntity.ok()
                .cacheControl(cacheControl)
                .body(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubDetailResponse>> getClub(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ClubDetailResponse response =
                ClubDetailResponse.from(clubService.getActiveById(clubId, toViewer(currentUser)));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubDetailResponse>> updateClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubRequest updateClubRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubService.update(updateClubRequest.toCommand(clubId, currentUser.id()));
        // 리더 본인 재조회 — 임원 게이트를 통과해 대표 연락처가 항상 표시된다.
        ClubDetailResponse response = ClubDetailResponse.from(clubService.getById(clubId, toViewer(currentUser)));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    private static ClubViewer toViewer(UserPrincipal currentUser) {
        if (currentUser == null) return ClubViewer.anonymous();
        return new ClubViewer(currentUser.id(), UserRole.ADMIN.name().equals(currentUser.role()));
    }
}

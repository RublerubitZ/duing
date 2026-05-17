package com.duing.domain.favorite.api;

import com.duing.domain.favorite.controller.dto.response.FavoriteClubResponse;
import com.duing.domain.favorite.controller.dto.response.FavoriteIdsResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

@Tag(name = "찜", description = "동아리 찜 API")
@SecurityRequirement(name = "BearerAuth")
public interface FavoriteApi {

    @Operation(summary = "찜 추가", description = "동아리를 찜 목록에 추가한다. 이미 찜한 경우 409 반환.")
    @PostMapping("/me/favorites/{clubId}")
    ResponseEntity<ApiResponse<Long>> add(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "찜 해제 (멱등)", description = "동아리를 찜 목록에서 제거한다. 찜하지 않은 경우에도 204 반환.")
    @DeleteMapping("/me/favorites/{clubId}")
    ResponseEntity<Void> remove(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "내 찜한 동아리 목록", description = "찜 추가 시각 역순으로 페이지 반환. 진행 중 모집 수 포함.")
    @GetMapping("/me/favorites")
    ResponseEntity<ApiResponse<PageResponse<FavoriteClubResponse>>> getMine(
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "내 찜한 동아리 ID 목록", description = "목록 페이지 하트 표시용 ID 배열.")
    @GetMapping("/me/favorites/ids")
    ResponseEntity<ApiResponse<FavoriteIdsResponse>> getMyIds(
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}
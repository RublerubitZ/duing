package com.duing.domain.favorite.controller;

import com.duing.domain.favorite.api.FavoriteApi;
import com.duing.domain.favorite.controller.dto.response.FavoriteClubResponse;
import com.duing.domain.favorite.controller.dto.response.FavoriteIdsResponse;
import com.duing.domain.favorite.service.ClubFavoriteService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class FavoriteController implements FavoriteApi {

    private final ClubFavoriteService favoriteService;

    @Override
    public ResponseEntity<ApiResponse<Long>> add(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long favoriteId = favoriteService.add(currentUser.id(), clubId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(favoriteId));
    }

    @Override
    public ResponseEntity<Void> remove(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        favoriteService.remove(currentUser.id(), clubId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<FavoriteClubResponse>>> getMine(
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<FavoriteClubResponse> page = favoriteService
                .getMyFavorites(currentUser.id(), pageable)
                .map(FavoriteClubResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<FavoriteIdsResponse>> getMyIds(
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        FavoriteIdsResponse response = new FavoriteIdsResponse(
                favoriteService.getMyFavoriteClubIds(currentUser.id())
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
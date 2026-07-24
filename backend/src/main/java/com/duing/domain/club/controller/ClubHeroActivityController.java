package com.duing.domain.club.controller;

import com.duing.domain.club.api.ClubHeroActivityApi;
import com.duing.domain.club.controller.dto.request.CreateHeroActivityRequest;
import com.duing.domain.club.controller.dto.request.ReorderHeroActivitiesRequest;
import com.duing.domain.club.controller.dto.request.UpdateHeroActivityRequest;
import com.duing.domain.club.controller.dto.response.HeroActivityResponse;
import com.duing.domain.club.heroactivity.service.ClubHeroActivityService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ClubHeroActivityController implements ClubHeroActivityApi {

    private final ClubHeroActivityService clubHeroActivityService;

    @Override
    public ResponseEntity<ApiResponse<List<HeroActivityResponse>>> listHeroActivities(
            @PathVariable Long clubId) {
        List<HeroActivityResponse> heroActivities = clubHeroActivityService.getByClubId(clubId).stream()
                .map(HeroActivityResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(heroActivities));
    }

    @Override
    public ResponseEntity<ApiResponse<HeroActivityResponse>> createHeroActivity(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateHeroActivityRequest createHeroActivityRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        HeroActivityResponse created = HeroActivityResponse.from(clubHeroActivityService.create(
                createHeroActivityRequest.toCommand(clubId, currentUser.id())));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created));
    }

    @Override
    public ResponseEntity<Void> updateHeroActivity(
            @PathVariable Long clubId,
            @PathVariable Long heroActivityId,
            @Valid @RequestBody UpdateHeroActivityRequest updateHeroActivityRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubHeroActivityService.update(
                updateHeroActivityRequest.toCommand(clubId, currentUser.id(), heroActivityId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<List<HeroActivityResponse>>> reorderHeroActivities(
            @PathVariable Long clubId,
            @Valid @RequestBody ReorderHeroActivitiesRequest reorderHeroActivitiesRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<HeroActivityResponse> heroActivities = clubHeroActivityService.reorder(
                reorderHeroActivitiesRequest.toCommand(clubId, currentUser.id())).stream()
                .map(HeroActivityResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(heroActivities));
    }

    @Override
    public ResponseEntity<Void> deleteHeroActivity(
            @PathVariable Long clubId,
            @PathVariable Long heroActivityId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubHeroActivityService.delete(clubId, currentUser.id(), heroActivityId);
        return ResponseEntity.noContent().build();
    }
}

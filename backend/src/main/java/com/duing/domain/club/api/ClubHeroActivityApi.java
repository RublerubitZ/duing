package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.CreateHeroActivityRequest;
import com.duing.domain.club.controller.dto.request.ReorderHeroActivitiesRequest;
import com.duing.domain.club.controller.dto.request.UpdateHeroActivityRequest;
import com.duing.domain.club.controller.dto.response.HeroActivityResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "대표 활동", description = "동아리 대표 활동(활동사진 + 제목/설명)")
public interface ClubHeroActivityApi {

    @Operation(summary = "대표 활동 목록 (공개)",
            description = "displayOrder 오름차순. 운영 중(ACTIVE) 동아리만 조회할 수 있으며, 그 외 상태는 404 를 반환한다.")
    @GetMapping("/clubs/{clubId}/hero-activities")
    ResponseEntity<ApiResponse<List<HeroActivityResponse>>> listHeroActivities(@PathVariable Long clubId);

    @Operation(summary = "대표 활동 등록 (LEADER/OFFICER)",
            description = "운영진이 활동사진을 지정해 제목·설명·슬롯(1~6)과 함께 대표 활동을 등록한다.")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/clubs/{clubId}/hero-activities")
    ResponseEntity<ApiResponse<HeroActivityResponse>> createHeroActivity(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateHeroActivityRequest createHeroActivityRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "대표 활동 수정 (LEADER/OFFICER)",
            description = "사진·제목·설명을 부분 수정한다. 미지정 필드는 변경하지 않는다.")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}/hero-activities/{heroActivityId}")
    ResponseEntity<Void> updateHeroActivity(
            @PathVariable Long clubId,
            @PathVariable Long heroActivityId,
            @Valid @RequestBody UpdateHeroActivityRequest updateHeroActivityRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "대표 활동 일괄 정렬 (LEADER/OFFICER)",
            description = "전체 대표 활동의 새 슬롯을 한번에 보낸다. 페이로드 집합이 현재 대표 활동 집합과 일치해야 한다.")
    @SecurityRequirement(name = "bearerAuth")
    @PutMapping("/clubs/{clubId}/hero-activities/order")
    ResponseEntity<ApiResponse<List<HeroActivityResponse>>> reorderHeroActivities(
            @PathVariable Long clubId,
            @Valid @RequestBody ReorderHeroActivitiesRequest reorderHeroActivitiesRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "대표 활동 삭제 (LEADER/OFFICER)",
            description = "슬롯을 당기지 않고 빈 슬롯으로 유지한다.")
    @SecurityRequirement(name = "bearerAuth")
    @DeleteMapping("/clubs/{clubId}/hero-activities/{heroActivityId}")
    ResponseEntity<Void> deleteHeroActivity(
            @PathVariable Long clubId,
            @PathVariable Long heroActivityId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

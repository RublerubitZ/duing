package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.CreateClubPhotoRequest;
import com.duing.domain.club.controller.dto.request.ReorderClubPhotosRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubPhotoRequest;
import com.duing.domain.club.controller.dto.response.ClubPhotoResponse;
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

@Tag(name = "동아리 사진", description = "동아리 활동사진")
public interface ClubPhotoApi {

    @Operation(summary = "활동사진 목록 (공개)", description = "displayOrder 오름차순.")
    @GetMapping("/clubs/{clubId}/photos")
    ResponseEntity<ApiResponse<List<ClubPhotoResponse>>> listPhotos(@PathVariable Long clubId);

    @Operation(summary = "활동사진 등록 (LEADER/OFFICER)",
            description = "운영진이 storageKey 와 메타데이터를 보내 사진을 등록한다. displayOrder 는 자동 부여.")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/clubs/{clubId}/photos")
    ResponseEntity<ApiResponse<ClubPhotoResponse>> createPhoto(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateClubPhotoRequest createClubPhotoRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "활동사진 캡션 수정 (LEADER/OFFICER)")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}/photos/{photoId}")
    ResponseEntity<Void> updatePhoto(
            @PathVariable Long clubId,
            @PathVariable Long photoId,
            @Valid @RequestBody UpdateClubPhotoRequest updateClubPhotoRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "활동사진 일괄 정렬 (LEADER/OFFICER)",
            description = "전체 사진의 새 displayOrder 를 한번에 보낸다. 페이로드 집합이 현재 사진 집합과 일치해야 한다.")
    @SecurityRequirement(name = "bearerAuth")
    @PutMapping("/clubs/{clubId}/photos/order")
    ResponseEntity<ApiResponse<List<ClubPhotoResponse>>> reorderPhotos(
            @PathVariable Long clubId,
            @Valid @RequestBody ReorderClubPhotosRequest reorderClubPhotosRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "활동사진 삭제 (LEADER/OFFICER)")
    @SecurityRequirement(name = "bearerAuth")
    @DeleteMapping("/clubs/{clubId}/photos/{photoId}")
    ResponseEntity<Void> deletePhoto(
            @PathVariable Long clubId,
            @PathVariable Long photoId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

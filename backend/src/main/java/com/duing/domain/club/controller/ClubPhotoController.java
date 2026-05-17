package com.duing.domain.club.controller;

import com.duing.domain.club.api.ClubPhotoApi;
import com.duing.domain.club.controller.dto.request.CreateClubPhotoRequest;
import com.duing.domain.club.controller.dto.request.ReorderClubPhotosRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubPhotoRequest;
import com.duing.domain.club.controller.dto.response.ClubPhotoResponse;
import com.duing.domain.club.photo.service.ClubPhotoService;
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
public class ClubPhotoController implements ClubPhotoApi {

    private final ClubPhotoService clubPhotoService;

    @Override
    public ResponseEntity<ApiResponse<List<ClubPhotoResponse>>> listPhotos(@PathVariable Long clubId) {
        List<ClubPhotoResponse> photos = clubPhotoService.getPhotosByClubId(clubId).stream()
                .map(ClubPhotoResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(photos));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubPhotoResponse>> createPhoto(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateClubPhotoRequest createClubPhotoRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ClubPhotoResponse created = ClubPhotoResponse.from(clubPhotoService.create(
                createClubPhotoRequest.toCommand(clubId, currentUser.id())));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updatePhoto(
            @PathVariable Long clubId,
            @PathVariable Long photoId,
            @Valid @RequestBody UpdateClubPhotoRequest updateClubPhotoRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubPhotoService.updateCaption(
                updateClubPhotoRequest.toCommand(clubId, currentUser.id(), photoId));
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @Override
    public ResponseEntity<ApiResponse<List<ClubPhotoResponse>>> reorderPhotos(
            @PathVariable Long clubId,
            @Valid @RequestBody ReorderClubPhotosRequest reorderClubPhotosRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<ClubPhotoResponse> photos = clubPhotoService.reorder(
                reorderClubPhotosRequest.toCommand(clubId, currentUser.id())).stream()
                .map(ClubPhotoResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(photos));
    }

    @Override
    public ResponseEntity<Void> deletePhoto(
            @PathVariable Long clubId,
            @PathVariable Long photoId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubPhotoService.delete(clubId, currentUser.id(), photoId);
        return ResponseEntity.noContent().build();
    }
}

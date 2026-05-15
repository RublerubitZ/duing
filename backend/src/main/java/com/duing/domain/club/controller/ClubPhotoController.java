package com.duing.domain.club.controller;

import com.duing.domain.club.api.ClubPhotoApi;
import com.duing.domain.club.controller.dto.response.ClubPhotoResponse;
import com.duing.domain.club.photo.service.ClubPhotoService;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
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
}

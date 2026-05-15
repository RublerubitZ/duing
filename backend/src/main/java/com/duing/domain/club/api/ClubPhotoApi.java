package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.response.ClubPhotoResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "동아리 사진", description = "동아리 활동사진 (공개)")
public interface ClubPhotoApi {

    @Operation(summary = "활동사진 목록", description = "displayOrder 오름차순.")
    @GetMapping("/clubs/{clubId}/photos")
    ResponseEntity<ApiResponse<List<ClubPhotoResponse>>> listPhotos(@PathVariable Long clubId);
}

package com.duing.global.file.controller;

import com.duing.global.auth.UserPrincipal;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.controller.dto.FileUploadResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "File", description = "파일 업로드 API")
@RequestMapping("/api/v1/files")
public interface FileApi {

    @Operation(summary = "파일 업로드", description = "이미지 1건을 업로드하고 저장소 키와 공개 URL 을 반환한다.")
    @SecurityRequirement(name = "BearerAuth")
    @PostMapping(consumes = "multipart/form-data")
    ResponseEntity<ApiResponse<FileUploadResponse>> upload(
            @RequestPart("file") MultipartFile file,
            @RequestParam("purpose") FilePurpose purpose,
            @AuthenticationPrincipal UserPrincipal currentUser);
}
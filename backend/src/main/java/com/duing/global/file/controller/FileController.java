package com.duing.global.file.controller;

import com.duing.global.auth.UserPrincipal;
import com.duing.global.file.FileStorageService;
import com.duing.global.file.FileUploadPolicy;
import com.duing.global.file.FileUploadRateLimiter;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.controller.dto.FileUploadResponse;
import com.duing.global.file.exception.FileException;
import com.duing.global.response.ApiResponse;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController implements FileApi {

    private final FileStorageService fileStorageService;
    private final FileUploadRateLimiter fileUploadRateLimiter;

    @Override
    @PostMapping(consumes = "multipart/form-data")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<FileUploadResponse>> upload(
            @RequestPart("file") MultipartFile file,
            @RequestParam("purpose") FilePurpose purpose,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        fileUploadRateLimiter.assertWithinLimit(currentUser.id(), LocalDateTime.now());
        String contentType = validateAndResolveContentType(file);
        String uploadedUrl = fileStorageService.upload(file, purpose.directory(), contentType);
        FileUploadResponse fileUploadResponse = new FileUploadResponse(uploadedUrl, uploadedUrl);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(fileUploadResponse));
    }

    // 클라이언트가 보낸 Content-Type 헤더는 위조 가능하므로, 선두 바이트(매직 넘버)로 실제 형식을
    // 판별해 허용 목록과 대조한다. 통과한 타입을 저장소에 넘겨 저장 Content-Type·확장자의 기준으로 쓴다.
    private String validateAndResolveContentType(MultipartFile file) {
        if (file.getSize() > FileUploadPolicy.MAX_BYTES) {
            throw new FileException.UploadSizeExceededException();
        }
        String detectedContentType = FileUploadPolicy.detectImageContentType(readHeader(file));
        if (detectedContentType == null
                || !FileUploadPolicy.ALLOWED_MIME_TYPES.contains(detectedContentType)) {
            throw new FileException.UnsupportedFileTypeException();
        }
        return detectedContentType;
    }

    private byte[] readHeader(MultipartFile file) {
        try (InputStream inputStream = file.getInputStream()) {
            return inputStream.readNBytes(12);
        } catch (IOException exception) {
            throw new FileException.UnsupportedFileTypeException();
        }
    }
}

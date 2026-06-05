package com.duing.global.file.controller;

import com.duing.global.file.FileStorageService;
import com.duing.global.file.FileUploadPolicy;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.controller.dto.FileUploadResponse;
import com.duing.global.file.exception.FileException;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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

    @Override
    @PostMapping(consumes = "multipart/form-data")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<FileUploadResponse>> upload(
            @RequestPart("file") MultipartFile file,
            @RequestParam("purpose") FilePurpose purpose) {
        validate(file);
        String uploadedUrl = fileStorageService.upload(file, purpose.directory());
        FileUploadResponse fileUploadResponse = new FileUploadResponse(uploadedUrl, uploadedUrl);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(fileUploadResponse));
    }

    private void validate(MultipartFile file) {
        if (file.getSize() > FileUploadPolicy.MAX_BYTES) {
            throw new FileException.UploadSizeExceededException();
        }
        String contentType = file.getContentType();
        if (contentType == null || contentType.isBlank()
                || !FileUploadPolicy.ALLOWED_MIME_TYPES.contains(contentType)) {
            throw new FileException.UnsupportedFileTypeException();
        }
    }
}

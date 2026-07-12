package com.duing.domain.federation.controller;

import com.duing.domain.federation.api.FederationInquiryApi;
import com.duing.domain.federation.controller.dto.request.CreateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.response.FederationInquiryDetailResponse;
import com.duing.domain.federation.controller.dto.response.FederationInquirySummaryResponse;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.FederationInquiryService;
import com.duing.domain.federation.service.dto.query.FederationInquiryAttachmentDownload;
import com.duing.domain.user.entity.UserRole;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.file.StoredFile;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class FederationInquiryController implements FederationInquiryApi {

    private final FederationInquiryService federationInquiryService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createInquiry(
            @Valid @RequestBody CreateFederationInquiryRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        Long inquiryId = federationInquiryService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(inquiryId));
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<FederationInquirySummaryResponse>>> listMine(
            @RequestParam(required = false) FederationInquiryStatus status,
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        Page<FederationInquirySummaryResponse> page = federationInquiryService
                .listMine(currentUser.id(), status, pageable)
                .map(FederationInquirySummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<FederationInquiryDetailResponse>> getInquiry(
            @PathVariable Long inquiryId, @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success(FederationInquiryDetailResponse.from(
                federationInquiryService.getMine(inquiryId, currentUser.id()))));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateInquiry(
            @PathVariable Long inquiryId,
            @Valid @RequestBody UpdateFederationInquiryRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        federationInquiryService.update(request.toCommand(inquiryId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteInquiry(
            @PathVariable Long inquiryId, @AuthenticationPrincipal UserPrincipal currentUser) {
        federationInquiryService.delete(inquiryId, currentUser.id());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<InputStreamResource> downloadAttachment(
            @PathVariable Long inquiryId, @PathVariable Long attachmentId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        UserRole currentUserRole = UserRole.valueOf(currentUser.role());
        FederationInquiryAttachmentDownload download = federationInquiryService.downloadAttachment(
                inquiryId, attachmentId, currentUser.id(), currentUserRole);
        StoredFile storedFile = download.file();
        try {
            // RFC 5987 filename* — 한글 파일명이 헤더에 그대로 실리면 깨지므로 percent-encoding 한다.
            String encodedFileName =
                    URLEncoder.encode(download.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(storedFile.contentType()))
                    .contentLength(storedFile.contentLength())
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''" + encodedFileName)
                    .header("X-Content-Type-Options", "nosniff")
                    .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                    .body(new InputStreamResource(storedFile.stream()));
        } catch (RuntimeException responseAssemblyFailure) {
            // 응답 조립(Content-Type 파싱 등) 중 실패하면 이미 열린 스토리지 스트림이 Spring 컨버터로
            // 넘어가지 못해 그대로 새므로, 여기서 직접 닫아 보상한 뒤 원래 예외를 그대로 전파한다.
            closeQuietly(storedFile);
            throw responseAssemblyFailure;
        }
    }

    private void closeQuietly(StoredFile storedFile) {
        try {
            storedFile.stream().close();
        } catch (IOException | RuntimeException ignored) {
            // 이미 실패한 응답 조립 경로의 보상 close — 닫기 실패는 무시한다. S3 provider 의 스트림
            // (ResponseInputStream)은 close() 가 커넥션 abort 실패 시 체크 예외가 아닌 SdkException 계열을
            // 던질 수 있어, IOException 만 잡으면 그 예외가 원래 예외(responseAssemblyFailure)를 가리고
            // 대신 전파될 수 있다 — RuntimeException 도 함께 잡아 항상 원래 예외가 rethrow 되도록 한다.
        }
    }
}

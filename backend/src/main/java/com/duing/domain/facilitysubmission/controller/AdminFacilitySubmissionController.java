package com.duing.domain.facilitysubmission.controller;

import com.duing.domain.facilitysubmission.api.AdminFacilitySubmissionApi;
import com.duing.domain.facilitysubmission.controller.dto.request.CreateSubmissionBatchRequest;
import com.duing.domain.facilitysubmission.controller.dto.response.CompleteSubmissionBatchResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.CreateSubmissionBatchResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionBatchDetailResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionBatchSummaryResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionCandidatesResponse;
import com.duing.domain.facilitysubmission.service.FacilitySubmissionQueryService;
import com.duing.domain.facilitysubmission.service.FacilitySubmissionService;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesQuery;
import com.duing.domain.facilitysubmission.service.export.ExportFile;
import com.duing.domain.facilitysubmission.service.export.ExportFormat;
import com.duing.domain.facilitysubmission.service.export.FacilitySubmissionExportService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFacilitySubmissionController implements AdminFacilitySubmissionApi {

    private final FacilitySubmissionService submissionService;
    private final FacilitySubmissionQueryService queryService;
    private final FacilitySubmissionExportService exportService;

    @Override
    public ResponseEntity<ApiResponse<SubmissionCandidatesResponse>> getCandidates(
            Long facilityId, LocalDate startDate, LocalDate endDate, Long clubId) {
        return ResponseEntity.ok(ApiResponse.success(SubmissionCandidatesResponse.from(
                queryService.getCandidates(new SubmissionCandidatesQuery(facilityId, startDate, endDate, clubId)))));
    }

    @Override
    public ResponseEntity<ApiResponse<CreateSubmissionBatchResponse>> create(
            @Valid @RequestBody CreateSubmissionBatchRequest createSubmissionBatchRequest,
            @AuthenticationPrincipal UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(
                CreateSubmissionBatchResponse.from(submissionService.create(
                        createSubmissionBatchRequest.toCommand(),
                        actorFrom(currentUser, httpServletRequest)))));
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<SubmissionBatchSummaryResponse>>> getBatches(
            Long facilityId, Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                queryService.getBatches(facilityId, pageable).map(SubmissionBatchSummaryResponse::from))));
    }

    @Override
    public ResponseEntity<ApiResponse<SubmissionBatchDetailResponse>> getDetail(Long batchId,
            @AuthenticationPrincipal UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        return ResponseEntity.ok(ApiResponse.success(SubmissionBatchDetailResponse.from(
                queryService.getDetail(batchId, actorFrom(currentUser, httpServletRequest)))));
    }

    @Override
    public ResponseEntity<byte[]> downloadCsv(Long batchId,
            @AuthenticationPrincipal UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        ExportFile exportFile = exportService.export(batchId, ExportFormat.CSV,
                actorFrom(currentUser, httpServletRequest));
        // RFC 5987 filename* — 한글 파일명 대비 percent-encoding(첨부 다운로드 선례와 동일).
        String encodedFileName =
                URLEncoder.encode(exportFile.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(exportFile.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedFileName)
                .header("X-Content-Type-Options", "nosniff")
                .body(exportFile.content());
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> cancel(Long batchId,
            @AuthenticationPrincipal UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        submissionService.cancel(batchId, actorFrom(currentUser, httpServletRequest));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<CompleteSubmissionBatchResponse>> complete(Long batchId,
            @AuthenticationPrincipal UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        return ResponseEntity.ok(ApiResponse.success(CompleteSubmissionBatchResponse.from(
                submissionService.complete(batchId, actorFrom(currentUser, httpServletRequest)))));
    }

    private SubmissionActorContext actorFrom(UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        return new SubmissionActorContext(currentUser.id(),
                httpServletRequest.getRemoteAddr(), httpServletRequest.getHeader("User-Agent"));
    }
}

package com.duing.domain.facilitysubmission.api;

import com.duing.domain.facilitysubmission.controller.dto.request.CreateSubmissionBatchRequest;
import com.duing.domain.facilitysubmission.controller.dto.response.CompleteSubmissionBatchResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.CreateSubmissionBatchResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionBatchDetailResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionBatchSummaryResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionCandidatesResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.LocalDate;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "시설 대관 학교 제출(총동연)", description = "APPROVED 예약의 학교 제출 Batch 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFacilitySubmissionApi {

    @Operation(summary = "제출 대상 조회", description = "기간 내 전체 예약(REJECTED 제외) + submitted/selectable 파생 + Summary 4종. 기간 최대 31일.")
    @GetMapping("/admin/facility-bookings/submission/candidates")
    ResponseEntity<ApiResponse<SubmissionCandidatesResponse>> getCandidates(
            @Parameter(description = "시설(필수)") @RequestParam Long facilityId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @Parameter(description = "동아리 필터") @RequestParam(required = false) Long clubId);

    @Operation(summary = "제출 Batch 생성", description = "all-or-nothing — 미APPROVED·기제출 예약이 섞이면 409 로 전체 거부.")
    @PostMapping("/admin/facility-bookings/submission")
    ResponseEntity<ApiResponse<CreateSubmissionBatchResponse>> create(
            @Valid @RequestBody CreateSubmissionBatchRequest createSubmissionBatchRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) HttpServletRequest httpServletRequest);

    @Operation(summary = "제출 이력", description = "취소된 Batch 포함 최신순 페이지네이션.")
    @GetMapping("/admin/facility-bookings/submission")
    ResponseEntity<ApiResponse<PageResponse<SubmissionBatchSummaryResponse>>> getBatches(
            @Parameter(description = "시설 필터") @RequestParam(required = false) Long facilityId,
            @Parameter(hidden = true) Pageable pageable);

    @Operation(summary = "Batch 상세", description = "취소된 Batch 도 조회 가능. 조회 감사(VIEWED)를 남긴다.")
    @GetMapping("/admin/facility-bookings/submission/{batchId}")
    ResponseEntity<ApiResponse<SubmissionBatchDetailResponse>> getDetail(@PathVariable Long batchId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) HttpServletRequest httpServletRequest);

    @Operation(summary = "CSV 다운로드", description = "UTF-8 BOM Excel 호환. 취소된 Batch 도 이력 확인용 재다운로드 허용.")
    @GetMapping("/admin/facility-bookings/submission/{batchId}/csv")
    ResponseEntity<byte[]> downloadCsv(@PathVariable Long batchId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) HttpServletRequest httpServletRequest);

    @Operation(summary = "제출 취소", description = "cancelled 상태 전환(완전 삭제 없음). 기취소 409.")
    @DeleteMapping("/admin/facility-bookings/submission/{batchId}")
    ResponseEntity<ApiResponse<Void>> cancel(@PathVariable Long batchId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) HttpServletRequest httpServletRequest);

    @Operation(summary = "학교 제출 완료 처리", description = "담당자가 실제 학교 제출을 마친 뒤 호출(§4.3). "
            + "APPROVED 예약만 CONFIRMED 로 전이하고 상태가 변한 예약은 제외 목록으로 반환한다. 기취소·기완료 409.")
    @PostMapping("/admin/facility-bookings/submission/{batchId}/complete")
    ResponseEntity<ApiResponse<CompleteSubmissionBatchResponse>> complete(@PathVariable Long batchId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) HttpServletRequest httpServletRequest);
}

package com.duing.domain.cashbook.api;

import com.duing.domain.cashbook.controller.dto.request.CreateCashbookEntryRequest;
import com.duing.domain.cashbook.controller.dto.request.UpdateCashbookEntryRequest;
import com.duing.domain.cashbook.controller.dto.response.CashbookEntryResponse;
import com.duing.domain.cashbook.controller.dto.response.CashbookSummaryResponse;
import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "금전출납부 (운영진)", description = "LEADER/OFFICER 동아리 회계 장부(수입·지출)")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderCashbookApi {

    @Operation(summary = "장부 조회 (LEADER/OFFICER)",
            description = "수입/지출 유형·카테고리·기간·검색어로 거래일 역순 조회한다.")
    @GetMapping("/leader/clubs/{clubId}/cashbook")
    ResponseEntity<ApiResponse<PageResponse<CashbookEntryResponse>>> getEntries(
            @PathVariable Long clubId,
            @RequestParam(required = false) CashbookEntryType entryType,
            @RequestParam(required = false) CashbookCategory categoryCode,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String keyword,
            Pageable pageable,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "장부 요약 (LEADER/OFFICER)",
            description = "현재 필터 기준 총수입·총지출·장부 잔액(수입−지출). 실제 계좌 잔액과 다를 수 있다.")
    @GetMapping("/leader/clubs/{clubId}/cashbook/summary")
    ResponseEntity<ApiResponse<CashbookSummaryResponse>> getSummary(
            @PathVariable Long clubId,
            @RequestParam(required = false) CashbookEntryType entryType,
            @RequestParam(required = false) CashbookCategory categoryCode,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String keyword,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "장부 항목 등록 (LEADER/OFFICER)")
    @PostMapping("/leader/clubs/{clubId}/cashbook")
    ResponseEntity<ApiResponse<Long>> create(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateCashbookEntryRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "장부 항목 수정 (LEADER/OFFICER)",
            description = "수동 항목은 전체 수정(유형 제외). BANK 자동 항목은 카테고리·메모만 수정 가능.")
    @PatchMapping("/leader/clubs/{clubId}/cashbook/{entryId}")
    ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long clubId,
            @PathVariable Long entryId,
            @Valid @RequestBody UpdateCashbookEntryRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "장부 항목 삭제 (LEADER/OFFICER)",
            description = "수동 항목만 삭제 가능. BANK 자동 항목은 409.")
    @DeleteMapping("/leader/clubs/{clubId}/cashbook/{entryId}")
    ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable Long clubId,
            @PathVariable Long entryId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

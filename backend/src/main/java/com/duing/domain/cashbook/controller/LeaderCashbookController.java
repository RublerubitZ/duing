package com.duing.domain.cashbook.controller;

import com.duing.domain.cashbook.api.LeaderCashbookApi;
import com.duing.domain.cashbook.controller.dto.request.CreateCashbookEntryRequest;
import com.duing.domain.cashbook.controller.dto.request.UpdateCashbookEntryRequest;
import com.duing.domain.cashbook.controller.dto.request.UpdateCashbookExclusionRequest;
import com.duing.domain.cashbook.controller.dto.response.CashbookEntryResponse;
import com.duing.domain.cashbook.controller.dto.response.CashbookSummaryResponse;
import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import com.duing.domain.cashbook.service.CashbookService;
import com.duing.domain.cashbook.service.dto.query.CashbookSearchQuery;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
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
public class LeaderCashbookController implements LeaderCashbookApi {

    private final CashbookService cashbookService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<CashbookEntryResponse>>> getEntries(
            @PathVariable Long clubId,
            @RequestParam(required = false) CashbookEntryType entryType,
            @RequestParam(required = false) CashbookCategory categoryCode,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Boolean hideExcluded,
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<CashbookEntryResponse> entries = cashbookService.getEntries(
                clubId, currentUser.id(),
                new CashbookSearchQuery(entryType, categoryCode, from, to, keyword, hideExcluded), pageable);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(entries)));
    }

    @Override
    public ResponseEntity<ApiResponse<CashbookSummaryResponse>> getSummary(
            @PathVariable Long clubId,
            @RequestParam(required = false) CashbookEntryType entryType,
            @RequestParam(required = false) CashbookCategory categoryCode,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String keyword,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        CashbookSummaryResponse summary = cashbookService.getSummary(
                clubId, currentUser.id(),
                new CashbookSearchQuery(entryType, categoryCode, from, to, keyword, null));
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> create(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateCashbookEntryRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long entryId = cashbookService.create(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(entryId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long clubId,
            @PathVariable Long entryId,
            @Valid @RequestBody UpdateCashbookEntryRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        cashbookService.update(request.toCommand(clubId, currentUser.id(), entryId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable Long clubId,
            @PathVariable Long entryId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        cashbookService.delete(clubId, currentUser.id(), entryId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> setExclusion(
            @PathVariable Long clubId,
            @PathVariable Long entryId,
            @Valid @RequestBody UpdateCashbookExclusionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        cashbookService.setExclusion(clubId, currentUser.id(), entryId, request.excluded());
        return ResponseEntity.noContent().build();
    }
}

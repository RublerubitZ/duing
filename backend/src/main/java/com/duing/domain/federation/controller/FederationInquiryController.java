package com.duing.domain.federation.controller;

import com.duing.domain.federation.api.FederationInquiryApi;
import com.duing.domain.federation.controller.dto.request.CreateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.response.FederationInquiryDetailResponse;
import com.duing.domain.federation.controller.dto.response.FederationInquirySummaryResponse;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.FederationInquiryService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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
}

package com.duing.domain.club.controller;

import com.duing.domain.club.api.AdminRecertificationRequestApi;
import com.duing.domain.club.controller.dto.request.ProcessRecertificationRequest;
import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestDetailResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestSummaryResponse;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.service.RecertificationRequestService;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
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
public class AdminRecertificationRequestController implements AdminRecertificationRequestApi {

    private final RecertificationRequestService requestService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<RecertificationRequestSummaryResponse>>> listRequests(
            Long roundId, RecertificationStatus status, Pageable pageable
    ) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                requestService.listForAdmin(new RecertificationAdminSearchCondition(roundId, status), pageable)
                        .map(RecertificationRequestSummaryResponse::from)
        )));
    }

    @Override
    public ResponseEntity<ApiResponse<RecertificationRequestDetailResponse>> getRequest(Long requestId) {
        return ResponseEntity.ok(ApiResponse.success(
                RecertificationRequestDetailResponse.from(requestService.getDetailForAdmin(requestId))
        ));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processRequest(
            Long requestId, @Valid @RequestBody ProcessRecertificationRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        requestService.process(request.toCommand(requestId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<CentralClubRecertificationStatusResponse>>> listClubStatuses(
            int operatingYear, Pageable pageable
    ) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                requestService.findCentralClubStatuses(new CentralClubRecertificationStatusQuery(operatingYear), pageable)
        )));
    }
}

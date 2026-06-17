package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.AdminBankMatchingApi;
import com.duing.domain.fee.controller.dto.request.UpdateBankMatchingRequest;
import com.duing.domain.fee.controller.dto.response.BankMatchingOverviewResponse;
import com.duing.domain.fee.service.BankMatchingAdminService;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminBankMatchingController implements AdminBankMatchingApi {

    private final BankMatchingAdminService bankMatchingAdminService;

    @Override
    public ResponseEntity<Void> updateBankMatching(
            @PathVariable Long clubId, @Valid @RequestBody UpdateBankMatchingRequest request
    ) {
        bankMatchingAdminService.setActive(clubId, request.active());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<BankMatchingOverviewResponse>> getBankMatchingOverview() {
        BankMatchingOverviewResponse response =
                BankMatchingOverviewResponse.from(bankMatchingAdminService.getMatchingClubs());
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}

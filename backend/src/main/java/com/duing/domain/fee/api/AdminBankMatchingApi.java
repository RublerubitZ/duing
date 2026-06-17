package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.request.UpdateBankMatchingRequest;
import com.duing.domain.fee.controller.dto.response.BankMatchingOverviewResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "BANK 자동매칭(총동연)", description = "총동연 전용 동아리별 BANK 자동매칭 허용/해제 및 현황 조회")
@SecurityRequirement(name = "BearerAuth")
public interface AdminBankMatchingApi {

    @Operation(summary = "동아리 BANK 자동매칭 허용/해제",
            description = "외부 BANK API 등록/해제를 먼저 수행하고 성공 시에만 설정을 반영한다(원자성).")
    @PutMapping("/admin/clubs/{clubId}/bank-matching")
    ResponseEntity<Void> updateBankMatching(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateBankMatchingRequest request
    );

    @Operation(summary = "BANK 자동매칭 현황 조회",
            description = "회비 계좌가 등록된 동아리들의 적격·등록 상태와 인증 키 전역 슬롯 현황을 반환한다.")
    @GetMapping("/admin/clubs/bank-matching")
    ResponseEntity<ApiResponse<BankMatchingOverviewResponse>> getBankMatchingOverview();
}

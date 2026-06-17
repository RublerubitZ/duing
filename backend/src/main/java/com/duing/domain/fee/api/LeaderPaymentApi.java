package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.request.RecordPaymentRequest;
import com.duing.domain.fee.controller.dto.request.VoidPaymentRequest;
import com.duing.domain.fee.controller.dto.response.PaymentResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "회비 납부 (운영진)", description = "LEADER/OFFICER 회비 납부 기록·정정·내역")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderPaymentApi {

    @Operation(summary = "회비 납부 기록 (LEADER/OFFICER)",
            description = "청구 1건에 대한 납부를 기록한다. 분할 입금 시 여러 번 호출하며, 합계로 청구 상태가 재계산된다.")
    @PostMapping("/leader/clubs/{clubId}/fee-bills/{billId}/payments")
    ResponseEntity<ApiResponse<Long>> record(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @Valid @RequestBody RecordPaymentRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 납부 내역 조회 (LEADER/OFFICER)",
            description = "청구의 납부 내역을 기록순으로 조회한다. 정정(VOID)된 기록도 이력 보존을 위해 함께 노출된다.")
    @GetMapping("/leader/clubs/{clubId}/fee-bills/{billId}/payments")
    ResponseEntity<ApiResponse<List<PaymentResponse>>> getPayments(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 납부 정정/취소 (LEADER/OFFICER, 멱등)",
            description = "납부 기록을 무효화(VOID)한다. 합계·청구 상태가 재계산되며, 기록 자체는 이력으로 보존된다.")
    @PostMapping("/leader/clubs/{clubId}/fee-bills/{billId}/payments/{paymentId}/void")
    ResponseEntity<ApiResponse<Void>> voidPayment(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @PathVariable Long paymentId,
            @Valid @RequestBody VoidPaymentRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

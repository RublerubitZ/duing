package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.LeaderPaymentApi;
import com.duing.domain.fee.controller.dto.request.RecordPaymentRequest;
import com.duing.domain.fee.controller.dto.request.VoidPaymentRequest;
import com.duing.domain.fee.controller.dto.response.PaymentResponse;
import com.duing.domain.fee.service.PaymentService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class LeaderPaymentController implements LeaderPaymentApi {

    private final PaymentService paymentService;

    @Override
    public ResponseEntity<ApiResponse<Long>> record(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @Valid @RequestBody RecordPaymentRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long paymentId = paymentService.record(request.toCommand(clubId, currentUser.id(), billId));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(paymentId));
    }

    @Override
    public ResponseEntity<ApiResponse<List<PaymentResponse>>> getPayments(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<PaymentResponse> payments = paymentService.getPayments(clubId, currentUser.id(), billId).stream()
                .map(PaymentResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(payments));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> voidPayment(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @PathVariable Long paymentId,
            @Valid @RequestBody VoidPaymentRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        paymentService.voidPayment(request.toCommand(clubId, currentUser.id(), billId, paymentId));
        return ResponseEntity.noContent().build();
    }
}

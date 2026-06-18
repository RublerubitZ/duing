package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.MyFeeApi;
import com.duing.domain.fee.controller.dto.response.MyFeeResponse;
import com.duing.domain.fee.controller.dto.response.ReceiptResponse;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.service.MyFeeService;
import com.duing.domain.fee.service.ReceiptService;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class MyFeeController implements MyFeeApi {

    private final MyFeeService myFeeService;
    private final ReceiptService receiptService;

    @Override
    public ResponseEntity<ApiResponse<List<MyFeeResponse>>> getMyFees(
            @RequestParam(required = false) Long clubId,
            @RequestParam(required = false) FeeStatus status,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<MyFeeResponse> fees = myFeeService.getMyFees(
                currentUser.id(), new MyFeeSearchQuery(clubId, status));
        return ResponseEntity.ok(ApiResponse.success(fees));
    }

    @Override
    public ResponseEntity<ApiResponse<ReceiptResponse>> getMyReceipt(
            @PathVariable Long billId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ReceiptResponse receipt = receiptService.getMemberReceipt(currentUser.id(), billId);
        return ResponseEntity.ok(ApiResponse.success(receipt));
    }
}

package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.response.MyFeeResponse;
import com.duing.domain.fee.controller.dto.response.ReceiptResponse;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "내 회비", description = "회원 본인 회비 청구 조회")
@SecurityRequirement(name = "BearerAuth")
public interface MyFeeApi {

    @Operation(summary = "내 회비 청구 조회",
            description = "로그인 회원 본인(currentUser.id())의 청구만 반환한다. clubId·status 는 옵션 필터.")
    @GetMapping("/my/fees")
    ResponseEntity<ApiResponse<List<MyFeeResponse>>> getMyFees(
            @RequestParam(required = false) Long clubId,
            @RequestParam(required = false) FeeStatus status,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "내 회비 영수증 조회",
            description = "본인 청구의 영수증 데이터를 반환한다. ACTIVE 납부가 없거나 취소된 청구는 404.")
    @GetMapping("/my/fees/{billId}/receipt")
    ResponseEntity<ApiResponse<ReceiptResponse>> getMyReceipt(
            @PathVariable Long billId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

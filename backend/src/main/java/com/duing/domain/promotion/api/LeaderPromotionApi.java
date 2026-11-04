package com.duing.domain.promotion.api;

import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequestRequest;
import com.duing.domain.promotion.controller.dto.response.LatestPromotionRequestResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "홍보 요청", description = "LEADER/OFFICER 의 홍보 요청 제출·최근 요청 조회 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderPromotionApi {

    @Operation(summary = "홍보 요청 제출 (LEADER/OFFICER)",
            description = "본인이 운영진(LEADER/OFFICER)인 동아리에 한해 ADMIN 에게 홍보 요청을 제출한다.")
    @PostMapping("/clubs/{clubId}/promotion-requests")
    ResponseEntity<ApiResponse<Long>> createRequest(
            @PathVariable Long clubId,
            @Valid @RequestBody CreatePromotionRequestRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "최근 홍보 요청 조회 (LEADER/OFFICER)",
            description = "이 동아리의 가장 최근 홍보 요청 1건과 총동연 처리 결과(상태·처리 메모·처리 시각)를"
                    + " 운영진 전원에게 보여 준다. 처리자는 내보내지 않는다. 요청이 없으면 200 + data null.")
    @GetMapping("/clubs/{clubId}/promotion-requests/latest")
    ResponseEntity<ApiResponse<LatestPromotionRequestResponse>> getLatestRequest(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

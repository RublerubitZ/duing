package com.duing.domain.promotion.api;

import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequestRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "홍보 요청", description = "LEADER/OFFICER 의 홍보 요청 제출 API")
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
}

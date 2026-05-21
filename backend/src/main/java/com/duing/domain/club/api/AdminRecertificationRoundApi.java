package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.CreateRecertificationRoundRequest;
import com.duing.domain.club.controller.dto.response.RecertificationRoundResponse;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "재인증 라운드(총동연)", description = "총동연 전용 재인증 라운드 라이프사이클")
@SecurityRequirement(name = "BearerAuth")
public interface AdminRecertificationRoundApi {

    @Operation(summary = "라운드 열기")
    @PostMapping("/admin/recertification-rounds")
    ResponseEntity<ApiResponse<Long>> openRound(
            @Valid @RequestBody CreateRecertificationRoundRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "라운드 닫기")
    @PatchMapping("/admin/recertification-rounds/{roundId}/close")
    ResponseEntity<ApiResponse<Void>> closeRound(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "라운드 목록")
    @GetMapping("/admin/recertification-rounds")
    ResponseEntity<ApiResponse<PageResponse<RecertificationRoundResponse>>> listRounds(
            @RequestParam(required = false) RoundStatus status,
            @Parameter(hidden = true) Pageable pageable
    );
}

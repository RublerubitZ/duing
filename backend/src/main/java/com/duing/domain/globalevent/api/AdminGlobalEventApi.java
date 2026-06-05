package com.duing.domain.globalevent.api;

import com.duing.domain.globalevent.controller.dto.request.CreateGlobalEventRequest;
import com.duing.domain.globalevent.controller.dto.request.UpdateGlobalEventRequest;
import com.duing.domain.globalevent.controller.dto.response.AdminGlobalEventDetailResponse;
import com.duing.domain.globalevent.controller.dto.response.AdminGlobalEventSummaryResponse;
import com.duing.domain.globalevent.controller.dto.response.GlobalEventCategoryStatsResponse;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "글로벌 이벤트 (어드민)")
@SecurityRequirement(name = "BearerAuth")
public interface AdminGlobalEventApi {

    @Operation(summary = "어드민 목록 (ADMIN)")
    @GetMapping("/admin/global-events")
    ResponseEntity<ApiResponse<PageResponse<AdminGlobalEventSummaryResponse>>> list(
            @RequestParam(required = false) GlobalEventCategory category,
            @RequestParam(required = false) String keyword,
            @ParameterObject Pageable pageable
    );

    @Operation(summary = "카테고리 분포 통계 (ADMIN)")
    @GetMapping("/admin/global-events/category-stats")
    ResponseEntity<ApiResponse<GlobalEventCategoryStatsResponse>> categoryStats();

    @Operation(summary = "어드민 상세 (ADMIN)")
    @GetMapping("/admin/global-events/{eventId}")
    ResponseEntity<ApiResponse<AdminGlobalEventDetailResponse>> getDetail(@PathVariable Long eventId);

    @Operation(summary = "글로벌 이벤트 생성 (ADMIN)")
    @PostMapping("/admin/global-events")
    ResponseEntity<ApiResponse<Long>> create(
            @Valid @RequestBody CreateGlobalEventRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "글로벌 이벤트 수정 (ADMIN)")
    @PatchMapping("/admin/global-events/{eventId}")
    ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long eventId,
            @Valid @RequestBody UpdateGlobalEventRequest request
    );

    @Operation(summary = "글로벌 이벤트 삭제 (ADMIN)")
    @DeleteMapping("/admin/global-events/{eventId}")
    ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long eventId);
}

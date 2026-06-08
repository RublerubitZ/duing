package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.request.CreateInterviewSlotsRequest;
import com.duing.domain.interview.controller.dto.response.CreateInterviewSlotsResponse;
import com.duing.domain.interview.service.dto.query.SlotListView;
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
import org.springframework.web.bind.annotation.RequestMapping;

@Tag(name = "운영진 면접 슬롯", description = "운영진 면접 슬롯 생성 및 조회")
@SecurityRequirement(name = "BearerAuth")
@RequestMapping("/api/v1/recruitments/{recruitmentId}/interview-slots")
public interface ManagerInterviewSlotApi {

    @Operation(summary = "면접 슬롯 일괄 생성")
    @PostMapping
    ResponseEntity<ApiResponse<CreateInterviewSlotsResponse>> createBulk(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateInterviewSlotsRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "면접 슬롯 목록 조회")
    @GetMapping
    ResponseEntity<ApiResponse<List<SlotListView>>> listSlots(
            @PathVariable Long recruitmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

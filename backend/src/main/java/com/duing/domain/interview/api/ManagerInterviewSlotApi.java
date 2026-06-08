package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.request.CreateInterviewSlotsRequest;
import com.duing.domain.interview.controller.dto.request.UpdateInterviewSlotRequest;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;

@Tag(name = "운영진 면접 슬롯", description = "운영진 면접 슬롯 생성, 조회, 수정 및 삭제")
@SecurityRequirement(name = "BearerAuth")
@RequestMapping("/api/v1")
public interface ManagerInterviewSlotApi {

    @Operation(summary = "면접 슬롯 일괄 생성")
    @PostMapping("/recruitments/{recruitmentId}/interview-slots")
    ResponseEntity<ApiResponse<CreateInterviewSlotsResponse>> createBulk(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateInterviewSlotsRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "면접 슬롯 목록 조회")
    @GetMapping("/recruitments/{recruitmentId}/interview-slots")
    ResponseEntity<ApiResponse<List<SlotListView>>> listSlots(
            @PathVariable Long recruitmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "면접 슬롯 수정")
    @PatchMapping("/interview-slots/{slotId}")
    ResponseEntity<ApiResponse<Void>> updateSlot(
            @PathVariable Long slotId,
            @Valid @RequestBody UpdateInterviewSlotRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "면접 슬롯 삭제")
    @DeleteMapping("/interview-slots/{slotId}")
    ResponseEntity<ApiResponse<Void>> deleteSlot(
            @PathVariable Long slotId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

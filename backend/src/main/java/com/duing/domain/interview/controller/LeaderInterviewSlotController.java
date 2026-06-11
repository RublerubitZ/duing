package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.LeaderInterviewSlotApi;
import com.duing.domain.interview.controller.dto.request.CreateInterviewSlotsRequest;
import com.duing.domain.interview.controller.dto.request.UpdateInterviewSlotRequest;
import com.duing.domain.interview.controller.dto.response.CreateInterviewSlotsResponse;
import com.duing.domain.interview.service.InterviewSlotService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
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
public class LeaderInterviewSlotController implements LeaderInterviewSlotApi {

    private final InterviewSlotService interviewSlotService;

    @Override
    public ResponseEntity<ApiResponse<CreateInterviewSlotsResponse>> createSlots(
            @PathVariable Long roundId,
            @Valid @RequestBody CreateInterviewSlotsRequest createInterviewSlotsRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        CreateInterviewSlotsResponse response = interviewSlotService.createSlots(
                createInterviewSlotsRequest.toCommand(roundId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateSlot(
            @PathVariable Long slotId,
            @Valid @RequestBody UpdateInterviewSlotRequest updateInterviewSlotRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewSlotService.updateSlot(updateInterviewSlotRequest.toCommand(slotId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteSlot(
            @PathVariable Long slotId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewSlotService.deleteSlot(slotId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}

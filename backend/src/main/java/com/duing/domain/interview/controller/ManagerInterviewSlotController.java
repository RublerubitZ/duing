package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.ManagerInterviewSlotApi;
import com.duing.domain.interview.controller.dto.request.CreateInterviewSlotsRequest;
import com.duing.domain.interview.controller.dto.request.UpdateInterviewSlotRequest;
import com.duing.domain.interview.controller.dto.response.CreateInterviewSlotsResponse;
import com.duing.domain.interview.service.InterviewSlotService;
import com.duing.domain.interview.service.dto.query.SlotListView;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ManagerInterviewSlotController implements ManagerInterviewSlotApi {

    private final InterviewSlotService interviewSlotService;

    @Override
    public ResponseEntity<ApiResponse<CreateInterviewSlotsResponse>> createBulk(
            Long recruitmentId,
            CreateInterviewSlotsRequest request,
            UserPrincipal currentUser
    ) {
        List<Long> slotIds = interviewSlotService.createBulk(
                request.toCommand(recruitmentId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(new CreateInterviewSlotsResponse(slotIds)));
    }

    @Override
    public ResponseEntity<ApiResponse<List<SlotListView>>> listSlots(
            Long recruitmentId,
            UserPrincipal currentUser
    ) {
        List<SlotListView> slotListViews = interviewSlotService.listByRecruitment(
                recruitmentId, currentUser.id());
        return ResponseEntity.ok(ApiResponse.success(slotListViews));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateSlot(
            Long slotId,
            UpdateInterviewSlotRequest request,
            UserPrincipal currentUser
    ) {
        interviewSlotService.update(request.toCommand(slotId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteSlot(
            Long slotId,
            UserPrincipal currentUser
    ) {
        interviewSlotService.delete(slotId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}

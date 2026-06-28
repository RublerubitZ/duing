package com.duing.domain.clubevent.controller;

import com.duing.domain.clubevent.api.ClubEventWriteApi;
import com.duing.domain.clubevent.controller.dto.request.CreateClubEventRequest;
import com.duing.domain.clubevent.controller.dto.request.UpdateClubEventRequest;
import com.duing.domain.clubevent.service.ClubEventService;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ClubEventWriteController implements ClubEventWriteApi {

    private final ClubEventService eventService;
    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<Long>> create(
            Long clubId, CreateClubEventRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireManager(currentUser.id(), clubId);
        Long eventId = eventService.create(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(eventId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> update(
            Long clubId, Long eventId, UpdateClubEventRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireManager(currentUser.id(), clubId);
        eventService.update(request.toCommand(clubId, eventId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> delete(
            Long clubId, Long eventId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireManager(currentUser.id(), clubId);
        eventService.delete(clubId, eventId);
        return ResponseEntity.noContent().build();
    }
}

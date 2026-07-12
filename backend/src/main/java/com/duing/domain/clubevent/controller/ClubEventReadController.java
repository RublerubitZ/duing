package com.duing.domain.clubevent.controller;

import com.duing.domain.clubevent.api.ClubEventReadApi;
import com.duing.domain.clubevent.controller.dto.response.ClubEventCardResponse;
import com.duing.domain.clubevent.controller.dto.response.ClubEventDetailResponse;
import com.duing.domain.clubevent.service.ClubEventService;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ClubEventReadController implements ClubEventReadApi {

    private final ClubEventService eventService;
    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<List<ClubEventCardResponse>>> listWindow(
            Long clubId, LocalDate from, LocalDate to,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireActiveMember(currentUser.id(), clubId);
        return ResponseEntity.ok(ApiResponse.success(eventService.listWindow(clubId, from, to)));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubEventDetailResponse>> getDetail(
            Long clubId, Long eventId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireActiveMember(currentUser.id(), clubId);
        return ResponseEntity.ok(ApiResponse.success(eventService.getDetail(clubId, eventId)));
    }
}

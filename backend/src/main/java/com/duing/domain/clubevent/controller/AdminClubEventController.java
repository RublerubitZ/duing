package com.duing.domain.clubevent.controller;

import com.duing.domain.clubevent.api.AdminClubEventApi;
import com.duing.domain.clubevent.controller.dto.response.AdminClubEventCardResponse;
import com.duing.domain.clubevent.service.ClubEventService;
import com.duing.global.response.ApiResponse;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminClubEventController implements AdminClubEventApi {

    private final ClubEventService eventService;

    @Override
    public ResponseEntity<ApiResponse<List<AdminClubEventCardResponse>>> listWindowForAdmin(
            LocalDate from, LocalDate to
    ) {
        return ResponseEntity.ok(ApiResponse.success(eventService.listWindowForAdmin(from, to)));
    }
}

package com.duing.domain.club.controller;

import com.duing.domain.club.api.AdminClubApi;
import com.duing.domain.club.controller.dto.request.CreateClubRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubStatusRequest;
import com.duing.domain.club.service.ClubService;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminClubController implements AdminClubApi {

    private final ClubService clubService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createClub(@Valid @RequestBody CreateClubRequest createClubRequest) {
        Long clubId = clubService.create(createClubRequest.toCommand());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(clubId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateClubStatus(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubStatusRequest updateClubStatusRequest
    ) {
        clubService.updateStatus(updateClubStatusRequest.toCommand(clubId));
        return ResponseEntity.noContent().build();
    }
}

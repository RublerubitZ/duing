package com.duing.domain.club.controller;

import com.duing.domain.club.api.AdminRecertificationRoundApi;
import com.duing.domain.club.controller.dto.request.CreateRecertificationRoundRequest;
import com.duing.domain.club.controller.dto.response.RecertificationRoundResponse;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.service.RecertificationRoundService;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminRecertificationRoundController implements AdminRecertificationRoundApi {

    private final RecertificationRoundService roundService;

    @Override
    public ResponseEntity<ApiResponse<Long>> openRound(
            @Valid @RequestBody CreateRecertificationRoundRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long roundId = roundService.open(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(roundId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> closeRound(
            Long roundId, @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        roundService.close(new CloseRoundCommand(roundId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<RecertificationRoundResponse>>> listRounds(
            RoundStatus status, Pageable pageable
    ) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                roundService.listForAdmin(new RoundAdminSearchCondition(status), pageable)
                        .map(RecertificationRoundResponse::from)
        )));
    }
}

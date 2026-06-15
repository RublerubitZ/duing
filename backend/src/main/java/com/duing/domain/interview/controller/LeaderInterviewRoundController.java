package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.LeaderInterviewRoundApi;
import com.duing.domain.interview.controller.dto.request.CreateInterviewRoundRequest;
import com.duing.domain.interview.controller.dto.request.UpdateInterviewRoundRequest;
import com.duing.domain.interview.controller.dto.response.AvailabilityRequestResponse;
import com.duing.domain.interview.controller.dto.response.CreateInterviewRoundResponse;
import com.duing.domain.interview.controller.dto.response.RoundCandidateResponse;
import com.duing.domain.interview.controller.dto.response.RoundDetailResponse;
import com.duing.domain.interview.controller.dto.response.RoundSummaryResponse;
import com.duing.domain.interview.service.InterviewRoundService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class LeaderInterviewRoundController implements LeaderInterviewRoundApi {

    private final InterviewRoundService interviewRoundService;

    @Override
    public ResponseEntity<ApiResponse<List<RoundCandidateResponse>>> getRoundCandidates(
            @PathVariable Long recruitmentId,
            @RequestParam(required = false, defaultValue = "false") boolean includeUnderReview,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<RoundCandidateResponse> candidates = interviewRoundService
                .getRoundCandidates(recruitmentId, currentUser.id(), includeUnderReview).stream()
                .map(RoundCandidateResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(candidates));
    }

    @Override
    public ResponseEntity<ApiResponse<CreateInterviewRoundResponse>> createRound(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateInterviewRoundRequest createInterviewRoundRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long roundId = interviewRoundService.createRound(
                createInterviewRoundRequest.toCommand(recruitmentId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(CreateInterviewRoundResponse.from(roundId)));
    }

    @Override
    public ResponseEntity<ApiResponse<AvailabilityRequestResponse>> requestAvailability(
            @PathVariable Long roundId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                AvailabilityRequestResponse.from(
                        interviewRoundService.requestAvailability(roundId, currentUser.id()))));
    }

    @Override
    public ResponseEntity<ApiResponse<AvailabilityRequestResponse>> remind(
            @PathVariable Long roundId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                AvailabilityRequestResponse.from(
                        interviewRoundService.remind(roundId, currentUser.id()))));
    }

    @Override
    public ResponseEntity<ApiResponse<List<RoundSummaryResponse>>> getRounds(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<RoundSummaryResponse> rounds = interviewRoundService
                .getRounds(recruitmentId, currentUser.id()).stream()
                .map(RoundSummaryResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(rounds));
    }

    @Override
    public ResponseEntity<ApiResponse<RoundDetailResponse>> getRoundDetail(
            @PathVariable Long roundId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                RoundDetailResponse.from(interviewRoundService.getRoundDetail(roundId, currentUser.id()))));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateRound(
            @PathVariable Long roundId,
            @Valid @RequestBody UpdateInterviewRoundRequest updateInterviewRoundRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewRoundService.updateRound(
                updateInterviewRoundRequest.toCommand(roundId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> cancelRound(
            @PathVariable Long roundId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewRoundService.cancelRound(roundId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}


package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.LeaderInterviewRoundApi;
import com.duing.domain.interview.controller.dto.response.RoundCandidateResponse;
import com.duing.domain.interview.service.InterviewRoundService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
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
}

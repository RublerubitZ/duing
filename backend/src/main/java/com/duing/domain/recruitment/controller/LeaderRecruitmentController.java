package com.duing.domain.recruitment.controller;

import com.duing.domain.recruitment.api.LeaderRecruitmentApi;
import com.duing.domain.recruitment.controller.dto.request.CreateRecruitmentRequest;
import com.duing.domain.recruitment.controller.dto.request.UpdateRecruitmentRequest;
import com.duing.domain.recruitment.service.RecruitmentService;
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
public class LeaderRecruitmentController implements LeaderRecruitmentApi {

    private final RecruitmentService recruitmentService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createRecruitment(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateRecruitmentRequest createRecruitmentRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long recruitmentId = recruitmentService.create(
                createRecruitmentRequest.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(recruitmentId));
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> replaceActiveRecruitment(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateRecruitmentRequest createRecruitmentRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long recruitmentId = recruitmentService.replaceActive(
                createRecruitmentRequest.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(recruitmentId));
    }

    @Override
    public ResponseEntity<Void> updateRecruitment(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody UpdateRecruitmentRequest updateRecruitmentRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        recruitmentService.update(updateRecruitmentRequest.toCommand(recruitmentId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> closeRecruitment(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        recruitmentService.close(recruitmentId, currentUser.id());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> stopRecruitmentIntake(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        recruitmentService.stopIntake(recruitmentId, currentUser.id());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> deleteRecruitment(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        recruitmentService.delete(recruitmentId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}

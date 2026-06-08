package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.ApplicantInterviewSlotApi;
import com.duing.domain.interview.controller.dto.response.ApplicantInterviewSlotResponse;
import com.duing.domain.interview.service.InterviewSlotService;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ApplicantInterviewSlotController implements ApplicantInterviewSlotApi {

    private final InterviewSlotService interviewSlotService;

    @Override
    public ResponseEntity<ApiResponse<List<ApplicantInterviewSlotResponse>>> list(Long recruitmentId) {
        List<ApplicantInterviewSlotResponse> slots = interviewSlotService.listForApplicants(recruitmentId);
        return ResponseEntity.ok(ApiResponse.success(slots));
    }
}

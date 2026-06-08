package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.response.ApplicantInterviewSlotResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

@Tag(name = "지원자 면접 슬롯", description = "지원자가 조회 가능한 면접 슬롯 목록 (location 미포함)")
@SecurityRequirement(name = "BearerAuth")
@RequestMapping("/api/v1/recruitments/{recruitmentId}/applicant-interview-slots")
public interface ApplicantInterviewSlotApi {

    @Operation(summary = "지원자가 면접 슬롯 목록 조회 (location 미포함)")
    @GetMapping
    ResponseEntity<ApiResponse<List<ApplicantInterviewSlotResponse>>> list(
            @PathVariable Long recruitmentId
    );
}

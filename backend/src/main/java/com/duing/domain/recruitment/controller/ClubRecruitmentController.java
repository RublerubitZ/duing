package com.duing.domain.recruitment.controller;

import com.duing.domain.recruitment.api.ClubRecruitmentApi;
import com.duing.domain.recruitment.controller.dto.response.RecruitmentSummaryResponse;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ClubRecruitmentController implements ClubRecruitmentApi {

    private final RecruitmentService recruitmentService;

    @Override
    public ResponseEntity<ApiResponse<List<RecruitmentSummaryResponse>>> listByClub(@PathVariable Long clubId) {
        List<RecruitmentSummaryResponse> list = recruitmentService.getByClubId(clubId).stream()
                .map(RecruitmentSummaryResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(list));
    }
}
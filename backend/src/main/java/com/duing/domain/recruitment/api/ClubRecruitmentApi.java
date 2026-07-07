package com.duing.domain.recruitment.api;

import com.duing.domain.recruitment.controller.dto.response.RecruitmentSummaryResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "동아리 모집 목록", description = "특정 동아리의 모집 공고 목록 (공개)")
public interface ClubRecruitmentApi {

    @Operation(summary = "동아리별 모집 공고 목록",
            description = "OPEN 인 모집이 먼저, 그 다음 시작일 최신순. 운영 중(ACTIVE) 동아리만 조회할 수 있으며, 그 외 상태는 404 를 반환한다.")
    @GetMapping("/clubs/{clubId}/recruitments")
    ResponseEntity<ApiResponse<List<RecruitmentSummaryResponse>>> listByClub(@PathVariable Long clubId);
}

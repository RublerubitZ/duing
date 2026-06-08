package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.response.AutoAssignResultResponse;
import com.duing.domain.interview.controller.dto.response.MatchingCandidatesResponse;
import com.duing.domain.interview.service.dto.query.ScheduleListView;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@Tag(name = "운영진 면접 일정 관리", description = "자동배정 실행 + 일정 조회 + 후보 통계")
@SecurityRequirement(name = "BearerAuth")
@RequestMapping("/api/v1/recruitments/{recruitmentId}")
public interface ManagerInterviewScheduleApi {

    @Operation(
            summary = "M7 자동배정 실행",
            description = "availability_deadline 이 지난 후 1회만 실행 가능. "
                    + "pessimistic lock 으로 동시 실행 방지. 결과 통계 반환."
    )
    @PostMapping("/interview-schedules/auto-assign")
    ResponseEntity<ApiResponse<AutoAssignResultResponse>> autoAssign(
            @PathVariable Long recruitmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "M8 운영진 대시보드 — 슬롯별 그룹핑 면접 일정 목록",
            description = "모집의 모든 슬롯과 각 슬롯에 배정된 지원자 목록을 반환한다."
    )
    @GetMapping("/interview-schedules")
    ResponseEntity<ApiResponse<List<ScheduleListView>>> listSchedules(
            @PathVariable Long recruitmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "M11 자동배정 미리보기 — 후보 통계 (dry-run)",
            description = "자동배정 실행 전 INTERVIEW_PENDING 후보 수와 슬롯별 가용 시간 신청 현황을 조회한다."
    )
    @GetMapping("/interview-matching-candidates")
    ResponseEntity<ApiResponse<MatchingCandidatesResponse>> listCandidates(
            @PathVariable Long recruitmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

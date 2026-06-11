package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.response.RoundCandidateResponse;
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
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "면접 라운드(운영진)", description = "운영진 전용 면접 라운드 관리")
@SecurityRequirement(name = "BearerAuth")
public interface ManagerInterviewRoundApi {

    @Operation(
            summary = "면접 라운드 후보 조회",
            description = "라운드 생성 wizard Step1 과 상시모집 대기열이 사용하는 후보 목록. "
                    + "기본 후보군 = 면접 대기열 (INTERVIEW_PENDING 이면서 진행 중인 라운드에 소속되지 않은 지원자 — "
                    + "취소된 라운드·제외된 멤버는 대기열로 복귀). "
                    + "includeUnderReview=true 시 서류 검토 중(UNDER_REVIEW) 지원자도 포함한다 — 정기모집 wizard 의 기본 진입값. "
                    + "상시모집 대기열 카운트는 파라미터 없이 호출해 큐만 집계한다. "
                    + "면접을 사용하지 않는 모집이면 400."
    )
    @GetMapping("/recruitments/{recruitmentId}/interview-round-candidates")
    ResponseEntity<ApiResponse<List<RoundCandidateResponse>>> getRoundCandidates(
            @PathVariable Long recruitmentId,
            @Parameter(description = "서류 검토 중(UNDER_REVIEW) 지원자 포함 여부", example = "true")
            @RequestParam(required = false, defaultValue = "false") boolean includeUnderReview,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

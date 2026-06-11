package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.request.CreateInterviewRoundRequest;
import com.duing.domain.interview.controller.dto.response.CreateInterviewRoundResponse;
import com.duing.domain.interview.controller.dto.response.RoundCandidateResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "면접 라운드(운영진)", description = "운영진 전용 면접 라운드 관리")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderInterviewRoundApi {

    @Operation(
            summary = "면접 라운드 후보 조회",
            description = "라운드 생성 wizard Step1 과 상시모집 대기열이 사용하는 후보 목록. "
                    + "기본 후보군 = 면접 대기열 (INTERVIEW_PENDING 이면서 진행 중인 라운드에 소속되지 않은 지원자 — "
                    + "취소된 라운드·제외된 멤버는 대기열로 복귀). "
                    + "includeUnderReview=true 시 서류 검토 중(UNDER_REVIEW) 지원자도 포함한다 — 정기모집 wizard 의 기본 진입값. "
                    + "상시모집 대기열 카운트는 파라미터 없이 호출해 큐만 집계한다. "
                    + "면접을 사용하지 않는 모집이면 400."
    )
    @GetMapping("/leader/recruitments/{recruitmentId}/interview-round-candidates")
    ResponseEntity<ApiResponse<List<RoundCandidateResponse>>> getRoundCandidates(
            @PathVariable Long recruitmentId,
            @Parameter(description = "서류 검토 중(UNDER_REVIEW) 지원자 포함 여부", example = "true")
            @RequestParam(required = false, defaultValue = "false") boolean includeUnderReview,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 생성 (wizard)",
            description = "면접 대상 선정과 라운드 생성을 한 트랜잭션으로 처리한다 — wizard Step2 완료 시점의 첫 persist. "
                    + "허용 지원 상태: UNDER_REVIEW(선정 — INTERVIEW_PENDING 으로 전이·이력 기록), INTERVIEW_PENDING(대기열 재수용 — 유지). "
                    + "그 외 상태가 섞이면 400 이고 전체가 롤백된다. "
                    + "이미 진행 중 라운드에 소속된 지원자가 있으면 409. 모집당 준비 중(DRAFT) 라운드는 1개 — 이미 있으면 409. "
                    + "availabilityDeadline 은 DRAFT 동안 생략 가능하며 발송 시점에 필수가 된다. 지정 시 현재 이후여야 한다."
    )
    @PostMapping("/leader/recruitments/{recruitmentId}/interview-rounds")
    ResponseEntity<ApiResponse<CreateInterviewRoundResponse>> createRound(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateInterviewRoundRequest createInterviewRoundRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

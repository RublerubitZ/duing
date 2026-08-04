package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.request.CreateInterviewRoundRequest;
import com.duing.domain.interview.controller.dto.request.UpdateInterviewRoundRequest;
import com.duing.domain.interview.controller.dto.response.AvailabilityRequestResponse;
import com.duing.domain.interview.controller.dto.response.CreateInterviewRoundResponse;
import com.duing.domain.interview.controller.dto.response.RoundCandidateResponse;
import com.duing.domain.interview.controller.dto.response.RoundDetailResponse;
import com.duing.domain.interview.controller.dto.response.RoundSummaryResponse;
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
import org.springframework.web.bind.annotation.PatchMapping;
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
                    + "includeUndecided=true 면 미결정 상태(SUBMITTED·ON_HOLD) 후보도 포함하고, false 면 INTERVIEW_PENDING 만 반환한다 "
                    + "— true 가 정기모집 wizard 의 기본 진입값. "
                    + "상시모집 대기열 카운트는 파라미터 없이 호출해 큐만 집계한다. "
                    + "면접을 사용하지 않는 모집이면 400."
    )
    @GetMapping("/leader/recruitments/{recruitmentId}/interview-round-candidates")
    ResponseEntity<ApiResponse<List<RoundCandidateResponse>>> getRoundCandidates(
            @PathVariable Long recruitmentId,
            @Parameter(description = "미결정 상태(SUBMITTED·ON_HOLD) 지원자 포함 여부", example = "true")
            @RequestParam(required = false, defaultValue = "false") boolean includeUndecided,
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

    @Operation(
            summary = "면접 라운드 발송 (Availability 요청)",
            description = "준비 중(DRAFT) 라운드를 응답 수집(COLLECTING) 상태로 전환하고 초대된 전원에게 가능 시간 선택 알림을 보낸다 — wizard Step4. "
                    + "가드: 슬롯 1개 이상 + 초대 상태 대상자 1명 이상 + 마감 시각 설정(미래). 충족하지 못하면 409/400. "
                    + "이미 발송됐거나 취소된 라운드는 409."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/request-availability")
    ResponseEntity<ApiResponse<AvailabilityRequestResponse>> requestAvailability(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 재알림",
            description = "응답 수집 중(COLLECTING) 라운드의 미응답 대상자에게 새 회차로 알림을 재발송한다. "
                    + "마감 경과 여부와 무관하게 가능하다. 미응답 대상자가 없으면 409."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/remind")
    ResponseEntity<ApiResponse<AvailabilityRequestResponse>> remind(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 목록 조회",
            description = "모집의 라운드를 최신 생성 순으로 반환한다. 카드 요약용 카운트 포함 — "
                    + "totalMemberCount 는 제외(EXCLUDED) 멤버를 뺀 응답 가능 대상, "
                    + "respondedMemberCount 는 응답 행위를 완료한 수(슬롯 선택·가능 없음 응답·배정 확정)."
    )
    @GetMapping("/leader/recruitments/{recruitmentId}/interview-rounds")
    ResponseEntity<ApiResponse<List<RoundSummaryResponse>>> getRounds(
            @PathVariable Long recruitmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 상세 dashboard",
            description = "상태별 카운트 카드, 멤버 테이블(파생 미응답 — 마감 경과 && 초대 상태, 가능 슬롯 없음 멤버의 대체 가능시간 텍스트, "
                    + "선택 슬롯 수, 배정 슬롯), 슬롯 목록(시작 시각 오름차순, 슬롯별 선택/배정 수)을 반환한다."
    )
    @GetMapping("/leader/interview-rounds/{roundId}")
    ResponseEntity<ApiResponse<RoundDetailResponse>> getRoundDetail(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 수정",
            description = "제목·장소·마감을 부분 수정한다 (보내지 않은 필드는 유지). 제목·장소는 배정 검토 단계까지, "
                    + "마감은 발송 전(미래 시각 자유)·응답 수집 중(연장만) 변경할 수 있다. 확정·취소된 라운드는 수정 불가."
    )
    @PatchMapping("/leader/interview-rounds/{roundId}")
    ResponseEntity<ApiResponse<Void>> updateRound(
            @PathVariable Long roundId,
            @Valid @RequestBody UpdateInterviewRoundRequest updateInterviewRoundRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 취소",
            description = "라운드를 취소한다 (발송 전·응답 수집·배정 검토 단계). draft 배정이 정리되고 멤버 지원서는 "
                    + "면접 대상 상태 그대로 후보 대기열로 복귀한다 — 새 라운드에서 재선정하면 된다. "
                    + "확정된 라운드는 터미널이라 취소할 수 없다. 취소 알림은 발송되지 않는다."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/cancel")
    ResponseEntity<ApiResponse<Void>> cancelRound(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}


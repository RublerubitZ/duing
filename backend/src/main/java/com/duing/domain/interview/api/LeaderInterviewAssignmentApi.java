package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.request.AssignScheduleRequest;
import com.duing.domain.interview.controller.dto.response.AutoAssignResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "면접 배정(운영진)", description = "면접 라운드 자동배정·수동 배정·해제·멤버 제외")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderInterviewAssignmentApi {

    @Operation(
            summary = "면접 자동배정 실행",
            description = "응답 완료(RESPONDED) 멤버를 그리디(선택지 적은 지원자 우선, 잔여 수용 인원 최대 슬롯)로 배정한다. "
                    + "응답 수집 중이면 배정 검토(ASSIGNING) 단계로 전이하며, 배정 검토 중 재실행하면 기존 draft 를 "
                    + "현재 상태 기준으로 재계산한다. 가능없음·미응답·제외 멤버는 대상이 아니다. "
                    + "멤버 확정(ASSIGNED 전이)·알림은 확정 API 에서만 일어난다."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/auto-assign")
    ResponseEntity<ApiResponse<AutoAssignResponse>> autoAssign(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 수동 배정/재배정",
            description = "멤버를 지정 슬롯에 배정한다 (배정 검토 단계 한정). 가능없음·미응답 멤버도 운영진 재량으로 "
                    + "배정할 수 있고, 기존 배정은 교체된다. 정원이 찬 슬롯은 409 — 단 같은 슬롯 내 본인 재배정은 허용된다. "
                    + "멤버 상태는 바뀌지 않는다 (확정 시점에만 ASSIGNED 전이)."
    )
    @PutMapping("/leader/interview-rounds/{roundId}/members/{memberId}/schedule")
    ResponseEntity<ApiResponse<Void>> assignSchedule(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @Valid @RequestBody AssignScheduleRequest assignScheduleRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 배정 해제",
            description = "멤버의 활성 배정을 해제한다 (배정 검토 단계 한정). 활성 배정이 없으면 404."
    )
    @DeleteMapping("/leader/interview-rounds/{roundId}/members/{memberId}/schedule")
    ResponseEntity<ApiResponse<Void>> unassignSchedule(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 멤버 제외",
            description = "멤버를 라운드에서 제외한다 (발송 전·응답 수집·배정 검토 단계). 활성 배정이 함께 정리되고, "
                    + "지원서는 면접 대상 상태를 유지해 후보 대기열로 즉시 복귀한다. 지원자에게는 제외 사실이 "
                    + "노출되지 않는다 (중립 단계로 표시)."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/members/{memberId}/exclude")
    ResponseEntity<ApiResponse<Void>> excludeMember(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

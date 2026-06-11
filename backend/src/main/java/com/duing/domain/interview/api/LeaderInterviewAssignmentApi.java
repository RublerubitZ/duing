package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.response.AutoAssignResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

@Tag(name = "면접 배정(운영진)", description = "면접 라운드 자동배정")
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
}

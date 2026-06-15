package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.request.RespondInterviewAvailabilityRequest;
import com.duing.domain.interview.controller.dto.response.ApplicantInterviewResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "면접(지원자)", description = "지원자 본인의 면접 진행 조회")
@SecurityRequirement(name = "BearerAuth")
public interface ApplicantInterviewApi {

    @Operation(
            summary = "내 면접 진행 단계 조회",
            description = "서버가 파생한 진행 단계(applicantPhase)와 단계별 화면 데이터를 반환한다. "
                    + "응답 수집 중이면 선택 가능한 슬롯 목록(내 선택 표시)·마감 시각, 일정 확정 후면 면접 일시·장소가 포함된다. "
                    + "내부 상태(라운드/멤버 raw status)는 노출되지 않는다 — 진행 표시는 반드시 phase 만 사용할 것. "
                    + "평가~면접 구간 밖(제출됨·합격·불합격)은 NOT_APPLICABLE."
    )
    @GetMapping("/applications/{applicationId}/interview")
    ResponseEntity<ApiResponse<ApplicantInterviewResponse>> getMyInterview(
            @PathVariable Long applicationId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 가능 시간 응답",
            description = "슬롯 선택(slotIds) 또는 '가능한 시간 없음'(noAvailableSlot + alternativeText) 중 하나로 응답한다 — 둘은 동시에 보낼 수 없다. "
                    + "전체 교체 방식이라 재응답하면 이전 선택이 사라지며, 응답 수집 중(마감 전) 라운드에서만 가능하다. "
                    + "마감 후·배정 단계 진입 후에는 409, 응답할 라운드가 없으면 404."
    )
    @PutMapping("/applications/{applicationId}/interview-availability")
    ResponseEntity<ApiResponse<Void>> respondAvailability(
            @PathVariable Long applicationId,
            @Valid @RequestBody RespondInterviewAvailabilityRequest respondInterviewAvailabilityRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

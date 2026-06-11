package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.response.ApplicantInterviewResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

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
}

package com.duing.domain.application.api;

import com.duing.domain.application.controller.dto.response.AdminApplicantListResponse;
import com.duing.domain.application.controller.dto.response.AdminApplicationDetailResponse;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.AdminApplicantSort;
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
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "지원자(총동연)",
        description = "총동연 전용 지원자 조회 API — 모집별 지원자 목록·지원서 상세(읽기 전용)")
@SecurityRequirement(name = "BearerAuth")
public interface AdminApplicationApi {

    @Operation(summary = "지원자 목록 조회 (ADMIN)",
            description = "모집의 지원자를 최근 제출 순으로 반환한다. 취소된 지원서는 조회되지 않는다. "
                    + "미존재·삭제 모집은 상세와 같이 404 이며, 외부 폼 모집은 지원 데이터가 없어 빈 목록으로 내려온다. "
                    + "q 는 이름·학번·학과명 부분 일치(대소문자 무시)이고, status 를 생략하면 상태를 가리지 않는다. "
                    + "statusCounts 는 검색·필터와 무관한 모집 전체 기준이며, 건수가 0 인 상태는 키가 없다. "
                    + "외부 폼 모집은 두잉에 지원 데이터가 없어 빈 목록이 내려온다(오류가 아니다). "
                    + "페이지네이션은 제공하지 않는다.")
    @GetMapping("/admin/recruitments/{recruitmentId}/applications")
    ResponseEntity<ApiResponse<AdminApplicantListResponse>> getApplicants(
            @Parameter(description = "조회 대상 모집 ID", required = true)
            @PathVariable Long recruitmentId,
            @Parameter(description = "이름·학번·학과명 부분 일치(대소문자 무시). 생략 가능", example = "홍길동")
            @RequestParam(required = false) String q,
            @Parameter(description = "지원 상태 필터. 생략하면 전체", example = "SUBMITTED")
            @RequestParam(required = false) ApplicationStatus status,
            @Parameter(description = "정렬 기준. LATEST=최근 제출 순(기본), OLDEST=먼저 제출한 순", example = "LATEST")
            @RequestParam(defaultValue = "LATEST") AdminApplicantSort sort
    );

    @Operation(summary = "지원서 상세 조회 (ADMIN)",
            description = "지원서의 신원·상태 이력·문항별 답변을 반환한다. "
                    + "전화번호·학년과 면접 평가·일정 같은 심사 내부 자료는 담지 않는다. "
                    + "개인정보 열람이라 조회할 때마다 감사 기록이 남는다. "
                    + "미존재·취소된 지원서는 404.")
    @GetMapping("/admin/applications/{applicationId}")
    ResponseEntity<ApiResponse<AdminApplicationDetailResponse>> getApplicationDetail(
            @Parameter(description = "조회 대상 지원서 ID", required = true)
            @PathVariable Long applicationId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

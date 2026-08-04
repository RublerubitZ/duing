package com.duing.domain.recruitment.api;

import com.duing.domain.recruitment.controller.dto.request.ForceCloseRecruitmentRequest;
import com.duing.domain.recruitment.controller.dto.response.AdminRecruitmentDetailResponse;
import com.duing.domain.recruitment.controller.dto.response.AdminRecruitmentSummaryResponse;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSort;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "모집(총동연)",
        description = "총동연 전용 모집 관리 API — 전 동아리 모집 검색·상세 조회·강제 마감")
@SecurityRequirement(name = "BearerAuth")
public interface AdminRecruitmentApi {

    @Operation(summary = "모집 목록 조회 (ADMIN)",
            description = "전 동아리의 모집을 한 목록으로 반환한다. 삭제된 모집은 조회되지 않는다. "
                    + "q 는 동아리명 또는 모집 제목 부분 일치(대소문자 무시)이며, "
                    + "status·mode 를 생략하면 각각 상태·방식을 가리지 않는다. "
                    + "status 는 기간 경과 여부가 아니라 저장 상태(OPEN/CLOSED)다. "
                    + "지원자 수는 외부 폼 모집이면 비어 있다 — 두잉에 지원 데이터가 없으므로 0 이 아니라 해당 없음이다. "
                    + "페이지네이션은 제공하지 않는다.")
    @GetMapping("/admin/recruitments")
    ResponseEntity<ApiResponse<List<AdminRecruitmentSummaryResponse>>> searchRecruitments(
            @Parameter(description = "검색어 (동아리명 또는 모집 제목 부분 일치). 생략 가능")
            @RequestParam(required = false) String q,
            @Parameter(description = "모집 상태 필터. 생략하면 전체", example = "OPEN")
            @RequestParam(required = false) RecruitmentStatus status,
            @Parameter(description = "모집 방식 필터. 생략하면 전체", example = "EXTERNAL")
            @RequestParam(required = false) ApplicationMode mode,
            @Parameter(description = "정렬 기준. LATEST=최신순(기본), APPLICANTS=지원자 많은 순, "
                    + "DEADLINE=마감 임박순(상시모집은 맨 뒤)", example = "LATEST")
            @RequestParam(defaultValue = "LATEST") AdminRecruitmentSort sort
    );

    @Operation(summary = "모집 상세 조회 (ADMIN)",
            description = "목록 항목에 외부 폼 주소와 가입 링크 현황을 더해 반환한다. "
                    + "가입 링크 현황은 외부 폼 모집에 활성 코드가 있을 때만 실리며, "
                    + "6자리 코드 값은 담지 않는다. 링크 상태는 ACTIVE·EXPIRED·EXHAUSTED 세 가지이고, "
                    + "폐기된 코드는 활성 조회에서 빠지므로 현황 자체가 비어 있는 것이 곧 코드 없음이다. "
                    + "미존재·삭제 모집은 404.")
    @GetMapping("/admin/recruitments/{recruitmentId}")
    ResponseEntity<ApiResponse<AdminRecruitmentDetailResponse>> getRecruitmentDetail(
            @Parameter(description = "조회 대상 모집 ID", required = true)
            @PathVariable Long recruitmentId
    );

    @Operation(summary = "모집 강제 마감 (ADMIN)",
            description = "진행 중인 모집을 총동연 권한으로 마감한다. 운영진 수동 마감과 같은 전이를 타므로 "
                    + "종료 시각이 함께 남고, 외부 폼 모집의 가입 링크는 그 시각을 기준으로 남은 기간 동안 계속 쓸 수 있다. "
                    + "사유는 선택 입력(최대 500자)이며 감사 기록에만 남는다. "
                    + "이미 마감된 모집은 409, 미존재·삭제 모집은 404.")
    @PatchMapping("/admin/recruitments/{recruitmentId}/close")
    ResponseEntity<ApiResponse<Void>> forceCloseRecruitment(
            @Parameter(description = "마감할 모집 ID", required = true)
            @PathVariable Long recruitmentId,
            @Valid @RequestBody ForceCloseRecruitmentRequest forceCloseRecruitmentRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}

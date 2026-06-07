package com.duing.domain.application.api;

import com.duing.domain.application.controller.dto.request.BulkUpdateApplicationStatusRequest;
import com.duing.domain.application.controller.dto.request.UpdateApplicationInterviewRequest;
import com.duing.domain.application.controller.dto.request.UpdateApplicationStatusRequest;
import com.duing.domain.application.controller.dto.response.ApplicantDetailResponse;
import com.duing.domain.application.controller.dto.response.ApplicantResponse;
import com.duing.domain.application.controller.dto.response.BulkUpdateApplicationStatusResponse;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.user.entity.College;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "지원자(동아리장)", description = "동아리장 전용 지원자 관리")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderApplicationApi {

    @Operation(
            summary = "지원자 목록 조회",
            description = "본인이 동아리장인 모집 공고의 지원자를 최근 제출 순(desc) 으로 반환한다. "
                    + "옵셔널 필터: status, college (단과대), q (이름·학번·학과명 부분일치 OR), "
                    + "submittedFrom·submittedTo (LocalDate, half-open: submittedTo 당일 23:59 까지 포함). "
                    + "submittedFrom > submittedTo 시 400."
    )
    @GetMapping("/leader/recruitments/{recruitmentId}/applications")
    ResponseEntity<ApiResponse<List<ApplicantResponse>>> getApplicants(
            @PathVariable Long recruitmentId,
            @Parameter(description = "지원 상태 필터 (SUBMITTED | UNDER_REVIEW | INTERVIEW_PENDING | ACCEPTED | REJECTED)")
            @RequestParam(required = false) ApplicationStatus status,
            @Parameter(description = "단과대 필터")
            @RequestParam(required = false) College college,
            @Parameter(description = "이름·학번·학과명 부분일치(OR), 대소문자 무시")
            @RequestParam(required = false) String q,
            @Parameter(description = "제출일 시작 (inclusive, yyyy-MM-dd)", example = "2026-05-01")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedFrom,
            @Parameter(description = "제출일 종료 (inclusive, yyyy-MM-dd)", example = "2026-05-31")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedTo,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "지원자 답변 상세 조회", description = "운영진이 지원자 모달에서 답변·신원·면접 정보를 한 번에 조회한다.")
    @GetMapping("/leader/applications/{applicationId}")
    ResponseEntity<ApiResponse<ApplicantDetailResponse>> getApplicantDetail(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "지원자 상태 변경", description = "ACCEPTED 또는 REJECTED 로만 변경 가능. SUBMITTED 로 되돌릴 수 없다.")
    @PatchMapping("/leader/applications/{applicationId}/status")
    ResponseEntity<ApiResponse<Void>> updateStatus(
            @PathVariable Long applicationId,
            @Valid @RequestBody UpdateApplicationStatusRequest updateApplicationStatusRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "지원자 상태 일괄 변경",
            description = "N건의 지원서를 동일 status 로 일괄 전환한다. 건별 트랜잭션으로 처리되어 한 건이 실패해도 나머지는 그대로 커밋되며, 실패 사유는 응답의 failures 배열에 담겨 돌아온다.")
    @PatchMapping("/leader/applications/bulk-status")
    ResponseEntity<ApiResponse<BulkUpdateApplicationStatusResponse>> bulkUpdateStatus(
            @Valid @RequestBody BulkUpdateApplicationStatusRequest bulkUpdateApplicationStatusRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "면접 일시·장소 입력", description = "INTERVIEW_PENDING 상태인 지원서에 면접 일시와 장소를 입력한다. 그 외 상태에서 호출하면 409.")
    @PatchMapping("/leader/applications/{applicationId}/interview")
    ResponseEntity<ApiResponse<Void>> updateInterview(
            @PathVariable Long applicationId,
            @Valid @RequestBody UpdateApplicationInterviewRequest updateApplicationInterviewRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}

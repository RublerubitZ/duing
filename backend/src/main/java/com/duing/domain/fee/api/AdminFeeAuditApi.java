package com.duing.domain.fee.api;

import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.fee.controller.dto.request.CreateFeeAuditCommentRequest;
import com.duing.domain.fee.controller.dto.request.UpdateFeeAuditCommentRequest;
import com.duing.domain.fee.controller.dto.response.AdminFeeAccountResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeAnomalyReportResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeAuditCommentResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeAuditLogResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeBillRowResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeClubDetailResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeClubSummaryResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeDashboardResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeePaymentRowResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeePolicyResponse;
import com.duing.domain.fee.entity.FeeAuditCommentKind;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.service.dto.query.AdminFeeBillFilter;
import com.duing.domain.fee.service.dto.query.AdminFeeBillSort;
import com.duing.domain.fee.service.dto.query.AdminFeeClubSort;
import com.duing.domain.fee.service.dto.query.AdminFeeUsageFilter;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "회비 감사(총동연)",
        description = "총동연 전용 회비 감사 콘솔 API — 전 동아리 회비 현황·전체 KPI·동아리별 상세 지표. "
                + "감사자는 회비 데이터를 바꾸지 않는다 — 쓰기 경로는 총동연 자신의 감사 의견·메모뿐이다.")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFeeAuditApi {

    @Operation(summary = "회비 감사 동아리 목록 (ADMIN)",
            description = "전 동아리 회비 현황. q 는 동아리명 부분 일치(대소문자 무시), usage 생략 시 전체. "
                    + "from/to(KST 날짜, to 포함)는 청구 발행일 기준으로 집계 범위를 자르며, "
                    + "수납액은 그 범위에 든 청구의 납부 합계라 납부 시점이 기간 밖이어도 포함된다. "
                    + "집계에서 취소 청구·정정 납부는 제외된다. 기본 정렬은 미수금 많은 순. "
                    + "목록에는 운영 중(ACTIVE)·비활성(INACTIVE) 동아리만 실린다 — "
                    + "승인 대기·거절 동아리는 회비 데이터가 존재할 수 없다.")
    @GetMapping("/admin/fees")
    ResponseEntity<ApiResponse<PageResponse<AdminFeeClubSummaryResponse>>> searchFeeClubs(
            @Parameter(description = "검색어 (동아리명 부분 일치). 생략 가능")
            @RequestParam(required = false) String q,
            @Parameter(description = "회비 사용 여부 필터. 활성 정책이나 청구 이력이 있으면 사용 중으로 본다. "
                    + "생략하면 전체", example = "USING")
            @RequestParam(required = false) AdminFeeUsageFilter usage,
            @Parameter(description = "집계 시작일 (KST, 포함). 생략하면 전체 기간", example = "2026-03-01")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "집계 종료일 (KST, 당일 포함). 생략하면 전체 기간", example = "2026-08-31")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = "정렬 기준. OUTSTANDING=미수금 많은 순(기본), BILLED=청구액 많은 순, "
                    + "COLLECTED=수납액 많은 순, RECENT_PAYMENT=최근 납부순(납부 없으면 뒤), NAME=동아리명 가나다순",
                    example = "OUTSTANDING")
            @RequestParam(defaultValue = "OUTSTANDING") AdminFeeClubSort sort,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "회비 감사 전체 현황 (ADMIN)",
            description = "전 동아리를 합산한 청구액·수납액·미수금과 수납률을 반환한다. "
                    + "기간 기준은 목록과 같고, 청구가 없으면 수납률은 0 이다.")
    @GetMapping("/admin/fees/dashboard")
    ResponseEntity<ApiResponse<AdminFeeDashboardResponse>> getFeeDashboard(
            @Parameter(description = "집계 시작일 (KST, 포함). 생략하면 전체 기간", example = "2026-03-01")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "집계 종료일 (KST, 당일 포함). 생략하면 전체 기간", example = "2026-08-31")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    );

    @Operation(summary = "회비 감사 동아리 상세 KPI (ADMIN)",
            description = "동아리 한 곳의 청구 건수 분류와 금액 지표를 반환한다. "
                    + "미납과 연체는 저장된 상태값이 아니라 마감일로 가른다 — 연체 전이 배치가 하루 늦거나 "
                    + "꺼져 있어도 감사 수치가 흔들리지 않게 하기 위한 것이라, 운영진 화면과 수치가 다를 수 있다. "
                    + "청구 건수는 취소 건을 포함하고 금액 지표는 취소 건을 뺀 값이다. "
                    + "이 API 호출은 재무 데이터 열람 이력으로 감사 로그에 한 건씩 남는다. 미존재·삭제 동아리는 404.")
    @GetMapping("/admin/fees/{clubId}")
    ResponseEntity<ApiResponse<AdminFeeClubDetailResponse>> getFeeClubDetail(
            @Parameter(description = "조회 대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "집계 시작일 (KST, 포함). 생략하면 전체 기간", example = "2026-03-01")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "집계 종료일 (KST, 당일 포함). 생략하면 전체 기간", example = "2026-08-31")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 감사 정책 목록 (ADMIN)",
            description = "동아리의 회비 정책 전부를 반환한다 — 비활성 정책도 감사 대상이라 함께 실린다. "
                    + "납부율은 그 정책으로 기간 내 발행된 청구(취소 제외) 중 완납 비율이며, "
                    + "기간 내 발행 청구가 없으면 0 이다. 최근 생성순으로 정렬한다.")
    @GetMapping("/admin/fees/{clubId}/policies")
    ResponseEntity<ApiResponse<List<AdminFeePolicyResponse>>> getFeePolicies(
            @Parameter(description = "조회 대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "집계 시작일 (KST, 포함). 생략하면 전체 기간", example = "2026-03-01")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "집계 종료일 (KST, 당일 포함). 생략하면 전체 기간", example = "2026-08-31")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    );

    @Operation(summary = "회비 감사 청구 목록 (ADMIN)",
            description = "동아리의 청구 내역. filter 는 저장된 상태값이 아니라 콘솔 의미 필터다 — "
                    + "미납(UNPAID)과 연체(OVERDUE)는 마감일로 갈리며 마감 당일은 아직 미납이다. "
                    + "응답의 status 는 DB 원본이고 overdue 는 같은 기준으로 계산한 파생 값이라, "
                    + "연체 전이 배치가 늦어 status 가 PENDING 인 청구도 연체로 표시할 수 있다. "
                    + "q 는 회원명 부분 일치 또는 학번 앞자리 일치이고, 기간은 청구 발행일 기준이다. "
                    + "탈퇴 회원의 청구는 이름·학번 없이, 삭제된 정책의 청구는 정책명 없이 실린다.")
    @GetMapping("/admin/fees/{clubId}/bills")
    ResponseEntity<ApiResponse<PageResponse<AdminFeeBillRowResponse>>> searchFeeBills(
            @Parameter(description = "조회 대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "청구 필터. PAID=완납, UNPAID=미납(마감 전), OVERDUE=연체(마감 경과), "
                    + "CANCELLED=취소. 생략하면 전체", example = "OVERDUE")
            @RequestParam(required = false) AdminFeeBillFilter filter,
            @Parameter(description = "검색어 (회원명 부분 일치 또는 학번 앞자리). 생략 가능")
            @RequestParam(required = false) String q,
            @Parameter(description = "발행 시작일 (KST, 포함). 생략하면 전체 기간", example = "2026-03-01")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "발행 종료일 (KST, 당일 포함). 생략하면 전체 기간", example = "2026-08-31")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = "정렬 기준. LATEST=최근 발행순(기본), DUE=마감 임박순, AMOUNT=청구액 큰 순",
                    example = "LATEST")
            @RequestParam(defaultValue = "LATEST") AdminFeeBillSort sort,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "회비 감사 납부 목록 (ADMIN)",
            description = "동아리의 납부 내역을 납부일 최신순으로 반환한다. 정정(VOIDED)된 납부도 실린다 — "
                    + "누가·언제·왜 정정했는지가 감사의 핵심이다. 기간은 납부일 기준이다. "
                    + "matchType 은 DIRECT(수기 기록)·AUTO(자동매칭)·MANUAL(운영자가 거래를 골라 승인) 이며, "
                    + "매칭을 해제한 뒤 정정된 납부는 원래 방식을 복원할 수 없어 MANUAL 로 표기된다. "
                    + "입금자명은 거래가 연결된 납부에만 있다.")
    @GetMapping("/admin/fees/{clubId}/payments")
    ResponseEntity<ApiResponse<PageResponse<AdminFeePaymentRowResponse>>> searchFeePayments(
            @Parameter(description = "조회 대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "납부 상태. ACTIVE=유효, VOIDED=정정됨. 생략하면 전체", example = "VOIDED")
            @RequestParam(required = false) PaymentStatus status,
            @Parameter(description = "납부 시작일 (KST, 포함). 생략하면 전체 기간", example = "2026-03-01")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "납부 종료일 (KST, 당일 포함). 생략하면 전체 기간", example = "2026-08-31")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "회비 감사 계좌 조회 (ADMIN)",
            description = "동아리의 회비 입금 계좌를 열람 전용으로 반환한다. 계좌번호는 끝 4자리만 남긴 마스킹 값이며 "
                    + "평문은 어떤 필드로도 나가지 않는다. 복호화에 실패하면 마스킹 값만 비어 나온다. "
                    + "계좌를 등록하지 않은 동아리는 registered=false 에 나머지가 비어 있다. "
                    + "이 API 로 계좌를 바꾸거나 지울 수는 없다 — 자동매칭 허용은 별도 화면 소관이다.")
    @GetMapping("/admin/fees/{clubId}/account")
    ResponseEntity<ApiResponse<AdminFeeAccountResponse>> getFeeAccount(
            @Parameter(description = "조회 대상 동아리 ID", required = true)
            @PathVariable Long clubId
    );

    @Operation(summary = "회비 감사 로그 (ADMIN)",
            description = "동아리의 회비 변경 이력을 최신순으로 반환한다. 정책·청구·납부·거래 매칭·계좌 변경과 "
                    + "총동연 열람 이력이 대상이며, 회비와 무관한 이벤트(가입 링크 등)는 실리지 않는다 — "
                    + "types 에 회비 밖 종류를 섞어 보내도 400 이 아니라 그 값만 무시된다. "
                    + "기간은 이벤트 발생 시각 기준이고, actorName 은 탈퇴한 회원이면 비어 나온다. "
                    + "detail 은 변경 전/후 스냅샷 원본(JSON)이라 이벤트 종류마다 키가 다르고 없을 수도 있다. "
                    + "감사 로그는 계측 배포 시점 이후의 변경만 기록된다 — 그 이전 이력은 존재하지 않는다.")
    @GetMapping("/admin/fees/{clubId}/audit-logs")
    ResponseEntity<ApiResponse<PageResponse<AdminFeeAuditLogResponse>>> searchFeeAuditLogs(
            @Parameter(description = "조회 대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "이벤트 종류 필터 (복수 지정 가능). 생략하면 회비 이벤트 전체",
                    example = "FEE_PAYMENT_VOIDED")
            @RequestParam(required = false) List<ClubAuditEventType> types,
            @Parameter(description = "조회 시작일 (KST, 포함). 생략하면 전체 기간", example = "2026-03-01")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "조회 종료일 (KST, 당일 포함). 생략하면 전체 기간", example = "2026-08-31")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "회비 이상징후 평가 (ADMIN)",
            description = "동아리의 회비 데이터와 감사 로그를 8개 규칙으로 그 자리에서 평가해 걸린 것만 "
                    + "심각도 높은 순으로 반환한다 — 아무것도 걸리지 않으면 빈 배열이다. "
                    + "기간을 생략하면 최근 30일로 평가하며, 실제로 적용된 구간은 window 로 함께 내려간다. "
                    + "단시간 대량 변경(24시간)·동일 운영진 반복 변경(7일)은 짧은 창 자체가 판정의 일부라 "
                    + "요청 기간과 무관하게 현재 기준으로 보고, 계좌 교체는 기간이 90일보다 짧아도 90일까지 넓혀 본다 — "
                    + "그래서 window 밖 시점의 징후가 실릴 수 있다. "
                    + "이벤트를 보는 규칙은 감사 계측 배포 이후의 변경만 대상으로 한다. "
                    + "evidence 는 판정 근거(건수·비율·임계값)이며 규칙마다 키가 다르다. 미존재·삭제 동아리는 404.")
    @GetMapping("/admin/fees/{clubId}/anomalies")
    ResponseEntity<ApiResponse<AdminFeeAnomalyReportResponse>> evaluateFeeAnomalies(
            @Parameter(description = "평가 대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "평가 시작일 (KST, 포함). 생략하면 종료일 기준 30일 전", example = "2026-07-05")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "평가 종료일 (KST, 당일 포함). 생략하면 오늘", example = "2026-08-04")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    );

    @Operation(summary = "회비 감사 의견·메모 목록 (ADMIN)",
            description = "동아리에 남긴 감사 의견과 운영 메모를 최신순으로 반환한다. kind 를 생략하면 둘 다 실린다. "
                    + "총동연 내부 기록이라 동아리 측에는 어떤 화면으로도 나가지 않는다. "
                    + "메모는 상태가 없어 status 가 항상 비어 있고, 작성자가 탈퇴하면 이름만 비워진다. "
                    + "삭제한 의견은 목록에서 사라진다. 미존재·삭제 동아리는 404.")
    @GetMapping("/admin/fees/{clubId}/audit-comments")
    ResponseEntity<ApiResponse<List<AdminFeeAuditCommentResponse>>> getFeeAuditComments(
            @Parameter(description = "조회 대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "종류 필터. AUDIT_OPINION=감사 의견, OPERATION_MEMO=운영 메모. 생략하면 전체",
                    example = "AUDIT_OPINION")
            @RequestParam(required = false) FeeAuditCommentKind kind
    );

    @Operation(summary = "회비 감사 의견·메모 작성 (ADMIN)",
            description = "감사 의견이나 운영 메모를 남긴다. 의견은 status 를 생략하면 OPEN 으로 시작하고, "
                    + "운영 메모는 상태를 가질 수 없어 status 를 함께 보내면 400 이다. 내용은 1~2000자다.")
    @PostMapping("/admin/fees/{clubId}/audit-comments")
    ResponseEntity<ApiResponse<Long>> createFeeAuditComment(
            @Parameter(description = "대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Valid @RequestBody CreateFeeAuditCommentRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 감사 의견·메모 수정 (ADMIN)",
            description = "내용과 상태를 부분 수정한다 — 보내지 않은 값은 그대로 둔다. "
                    + "상태 전이에는 제약이 없어 완료한 의견을 다시 열 수 있고, 운영 메모에 status 를 보내면 400 이다. "
                    + "다른 동아리의 의견 ID 로는 접근할 수 없다(404).")
    @PatchMapping("/admin/fees/{clubId}/audit-comments/{commentId}")
    ResponseEntity<ApiResponse<Void>> updateFeeAuditComment(
            @Parameter(description = "대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "수정할 의견·메모 ID", required = true)
            @PathVariable Long commentId,
            @Valid @RequestBody UpdateFeeAuditCommentRequest request
    );

    @Operation(summary = "회비 감사 의견·메모 삭제 (ADMIN)",
            description = "의견이나 메모를 삭제한다 — 목록에서 사라지며 되돌릴 수 없다. "
                    + "다른 동아리의 의견 ID 로는 접근할 수 없다(404).")
    @DeleteMapping("/admin/fees/{clubId}/audit-comments/{commentId}")
    ResponseEntity<ApiResponse<Void>> deleteFeeAuditComment(
            @Parameter(description = "대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "삭제할 의견·메모 ID", required = true)
            @PathVariable Long commentId
    );
}

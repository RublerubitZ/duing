package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.response.AdminFeeClubDetailResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeClubSummaryResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeDashboardResponse;
import com.duing.domain.fee.service.dto.query.AdminFeeClubSort;
import com.duing.domain.fee.service.dto.query.AdminFeeUsageFilter;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "회비 감사(총동연)",
        description = "총동연 전용 회비 감사 콘솔 API — 전 동아리 회비 현황·전체 KPI·동아리별 상세 지표. "
                + "감사자는 열람만 한다 — 이 API 로 회비 데이터를 바꿀 수 있는 경로는 없다.")
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
}

package com.duing.domain.adminconsole.api;

import com.duing.domain.adminconsole.controller.dto.response.AdminJobStatusesResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminPendingCountsResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminPendingTrendResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminWeeklyBriefingResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminWeeklyFacilityHeatmapResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "관리자 콘솔(총동연)", description = "총동연 관리자 콘솔 공통 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminConsoleApi {

    @Operation(summary = "미처리 건수 조회", description = "관리자 콘솔 사이드바 뱃지용 도메인별 미처리 건수와 총합")
    @GetMapping("/admin/pending-counts")
    ResponseEntity<ApiResponse<AdminPendingCountsResponse>> getPendingCounts();

    @Operation(summary = "처리 대기 추이 조회",
            description = "총동연 홈 추이 카드용 — 지난 13일 하루 끝 남은 대기 건수(기록 없는 날 null)와 "
                    + "최근 7일 접수·처리 건수(신고·문의·시설 예약·홍보·회장 승계)")
    @GetMapping("/admin/pending-trend")
    ResponseEntity<ApiResponse<AdminPendingTrendResponse>> getPendingTrend();

    @Operation(summary = "자동 작업 상태 조회",
            description = "총동연 홈 자동 작업 카드용 — 모집 자동 마감·미처리 지원 리마인더·학교 시설 예약 수집·"
                    + "학교 반영 확인·문의 보관 기간 파기의 최근 실행 결과와 화면 상태")
    @GetMapping("/admin/job-statuses")
    ResponseEntity<ApiResponse<AdminJobStatusesResponse>> getJobStatuses();

    @Operation(summary = "주간 브리핑 지표 조회",
            description = "총동연 주간 브리핑 '한 주 돌아보기' — 고른 주(KST 월 00:00 ~ 다음 월 00:00)에 접수·처리한 일, "
                    + "그 주 일요일 하루 끝 남은 대기, 모집·회비·공지·정보 확인 활동. weekStart 는 월요일만 받고 "
                    + "진행 중인 주·미래·52주보다 이른 주는 400(code WEEK_NOT_MONDAY·WEEK_NOT_ENDED·WEEK_IN_FUTURE·WEEK_TOO_OLD)")
    @GetMapping("/admin/weekly-briefing")
    ResponseEntity<ApiResponse<AdminWeeklyBriefingResponse>> getWeeklyBriefing(
            @Parameter(description = "그 주 월요일(KST 날짜)", example = "2026-10-26")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart);

    @Operation(summary = "주간 브리핑 시설 히트맵 조회",
            description = "시설별 하루 예약 시간 칸 수(09~22시 1시간 칸, 0~13) — 예약 캘린더(GET /facilities/{id}/availability)의 "
                    + "차단 칸과 같은 판정. 시설은 보관하지 않은 것만 sort_order·id 순. 끝난 주와 진행 중인 이번 주를 받고, "
                    + "다음 주부터·52주보다 이른 주·월요일 아님은 400(code WEEK_NOT_MONDAY·WEEK_IN_FUTURE·WEEK_TOO_OLD)")
    @GetMapping("/admin/weekly-briefing/facility-heatmap")
    ResponseEntity<ApiResponse<AdminWeeklyFacilityHeatmapResponse>> getWeeklyFacilityHeatmap(
            @Parameter(description = "그 주 월요일(KST 날짜)", example = "2026-11-02")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart);
}

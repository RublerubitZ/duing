package com.duing.domain.facilitybooking.api;

import com.duing.domain.facilitybooking.controller.dto.response.AdminCrawlReservationGroupResponse;
import com.duing.domain.facilitybooking.service.AdminCrawlGroupBy;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.YearMonth;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "시설 크롤 현황(총동연)", description = "학교 크롤 예약 원본 열람 — 분류·매칭 확인(읽기 전용)")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFacilityCrawlApi {

    @Operation(summary = "크롤 예약 현황 조회",
            description = "학교 크롤 예약을 정리 기준(동아리별 기본/시설별/시설+날짜별)에 따라 그룹 단위로 페이징 조회한다. "
                    + "동아리별 보기에도 미매칭 주체(학교 행사·부서·기관)가 별도 그룹으로 반드시 포함된다. "
                    + "yearMonth 는 당월·익월만 허용(기본 당월). 차단 여부는 분류를 따른다 — "
                    + "CRAWLED_RESERVATION 은 차단, BASIC_SECURED_TIME 은 비차단(신청 가능)이다.")
    @GetMapping("/admin/facility-crawl/reservations")
    ResponseEntity<ApiResponse<PageResponse<AdminCrawlReservationGroupResponse>>> getCrawlReservations(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth,
            @RequestParam(required = false) Long facilityId,
            @RequestParam(required = false, defaultValue = "CLUB") AdminCrawlGroupBy groupBy,
            @Parameter(hidden = true) Pageable pageable
    );
}

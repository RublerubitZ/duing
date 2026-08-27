package com.duing.domain.facilitybooking.controller;

import com.duing.domain.facilitybooking.api.AdminFacilityCrawlApi;
import com.duing.domain.facilitybooking.controller.dto.response.AdminCrawlReservationGroupResponse;
import com.duing.domain.facilitybooking.service.AdminCrawlGroupBy;
import com.duing.domain.facilitybooking.service.FacilityCrawlAdminQueryService;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.time.YearMonth;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFacilityCrawlController implements AdminFacilityCrawlApi {

    private final FacilityCrawlAdminQueryService crawlAdminQueryService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminCrawlReservationGroupResponse>>> getCrawlReservations(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth,
            @RequestParam(required = false) Long facilityId,
            @RequestParam(required = false, defaultValue = "CLUB") AdminCrawlGroupBy groupBy,
            Pageable pageable
    ) {
        Page<AdminCrawlReservationGroupResponse> page =
                crawlAdminQueryService.getReservations(yearMonth, facilityId, groupBy, pageable);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }
}

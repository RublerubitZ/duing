package com.duing.domain.facility.api;

import com.duing.domain.facility.controller.dto.request.UpdateFacilityBookingOpenDateRequest;
import com.duing.domain.facility.controller.dto.response.AdminFacilityResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "시설 관리(총동연)", description = "시설별 예약 오픈일·마감일 설정")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFacilityApi {

    @Operation(summary = "활성 시설 목록 + 예약 오픈일·마감일",
            description = "sort_order 순. bookingOpenDate null = 닫힘(신청 불가), bookingCloseDate null = 상한 없음(익월 말일).")
    @GetMapping("/admin/facilities")
    ResponseEntity<ApiResponse<List<AdminFacilityResponse>>> listFacilities();

    @Operation(summary = "시설 예약 오픈일·마감일 변경",
            description = "해당 시설의 신청 창을 [max(오픈일, 오늘), min(마감일, 익월 말일)] 로 바꾼다. "
                    + "바디가 곧 새 상태이며 부분 갱신이 아니다 — bookingCloseDate 키 누락은 null 과 같다. "
                    + "bookingOpenDate null = 닫기, bookingCloseDate null = 상한 없음(익월 말일). "
                    + "과거 날짜는 허용(판정은 오늘로 clamp). 오픈일이 오늘+1년 초과이거나, 마감일 ≥ 오픈일이 아니거나, "
                    + "마감일이 익월 말일 이내가 아니면 400. 기존 예약은 영향 없음(신규 신청부터 적용).")
    @PatchMapping("/admin/facilities/{facilityId}/booking-open-date")
    ResponseEntity<ApiResponse<Void>> updateBookingOpenDate(
            @PathVariable Long facilityId,
            @Valid @RequestBody UpdateFacilityBookingOpenDateRequest updateFacilityBookingOpenDateRequest);

    @Operation(summary = "활성 시설 전체 예약 오픈일·마감일 변경",
            description = "아카이브되지 않은 모든 시설에 같은 오픈일·마감일을 한 트랜잭션으로 적용한다 — 부분 적용 상태가 남지 않는다. "
                    + "bookingOpenDate null = 닫기, bookingCloseDate null = 상한 없음(익월 말일). "
                    + "검증은 시설별 변경과 같다 — 마감일 ≥ 오픈일, 마감일은 익월 말일 이내.")
    @PatchMapping("/admin/facilities/booking-open-date")
    ResponseEntity<ApiResponse<Void>> updateAllBookingOpenDate(
            @Valid @RequestBody UpdateFacilityBookingOpenDateRequest updateFacilityBookingOpenDateRequest);
}

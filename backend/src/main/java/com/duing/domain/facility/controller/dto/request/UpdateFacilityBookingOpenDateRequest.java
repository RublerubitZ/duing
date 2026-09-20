package com.duing.domain.facility.controller.dto.request;

import com.duing.domain.facility.service.dto.command.UpdateFacilityBookingOpenDateCommand;
import java.time.LocalDate;

/**
 * 바디가 곧 새 상태다(부분 갱신 아님) — 두 필드 모두 nullable 이고 키 누락은 null 과 같은 의미다.
 * bookingOpenDate null = 닫기, bookingCloseDate null = 상한 없음(익월 말일). 형식 오류(yyyy-MM-dd 아님)는 역직렬화 400.
 */
public record UpdateFacilityBookingOpenDateRequest(LocalDate bookingOpenDate, LocalDate bookingCloseDate) {

    public UpdateFacilityBookingOpenDateCommand toCommand(Long facilityId) {
        return new UpdateFacilityBookingOpenDateCommand(facilityId, bookingOpenDate, bookingCloseDate);
    }
}

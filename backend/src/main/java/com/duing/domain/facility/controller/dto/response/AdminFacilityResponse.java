package com.duing.domain.facility.controller.dto.response;

import com.duing.domain.facility.entity.Facility;
import java.time.LocalDate;

/**
 * 총동연 시설 목록 원소 — 오픈일 설정 화면 전용. bookingOpenDate null = 닫힘(신청 불가),
 * bookingCloseDate null = 상한 없음(익월 말일).
 */
public record AdminFacilityResponse(Long id, String roomName, String location, LocalDate bookingOpenDate,
                                    LocalDate bookingCloseDate) {

    public static AdminFacilityResponse from(Facility facility) {
        return new AdminFacilityResponse(facility.getId(), facility.getRoomName(), facility.getLocation(),
                facility.getBookingOpenDate(), facility.getBookingCloseDate());
    }
}

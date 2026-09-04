package com.duing.domain.facility.controller.dto.response;

import com.duing.domain.facility.entity.Facility;
import java.time.LocalDate;

/** §7.1 활성 시설 목록 원소. room_seq 는 노출하지 않는다. bookingOpenDate null = 닫힘(홈 카드 "예약 준비 중"). */
public record FacilitySummaryResponse(Long id, String roomName, String location,
                                     LocalDate bookingOpenDate) {

    public static FacilitySummaryResponse from(Facility facility) {
        return new FacilitySummaryResponse(facility.getId(), facility.getRoomName(), facility.getLocation(),
                facility.getBookingOpenDate());
    }
}

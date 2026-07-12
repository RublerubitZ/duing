package com.duing.domain.facility.controller.dto.response;

import com.duing.domain.facility.entity.Facility;

/** §7.1 활성 시설 목록 원소. room_seq 는 노출하지 않는다. */
public record FacilitySummaryResponse(Long id, String roomName, String location) {

    public static FacilitySummaryResponse from(Facility facility) {
        return new FacilitySummaryResponse(facility.getId(), facility.getRoomName(), facility.getLocation());
    }
}

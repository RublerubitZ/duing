package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;

public interface FacilityBookingService {

    record CreateResult(Long bookingId, long overlappingPendingCount) {}

    /** 대관 신청 생성(설계 §5.1) — PENDING 겹침은 허용하고 개수만 알린다. */
    CreateResult create(CreateFacilityBookingCommand command);

    /** 신청 동아리의 PENDING 취소(설계 §5.4). */
    void cancel(Long clubId, Long actorId, Long bookingId);
}

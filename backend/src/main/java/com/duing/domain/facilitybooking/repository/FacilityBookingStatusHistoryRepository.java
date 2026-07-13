package com.duing.domain.facilitybooking.repository;

import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** append-only — 삭제/수정 API 를 노출하지 않는다. */
public interface FacilityBookingStatusHistoryRepository
        extends JpaRepository<FacilityBookingStatusHistory, Long> {

    List<FacilityBookingStatusHistory> findByBookingIdOrderByCreatedAtDesc(Long bookingId);
}

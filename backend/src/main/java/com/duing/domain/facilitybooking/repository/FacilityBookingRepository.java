package com.duing.domain.facilitybooking.repository;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilityBookingRepository extends JpaRepository<FacilityBooking, Long> {

    /** 시설·날짜·시간 겹침(반개구간) 조회 — 가용성/신청 검증용. 경계 접촉(끝==시작)은 겹침 아님. */
    @Query("SELECT b FROM FacilityBooking b "
            + "WHERE b.facilityId = :facilityId AND b.reservationDate = :date "
            + "AND b.status IN :statuses "
            + "AND b.startTime < :endTime AND b.endTime > :startTime")
    List<FacilityBooking> findOverlapping(@Param("facilityId") Long facilityId,
                                          @Param("date") LocalDate date,
                                          @Param("statuses") Collection<BookingStatus> statuses,
                                          @Param("startTime") LocalTime startTime,
                                          @Param("endTime") LocalTime endTime);

    /** 같은 동아리의 시간 겹침 신청(중복 신청 차단용). */
    @Query("SELECT b FROM FacilityBooking b "
            + "WHERE b.clubId = :clubId AND b.reservationDate = :date "
            + "AND b.status IN :statuses "
            + "AND b.startTime < :endTime AND b.endTime > :startTime")
    List<FacilityBooking> findClubOverlapping(@Param("clubId") Long clubId,
                                              @Param("date") LocalDate date,
                                              @Param("statuses") Collection<BookingStatus> statuses,
                                              @Param("startTime") LocalTime startTime,
                                              @Param("endTime") LocalTime endTime);

    List<FacilityBooking> findByFacilityIdAndReservationDateBetweenAndStatusIn(
            Long facilityId, LocalDate startDate, LocalDate endDate, Collection<BookingStatus> statuses);

    /** 자동 매칭 대상 조회 — 특정 상태(APPROVED)·예약일 구간의 신청 전체. */
    List<FacilityBooking> findByStatusAndReservationDateBetween(
            BookingStatus status, LocalDate startDate, LocalDate endDate);

    long countByClubIdAndStatusIn(Long clubId, Collection<BookingStatus> statuses);

    List<FacilityBooking> findByClubIdOrderByCreatedAtDesc(Long clubId);

    List<FacilityBooking> findByClubIdAndStatusOrderByCreatedAtDesc(Long clubId, BookingStatus status);

    Optional<FacilityBooking> findByIdAndClubId(Long id, Long clubId);
}

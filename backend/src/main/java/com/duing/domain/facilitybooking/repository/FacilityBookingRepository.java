package com.duing.domain.facilitybooking.repository;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilityBookingRepository
        extends JpaRepository<FacilityBooking, Long>, FacilityBookingRepositoryCustom {

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

    /** 학교 제출 준비 전 시설 조회(제출 스펙 §5.1 v3) — 기간·상태 조건, 시설 무제한. */
    List<FacilityBooking> findByReservationDateBetweenAndStatusIn(
            LocalDate startDate, LocalDate endDate, Collection<BookingStatus> statuses);

    /** 자동 매칭 대상 조회 — 특정 상태(APPROVED)·예약일 구간의 신청 전체. */
    List<FacilityBooking> findByStatusAndReservationDateBetween(
            BookingStatus status, LocalDate startDate, LocalDate endDate);

    long countByClubIdAndStatusIn(Long clubId, Collection<BookingStatus> statuses);

    List<FacilityBooking> findByClubIdOrderByCreatedAtDesc(Long clubId);

    List<FacilityBooking> findByClubIdAndStatusOrderByCreatedAtDesc(Long clubId, BookingStatus status);

    Optional<FacilityBooking> findByIdAndClubId(Long id, Long clubId);

    /** 관리자 대시보드 카운트(§5.5) — 상태별 전체 건수. */
    long countByStatus(BookingStatus status);

    /**
     * 오늘 접수(생성) 건수 — 상태 무관(처리 완료돼도 오늘 접수는 접수). createdAt 은 JPA 감사가 저장 존(JVM 기본)
     * 으로 기록하므로, 호출부가 KST 하루 경계를 같은 저장 존 LocalDateTime 으로 변환해 넘긴다(§9.7·§5.3).
     */
    long countByCreatedAtBetween(LocalDateTime from, LocalDateTime to);

    /** 이달 확정 건수 — 예약일(reservationDate) 기준 월 구간. */
    long countByStatusAndReservationDateBetween(BookingStatus status, LocalDate from, LocalDate to);

    /** 가장 오래 대기 중인 APPROVED — decidedAt 최소(최고령). 대기 경과일 계산용. */
    Optional<FacilityBooking> findFirstByStatusOrderByDecidedAtAsc(BookingStatus status);

    /** 가장 오래된 PENDING — createdAt 최소(최고령). 승인 대기 경과일 계산용(§9.7). */
    Optional<FacilityBooking> findFirstByStatusOrderByCreatedAtAsc(BookingStatus status);

    /** 학교 제출 생성의 중복 방지 직렬화(제출 스펙 §4) — ID 오름차순 잠금으로 상호 데드락을 차단한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM FacilityBooking b WHERE b.id IN :bookingIds ORDER BY b.id ASC")
    List<FacilityBooking> findAllByIdInForUpdate(@Param("bookingIds") Collection<Long> bookingIds);
}

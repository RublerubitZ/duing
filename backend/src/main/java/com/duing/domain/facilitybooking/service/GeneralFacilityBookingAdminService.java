package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilityBookingAdminService implements FacilityBookingAdminService {

    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityBookingStatusHistoryRepository historyRepository;
    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final Clock clock;

    @Override
    @Transactional
    public void approve(Long adminId, Long bookingId) {
        FacilityBooking booking = getBooking(bookingId);
        // 시설 단위 승인 직렬화(§5.2) — 겹치는 두 신청의 동시 승인을 잠금으로 차단, EXCLUDE 는 최종 백스톱
        facilityRepository.findByIdForUpdate(booking.getFacilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        rejectIfSchoolOccupied(booking);
        rejectIfInternallyBlocked(booking);

        BookingStatus previousStatus = booking.getStatus();
        LocalDateTime crawlBasisAt = latestCrawlBasis(YearMonth.from(booking.getReservationDate()));
        booking.approve(adminId, crawlBasisAt, LocalDateTime.now(clock));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.APPROVED, adminId, null, crawlBasisAt));
    }

    @Override
    @Transactional
    public void reject(Long adminId, Long bookingId, String reason) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.reject(adminId, reason, LocalDateTime.now(clock));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.REJECTED, adminId, reason, null));
    }

    @Override
    @Transactional
    public void confirmManually(Long adminId, Long bookingId) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.confirmManually(LocalDateTime.now(clock));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CONFIRMED, adminId, "관리자 수동 확정", null));
    }

    @Override
    @Transactional
    public void markConflict(Long adminId, Long bookingId, String detail) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.markConflict(detail);
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CONFLICT, adminId, detail, null));
    }

    @Override
    @Transactional
    public void cancel(Long adminId, Long bookingId, String reason) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.cancelByAdmin();
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CANCELLED, adminId, reason, null));
    }

    private FacilityBooking getBooking(Long bookingId) {
        return facilityBookingRepository.findById(bookingId)
                .orElseThrow(FacilityBookingException.BookingNotFoundException::new);
    }

    /** 크롤 점유행 겹침 — 승인 불가(§5.2-2c-①). 판별은 정책 경유(컬럼 접근 금지 계약). */
    private void rejectIfSchoolOccupied(FacilityBooking booking) {
        boolean blocked = facilityReservationRepository
                .findByFacilityIdAndYearMonth(booking.getFacilityId(),
                        YearMonth.from(booking.getReservationDate())).stream()
                .filter(reservation -> reservation.getReservationDate().equals(booking.getReservationDate()))
                .filter(reservation -> availabilityPolicy.classify(reservation) == CrawlRowType.OCCUPIED)
                .anyMatch(reservation -> reservation.getStartTime().isBefore(booking.getEndTime())
                        && reservation.getEndTime().isAfter(booking.getStartTime()));
        if (blocked) {
            throw new FacilityBookingException.SchoolConflictException();
        }
    }

    /** 내부 APPROVED/CONFIRMED 겹침 — 승인 불가(§5.2-2c-②). 자기 자신은 제외(CONFLICT 재승인 경로). */
    private void rejectIfInternallyBlocked(FacilityBooking booking) {
        boolean blocked = facilityBookingRepository.findOverlapping(
                        booking.getFacilityId(), booking.getReservationDate(),
                        List.of(BookingStatus.APPROVED, BookingStatus.CONFIRMED),
                        booking.getStartTime(), booking.getEndTime()).stream()
                .anyMatch(other -> !other.getId().equals(booking.getId()));
        if (blocked) {
            throw new FacilityBookingException.SlotUnavailableException();
        }
    }

    /** 검증에 사용한 크롤 스냅샷 기준 시각(§5.2) — 감사 기록용. 스냅샷이 없으면 null. */
    private LocalDateTime latestCrawlBasis(YearMonth yearMonth) {
        return facilityMonthSnapshotRepository.findByYearMonth(yearMonth)
                .map(snapshot -> snapshot.getCrawledAt())
                .orElse(null);
    }
}

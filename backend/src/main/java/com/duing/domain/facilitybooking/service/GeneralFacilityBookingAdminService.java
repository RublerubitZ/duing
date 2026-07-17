package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.exception.FacilityException;
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
import java.util.Comparator;
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
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final Clock clock;

    @Override
    @Transactional
    public void approve(Long adminId, Long bookingId) {
        FacilityBooking booking = getBooking(bookingId);
        // 시설 단위 승인 직렬화(§5.2) — 겹치는 두 신청의 동시 승인을 잠금으로 차단, EXCLUDE 는 최종 백스톱
        facilityRepository.findByIdForUpdate(booking.getFacilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        // 단일 조회 목록에서 basis·검증·payload 를 함께 계산 — 쿼리 간 크롤 세대 교체로 감사값이 분리되는 것을 차단.
        List<FacilityReservation> monthRows = facilityReservationRepository.findByFacilityIdAndYearMonth(
                booking.getFacilityId(), YearMonth.from(booking.getReservationDate()));
        LocalDateTime crawlBasisAt = facilityCrawlBasis(monthRows);
        rejectIfSchoolOccupied(booking, monthRows, crawlBasisAt);
        rejectIfInternallyBlocked(booking);

        BookingStatus previousStatus = booking.getStatus();
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
        // 수동 확정은 '이 학교 점유행이 우리 예약의 등록 행'이라는 관리자 판단을 반영하는 오버라이드 경로다(§5.3).
        // 본래 시나리오(표기 차이로 자동 매칭 불발)에서는 자기 등록 행이 점유행으로 존재할 수밖에 없어,
        // 승인과 같은 학교 점유 재검증을 걸면 수동 확정이 필요한 모든 경우가 409 로 막힌다(2026-07-17 감사).
        // 시설 행 잠금(무방비 CONFIRMED 진입 차단)과 내부 APPROVED/CONFIRMED 겹침 재검증은 유지하고,
        // 판정 근거 크롤 세대(crawlBasisAt)는 이력에 계속 남긴다.
        facilityRepository.findByIdForUpdate(booking.getFacilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        List<FacilityReservation> monthRows = facilityReservationRepository.findByFacilityIdAndYearMonth(
                booking.getFacilityId(), YearMonth.from(booking.getReservationDate()));
        LocalDateTime crawlBasisAt = facilityCrawlBasis(monthRows);
        rejectIfInternallyBlocked(booking);

        BookingStatus previousStatus = booking.getStatus();
        booking.confirmManually(LocalDateTime.now(clock));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CONFIRMED, adminId, "관리자 수동 확정", crawlBasisAt));
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

    /**
     * 크롤 점유행 겹침 — 승인 불가(§5.2-2c-①). 판별은 정책 경유(컬럼 접근 금지 계약).
     * 겹치는 점유행 전부를 payload(§8.3 data.conflicts[])로 실어 던져 FE 가 충돌 상세를 렌더할 수 있게 한다.
     * 수동 확정은 자기 등록 행을 구분할 수 없어 이 검증을 걸지 않는다(관리자 오버라이드, 2026-07-17 감사).
     */
    private void rejectIfSchoolOccupied(FacilityBooking booking, List<FacilityReservation> monthRows,
            LocalDateTime crawlBasisAt) {
        List<FacilityBookingException.SchoolConflictException.ConflictItem> conflicts =
                monthRows.stream()
                        .filter(reservation -> reservation.getReservationDate().equals(booking.getReservationDate()))
                        .filter(reservation -> availabilityPolicy.classify(reservation) == CrawlRowType.OCCUPIED)
                        .filter(reservation -> reservation.getStartTime().isBefore(booking.getEndTime())
                                && reservation.getEndTime().isAfter(booking.getStartTime()))
                        .map(reservation -> new FacilityBookingException.SchoolConflictException.ConflictItem(
                                reservation.getOrganizationName(),
                                reservation.getStartTime(), reservation.getEndTime()))
                        .toList();
        if (!conflicts.isEmpty()) {
            throw new FacilityBookingException.SchoolConflictException(conflicts, crawlBasisAt);
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

    /**
     * 검증에 실제 사용한 크롤 행 세대(§5.2) — 검증·payload 와 동일한 단일 조회 목록(monthRows)의 crawledAt
     * 최대값(시설별 원자 교체라 사실상 단일 세대), 행이 없으면 null. 월 메타(스냅샷)가 아니라 시설 행 세대를
     * 기록한다: PARTIAL 크롤에서 월 메타가 시설 행보다 새로울 수 있어, 승인·확정 검증(rejectIfSchoolOccupied)에
     * 실제 사용한 행의 세대를 감사·payload 에 남긴다.
     */
    private LocalDateTime facilityCrawlBasis(List<FacilityReservation> monthRows) {
        return monthRows.stream()
                .map(FacilityReservation::getCrawledAt)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }
}

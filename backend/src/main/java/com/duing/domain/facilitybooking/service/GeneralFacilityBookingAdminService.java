package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
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
import com.duing.domain.notification.event.FacilityBookingApprovedEvent;
import com.duing.domain.notification.event.FacilityBookingCancelledEvent;
import com.duing.domain.notification.event.FacilityBookingConfirmedEvent;
import com.duing.domain.notification.event.FacilityBookingConflictEvent;
import com.duing.domain.notification.event.FacilityBookingRejectedEvent;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
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
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    @Override
    @Transactional
    public void approve(Long adminId, Long bookingId) {
        FacilityBooking booking = getBooking(bookingId);
        // 시설 단위 승인 직렬화(§5.2) — 겹치는 두 신청의 동시 승인을 잠금으로 차단, EXCLUDE 는 최종 백스톱
        Facility facility = facilityRepository.findByIdForUpdate(booking.getFacilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        rejectIfArchived(facility);
        // 단일 조회 목록에서 basis·검증·payload 를 함께 계산 — 쿼리 간 크롤 세대 교체로 감사값이 분리되는 것을 차단.
        YearMonth month = YearMonth.from(booking.getReservationDate());
        List<FacilityReservation> monthRows =
                facilityReservationRepository.findByFacilityIdAndYearMonth(booking.getFacilityId(), month);
        Set<String> securedOrganizationKeys =
                monthRows.isEmpty() ? Set.of() : availabilityPolicy.securedOrganizationKeys();
        LocalDateTime crawlBasisAt = facilityCrawlBasis(booking.getFacilityId(), month, monthRows);
        rejectIfSchoolOccupied(booking, monthRows, crawlBasisAt, securedOrganizationKeys);
        rejectIfInternallyBlocked(booking);

        BookingStatus previousStatus = booking.getStatus();
        booking.approve(adminId, crawlBasisAt, LocalDateTime.now(clock));
        FacilityBookingStatusHistory approvalHistory = historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.APPROVED, adminId, null, crawlBasisAt));
        eventPublisher.publishEvent(new FacilityBookingApprovedEvent(
                booking.getId(), booking.getClubId(), approvalHistory.getId()));
    }

    @Override
    @Transactional
    public void reject(Long adminId, Long bookingId, String reason) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.reject(adminId, reason, LocalDateTime.now(clock));
        FacilityBookingStatusHistory rejectionHistory = historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.REJECTED, adminId, reason, null));
        eventPublisher.publishEvent(new FacilityBookingRejectedEvent(
                booking.getId(), booking.getClubId(), rejectionHistory.getId(), reason));
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
        Facility facility = facilityRepository.findByIdForUpdate(booking.getFacilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        rejectIfArchived(facility);
        YearMonth month = YearMonth.from(booking.getReservationDate());
        List<FacilityReservation> monthRows =
                facilityReservationRepository.findByFacilityIdAndYearMonth(booking.getFacilityId(), month);
        LocalDateTime crawlBasisAt = facilityCrawlBasis(booking.getFacilityId(), month, monthRows);
        rejectIfInternallyBlocked(booking);

        BookingStatus previousStatus = booking.getStatus();
        booking.confirmManually(LocalDateTime.now(clock));
        FacilityBookingStatusHistory confirmationHistory = historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CONFIRMED, adminId, "관리자 수동 확정", crawlBasisAt));
        eventPublisher.publishEvent(new FacilityBookingConfirmedEvent(
                booking.getId(), booking.getClubId(), confirmationHistory.getId()));
    }

    @Override
    @Transactional
    public void markConflict(Long adminId, Long bookingId, String detail) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.markConflict(detail);
        FacilityBookingStatusHistory conflictHistory = historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CONFLICT, adminId, detail, null));
        eventPublisher.publishEvent(new FacilityBookingConflictEvent(
                booking.getId(), booking.getClubId(), conflictHistory.getId(), detail));
    }

    @Override
    @Transactional
    public void cancel(Long adminId, Long bookingId, String reason) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.cancelByAdmin();
        FacilityBookingStatusHistory cancellationHistory = historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CANCELLED, adminId, reason, null));
        eventPublisher.publishEvent(new FacilityBookingCancelledEvent(
                booking.getId(), booking.getClubId(), cancellationHistory.getId(), reason));
    }

    private FacilityBooking getBooking(Long bookingId) {
        return facilityBookingRepository.findById(bookingId)
                .orElseThrow(FacilityBookingException.BookingNotFoundException::new);
    }

    /** 아카이브 시설 가드 — 시설 잠금 하 재검증이라 일일 동기화의 archive 전이와 직렬화된다(2026-07-17 감사).
     *  자동 매칭(FacilityBookingMatchingService)의 동일 가드와 대칭으로 아카이브 시설에 APPROVED/CONFIRMED
     *  진입 경로를 전부 닫는다 — 단 실패 표출은 다르다(잡은 로그 후 스킵, 동기 관리자 요청은 409 즉시 응답).
     *  제출 배치 완료(GeneralFacilitySubmissionService.complete)는 예약 잠금을 먼저 잡는 경로라 시설 잠금 없이
     *  아카이브를 확인해 스킵한다 — 시설→예약 잠금 순서 역전(교착) 회피, 창은 일일 동기화 1회뿐(P2-07). */
    private void rejectIfArchived(Facility facility) {
        if (facility.isArchived()) {
            throw new FacilityBookingException.ArchivedFacilityConflictException();
        }
    }

    /**
     * 크롤 점유행 겹침 — 승인 불가(§5.2-2c-①). 판별은 정책 경유(컬럼 접근 금지 계약).
     * 겹치는 점유행 전부를 payload(§8.3 data.conflicts[])로 실어 던져 FE 가 충돌 상세를 렌더할 수 있게 한다 —
     * 확보 분류 행은 비차단이라 승인 불가 사유가 아니므로 판정·payload 양쪽에서 제외된다(2026-08-27).
     * 수동 확정은 자기 등록 행을 구분할 수 없어 이 검증을 걸지 않는다(관리자 오버라이드, 2026-07-17 감사).
     */
    private void rejectIfSchoolOccupied(FacilityBooking booking, List<FacilityReservation> monthRows,
            LocalDateTime crawlBasisAt, Set<String> securedOrganizationKeys) {
        List<FacilityBookingException.SchoolConflictException.ConflictItem> conflicts =
                availabilityPolicy.blockingOverlapping(monthRows, booking.getReservationDate(),
                                booking.getStartTime(), booking.getEndTime(), securedOrganizationKeys)
                        .map(reservation -> new FacilityBookingException.SchoolConflictException.ConflictItem(
                                reservation.getOrganizationName(),
                                reservation.getStartTime(), reservation.getEndTime()))
                        .toList();
        if (!conflicts.isEmpty()) {
            throw new FacilityBookingException.SchoolConflictException(conflicts, crawlBasisAt);
        }
    }

    /** 내부 APPROVED/CONFIRMED 겹침 — 승인·수동 확정 불가(§5.2-2c-②). 자기 자신은 제외(CONFLICT 재승인 경로). */
    private void rejectIfInternallyBlocked(FacilityBooking booking) {
        boolean blocked = facilityBookingRepository.findOverlapping(
                        booking.getFacilityId(), booking.getReservationDate(),
                        BookingStatus.slotBlockingStatuses(),
                        booking.getStartTime(), booking.getEndTime()).stream()
                .anyMatch(other -> !other.getId().equals(booking.getId()));
        if (blocked) {
            throw new FacilityBookingException.SlotUnavailableException();
        }
    }

    /**
     * 검증에 실제 사용한 크롤 세대(§5.2). 이 시설이 최신 세대에 수집 성공했으면 그 세대의 수집 시각을 남긴다 —
     * 월 메타가 시설 행보다 새로울 수 있다는 문제(PARTIAL 크롤)는 시설 단위 성공 여부로 판별한다.
     * 수집이 실패·스킵돼 구세대 행이 잔존하는 시설은 실제로 보유한 행의 최종 반영 시각으로 폴백하고,
     * 행도 없으면 null 이다. 예약 행은 변경분만 차등 반영되므로 행의 crawledAt 은 "마지막 성공 수집"이
     * 아니라 "마지막 내용 변경" 시각이라, 최신 세대에서는 스냅샷 세대를 쓰는 쪽이 정확하다.
     */
    private LocalDateTime facilityCrawlBasis(Long facilityId, YearMonth month, List<FacilityReservation> monthRows) {
        return facilityMonthSnapshotRepository.findByYearMonth(month)
                .filter(snapshot -> snapshot.isFacilitySynced(facilityId))
                .map(FacilityMonthSnapshot::getCrawledAt)
                .orElseGet(() -> monthRows.stream()
                        .map(FacilityReservation::getCrawledAt)
                        .max(Comparator.naturalOrder())
                        .orElse(null));
    }
}

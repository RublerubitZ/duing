package com.duing.domain.facilitybooking.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilityBookingService implements FacilityBookingService {

    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityBookingStatusHistoryRepository historyRepository;
    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final BookingPolicyValidator bookingPolicyValidator;
    private final ClubAuthService clubAuthService;
    private final ClubRepository clubRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public CreateResult create(CreateFacilityBookingCommand command) {
        // 같은 동아리의 생성을 직렬화한다. 활성 상한(count)·동아리 중복 검사가 무잠금 read-then-insert 라
        // 동시 요청이 상한 10건과 동아리 중복 검사를 함께 우회할 수 있다 — DB EXCLUDE 제약은
        // APPROVED/CONFIRMED 만 커버하고 PENDING 겹침은 커버하지 않는다. 동아리 행을 비관 잠금해
        // 같은 동아리의 create 만 순차화하고 다른 동아리 간 병렬성은 유지한다.
        // 잠금을 권한 게이트보다 먼저 잡는 순서가 중요하다(2026-07-17 감사) — requireManager 의 ACTIVE
        // 판정은 무잠금 조회라 운영 중단 전환(updateStatus, findByIdForUpdate)과 경합하면 INACTIVE 동아리에
        // PENDING 이 남는다. 잠금 선행 시 requireManager 의 findById 는 1차 캐시의 잠긴 엔티티를 재사용하고,
        // 잠근 엔티티로 ACTIVE 를 원자 재검사한다(모집 생성 requireActiveClubUnderLock 전례).
        Club club = clubRepository.findByIdForUpdate(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);
        clubAuthService.requireManager(command.actorId(), command.clubId());
        requireActiveClubUnderLock(club);
        Facility facility = facilityRepository.findById(command.facilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        if (facility.isArchived()) {
            throw new FacilityBookingException.ArchivedFacilityException();
        }

        bookingPolicyValidator.validateSlotRange(command.date(), command.startTime(), command.endTime());
        bookingPolicyValidator.validateActiveCap(facilityBookingRepository.countByClubIdAndStatusIn(
                command.clubId(), List.of(BookingStatus.PENDING, BookingStatus.APPROVED)));

        rejectIfBlockedBySchool(command);
        rejectIfBlockedInternally(command);
        rejectIfClubDuplicate(command);

        FacilityBooking booking = facilityBookingRepository.save(FacilityBooking.request(
                command.facilityId(), command.clubId(), command.actorId(),
                command.date(), command.startTime(), command.endTime(),
                command.purpose(), command.attendeeCount(), command.contactPhone()));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), null, BookingStatus.PENDING, command.actorId(), null, null));
        // 접수 알림(스펙 §7.6) — AFTER_COMMIT 리스너가 ADMIN 전원에게 dedup 멱등 발행
        eventPublisher.publishEvent(new FacilityBookingSubmittedEvent(booking.getId(), command.clubId()));

        long overlappingPending = facilityBookingRepository.findOverlapping(
                        command.facilityId(), command.date(), List.of(BookingStatus.PENDING),
                        command.startTime(), command.endTime()).stream()
                .filter(other -> !other.getId().equals(booking.getId()))
                .count();
        return new CreateResult(booking.getId(), overlappingPending);
    }

    @Override
    @Transactional
    public void cancel(Long clubId, Long actorId, Long bookingId) {
        clubAuthService.requireManager(actorId, clubId);
        FacilityBooking booking = facilityBookingRepository.findByIdAndClubId(bookingId, clubId)
                .orElseThrow(FacilityBookingException.BookingNotFoundException::new);
        BookingStatus previousStatus = booking.getStatus();
        booking.cancelByClub();
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CANCELLED, actorId, null, null));
    }

    @Override
    public List<BookingSummaryResult> getBookings(Long clubId, Long actorId, BookingStatus status) {
        clubAuthService.requireManager(actorId, clubId);
        List<FacilityBooking> bookings = status != null
                ? facilityBookingRepository.findByClubIdAndStatusOrderByCreatedAtDesc(clubId, status)
                : facilityBookingRepository.findByClubIdOrderByCreatedAtDesc(clubId);
        Map<Long, String> roomNames = roomNames(bookings);
        return bookings.stream()
                .map(booking -> new BookingSummaryResult(booking.getId(), booking.getFacilityId(),
                        roomNames.getOrDefault(booking.getFacilityId(), ""), booking.getReservationDate(),
                        booking.getStartTime(), booking.getEndTime(), booking.getStatus(),
                        booking.getPurpose(), booking.getCreatedAt()))
                .toList();
    }

    @Override
    public BookingDetailResult getBooking(Long clubId, Long actorId, Long bookingId) {
        clubAuthService.requireManager(actorId, clubId);
        FacilityBooking booking = facilityBookingRepository.findByIdAndClubId(bookingId, clubId)
                .orElseThrow(FacilityBookingException.BookingNotFoundException::new);
        String roomName = facilityRepository.findById(booking.getFacilityId())
                .map(Facility::getRoomName).orElse("");
        List<HistoryEntry> history = historyRepository.findByBookingIdOrderByCreatedAtDesc(bookingId).stream()
                .map(entry -> new HistoryEntry(entry.getPreviousStatus(), entry.getNewStatus(),
                        entry.getReason(), entry.getCreatedAt()))
                .toList();
        return new BookingDetailResult(booking.getId(), booking.getFacilityId(), roomName,
                booking.getReservationDate(), booking.getStartTime(), booking.getEndTime(),
                booking.getStatus(), booking.getPurpose(), booking.getAttendeeCount(),
                blankToNull(booking.getContactPhone()),
                booking.getRejectReason(), booking.getConflictDetail(), history);
    }

    /** 기존 행(빈 문자열)은 응답에서 null 로 내린다(FE "—" 표기 폴백, 설계 §1). */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /**
     * 운영 중(ACTIVE) 동아리만 신청 가능 — findByIdForUpdate 로 잠근 club 을 전달해야 운영 중단 전환과
     * 직렬화된다. requireManager 에 내장된 기본 게이트는 잠금 없이 판정하므로 이 원자 재검사를 대체하지
     * 못한다(모집 생성 GeneralRecruitmentService 전례와 동일 근거, 2026-07-17 감사).
     */
    private void requireActiveClubUnderLock(Club club) {
        if (club.getStatus() != ClubStatus.ACTIVE) {
            throw new ClubMemberException.NotActiveClub(club.getStatus());
        }
    }

    private Map<Long, String> roomNames(List<FacilityBooking> bookings) {
        return facilityRepository.findAllById(
                        bookings.stream().map(FacilityBooking::getFacilityId).distinct().toList()).stream()
                .collect(Collectors.toMap(Facility::getId, Facility::getRoomName, (first, second) -> first));
    }

    /**
     * 크롤 점유행과의 겹침 차단. 신청 시점 검증은 저장된 스냅샷 기준(온디맨드 재크롤 없음) —
     * 명백히 불가능한 신청만 거르는 1차 게이트이고, 정합성의 최종 게이트는 승인 재검증(PR2)이다(설계 §5.1).
     */
    private void rejectIfBlockedBySchool(CreateFacilityBookingCommand command) {
        boolean blocked = facilityReservationRepository
                .findByFacilityIdAndYearMonth(command.facilityId(), YearMonth.from(command.date())).stream()
                .filter(reservation -> reservation.getReservationDate().equals(command.date()))
                .filter(reservation -> availabilityPolicy.classify(reservation) == CrawlRowType.OCCUPIED)
                .anyMatch(reservation -> reservation.getStartTime().isBefore(command.endTime())
                        && reservation.getEndTime().isAfter(command.startTime()));
        if (blocked) {
            throw new FacilityBookingException.SlotUnavailableException();
        }
    }

    private void rejectIfBlockedInternally(CreateFacilityBookingCommand command) {
        boolean blocked = !facilityBookingRepository.findOverlapping(
                command.facilityId(), command.date(),
                List.of(BookingStatus.APPROVED, BookingStatus.CONFIRMED),
                command.startTime(), command.endTime()).isEmpty();
        if (blocked) {
            throw new FacilityBookingException.SlotUnavailableException();
        }
    }

    private void rejectIfClubDuplicate(CreateFacilityBookingCommand command) {
        boolean duplicate = !facilityBookingRepository.findClubOverlapping(
                command.clubId(), command.date(),
                List.of(BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.CONFIRMED),
                command.startTime(), command.endTime()).isEmpty();
        if (duplicate) {
            throw new FacilityBookingException.DuplicateClubBookingException();
        }
    }
}

package com.duing.domain.facilitybooking.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingSearchCondition;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

/**
 * 관리자 큐·상세·대시보드 조회. 클래스 레벨 @Transactional 금지 — getDetail 이 ensureFresh(온디맨드
 * 크롤 쓰기)를 호출하는 무트랜잭션 오케스트레이션이다(§7.3 readOnly 함정, 가용성 서비스와 동일 원칙).
 * readOnly 트랜잭션에 편승시키면 PostgreSQL 25006(read-only 트랜잭션 내 DELETE 금지)로 500 을 유발한다.
 * 각 조회는 리포지토리 단건 호출로 자체 트랜잭션을 가지며 다중 쿼리 정합 요구가 없다.
 */
@Service
@RequiredArgsConstructor
public class FacilityBookingAdminQueryService {

    // 신선도 판정 TTL — 가용성 서비스(GeneralFacilityAvailabilityService.isStale)와 동일 값.
    private static final Duration FRESH_TTL = Duration.ofMinutes(10);

    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityBookingStatusHistoryRepository historyRepository;
    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityCrawlService facilityCrawlService;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final OrganizationNameNormalizer normalizer;
    private final ClubRepository clubRepository;
    private final Clock clock;

    public record AdminBookingSummaryResult(Long bookingId, Long clubId, String clubName,
            Long facilityId, String roomName, LocalDate date, LocalTime startTime, LocalTime endTime,
            BookingStatus status, String purpose, LocalDateTime createdAt,
            Integer approvedWaitingDays, boolean conflictSuspected) {}

    public record OverlapContext(String source, String organization, LocalTime startTime, LocalTime endTime) {}

    public record AdminBookingDetailResult(Long bookingId, Long clubId, String clubName,
            Long facilityId, String roomName, LocalDate date, LocalTime startTime, LocalTime endTime,
            BookingStatus status, String purpose, Integer attendeeCount, String rejectReason,
            String conflictDetail, Long matchedScheduleSeq,
            LocalDateTime crawlBasisAt, boolean stale,
            List<OverlapContext> overlaps, long overlappingPendingCount,
            List<FacilityBookingService.HistoryEntry> history) {}

    public record AdminBookingSummaryCounts(long pendingCount, long todaySubmittedCount,
            long approvedWaitingCount, long oldestApprovedWaitingDays,
            long conflictCount, long confirmedThisMonthCount) {}

    /** (시설,월) 크롤 행 캐시 키 — 큐 한 페이지 내 같은 조합을 1회만 조회하기 위한 것. */
    private record FacilityMonthKey(Long facilityId, YearMonth yearMonth) {}

    public Page<AdminBookingSummaryResult> getQueue(AdminBookingSearchCondition condition, Pageable pageable) {
        Page<FacilityBooking> page = facilityBookingRepository.searchForAdmin(condition, pageable);
        List<FacilityBooking> bookings = page.getContent();

        Map<Long, String> clubNames = clubNames(bookings);
        Map<Long, String> roomNames = roomNames(bookings);
        // (시설,월) 크롤 행은 페이지 내 조합당 1회만 조회한다(N+1 금지).
        Map<FacilityMonthKey, List<FacilityReservation>> crawlCache = new HashMap<>();
        LocalDate today = LocalDate.now(clock);

        return page.map(booking -> toSummary(booking, clubNames, roomNames, crawlCache, today));
    }

    public AdminBookingDetailResult getDetail(Long bookingId) {
        FacilityBooking booking = facilityBookingRepository.findById(bookingId)
                .orElseThrow(FacilityBookingException.BookingNotFoundException::new);
        LocalDate date = booking.getReservationDate();
        YearMonth month = YearMonth.from(date);

        // ① 신선도 보장 시도 후, 반환 DataSource + 스냅샷으로 stale 판정(가용성 서비스와 동일 규칙).
        DataSource source = facilityCrawlService.ensureFresh(month);
        FacilityMonthSnapshot snapshot = facilityMonthSnapshotRepository.findByYearMonth(month).orElse(null);
        LocalDateTime crawlBasisAt = snapshot != null ? snapshot.getCrawledAt() : null;
        boolean stale = isStale(crawlBasisAt, snapshot != null ? snapshot.getFetchStatus() : null, source);

        // ② 겹침 컨텍스트.
        List<OverlapContext> overlaps = new ArrayList<>();
        // 점유행(SCHOOL) — 학교 단체명 그대로 노출.
        facilityReservationRepository.findByFacilityIdAndYearMonth(booking.getFacilityId(), month).stream()
                .filter(row -> row.getReservationDate().equals(date))
                .filter(row -> availabilityPolicy.classify(row) == CrawlRowType.OCCUPIED)
                .filter(row -> row.getStartTime().isBefore(booking.getEndTime())
                        && row.getEndTime().isAfter(booking.getStartTime()))
                .forEach(row -> overlaps.add(new OverlapContext(
                        "SCHOOL", row.getOrganizationName(), row.getStartTime(), row.getEndTime())));
        // 내부 APPROVED/CONFIRMED(자기 제외) — 관리자 화면은 내부용이므로 동아리명을 노출한다.
        List<FacilityBooking> internalOverlaps = facilityBookingRepository.findOverlapping(
                        booking.getFacilityId(), date,
                        List.of(BookingStatus.APPROVED, BookingStatus.CONFIRMED),
                        booking.getStartTime(), booking.getEndTime()).stream()
                .filter(other -> !other.getId().equals(booking.getId()))
                .toList();
        Map<Long, String> internalClubNames = clubNames(internalOverlaps);
        internalOverlaps.forEach(other -> overlaps.add(new OverlapContext(
                "INTERNAL", internalClubNames.getOrDefault(other.getClubId(), ""),
                other.getStartTime(), other.getEndTime())));

        // ③ 겹치는 PENDING 개수(자기 제외).
        long overlappingPendingCount = facilityBookingRepository.findOverlapping(
                        booking.getFacilityId(), date, List.of(BookingStatus.PENDING),
                        booking.getStartTime(), booking.getEndTime()).stream()
                .filter(other -> !other.getId().equals(booking.getId()))
                .count();

        List<FacilityBookingService.HistoryEntry> history = historyRepository
                .findByBookingIdOrderByCreatedAtDesc(bookingId).stream()
                .map(entry -> new FacilityBookingService.HistoryEntry(entry.getPreviousStatus(),
                        entry.getNewStatus(), entry.getReason(), entry.getCreatedAt()))
                .toList();

        String clubName = clubRepository.findById(booking.getClubId()).map(Club::getName).orElse("");
        String roomName = facilityRepository.findById(booking.getFacilityId())
                .map(Facility::getRoomName).orElse("");

        return new AdminBookingDetailResult(booking.getId(), booking.getClubId(), clubName,
                booking.getFacilityId(), roomName, date, booking.getStartTime(), booking.getEndTime(),
                booking.getStatus(), booking.getPurpose(), booking.getAttendeeCount(),
                booking.getRejectReason(), booking.getConflictDetail(), booking.getMatchedScheduleSeq(),
                crawlBasisAt, stale, overlaps, overlappingPendingCount, history);
    }

    public AdminBookingSummaryCounts getSummary() {
        long pendingCount = facilityBookingRepository.countByStatus(BookingStatus.PENDING);
        // 오늘 접수: createdAt 은 JPA 감사가 JVM 기본 존으로 기록하므로 같은 존의 하루 경계로 센다
        // (clock 은 KST 라 UTC 러너·운영에서 자정~오전 구간에 하루가 어긋나 오집계된다).
        LocalDate systemToday = LocalDate.now();
        long todaySubmittedCount = facilityBookingRepository.countByStatusAndCreatedAtBetween(
                BookingStatus.PENDING, systemToday.atStartOfDay(), systemToday.atTime(LocalTime.MAX));
        long approvedWaitingCount = facilityBookingRepository.countByStatus(BookingStatus.APPROVED);
        LocalDate today = LocalDate.now(clock);
        long oldestApprovedWaitingDays = facilityBookingRepository
                .findFirstByStatusOrderByDecidedAtAsc(BookingStatus.APPROVED)
                .filter(oldest -> oldest.getDecidedAt() != null)
                .map(oldest -> ChronoUnit.DAYS.between(oldest.getDecidedAt().toLocalDate(), today))
                .orElse(0L);
        long conflictCount = facilityBookingRepository.countByStatus(BookingStatus.CONFLICT);
        YearMonth thisMonth = YearMonth.now(clock);
        long confirmedThisMonthCount = facilityBookingRepository.countByStatusAndReservationDateBetween(
                BookingStatus.CONFIRMED, thisMonth.atDay(1), thisMonth.atEndOfMonth());

        return new AdminBookingSummaryCounts(pendingCount, todaySubmittedCount, approvedWaitingCount,
                oldestApprovedWaitingDays, conflictCount, confirmedThisMonthCount);
    }

    private AdminBookingSummaryResult toSummary(FacilityBooking booking, Map<Long, String> clubNames,
            Map<Long, String> roomNames, Map<FacilityMonthKey, List<FacilityReservation>> crawlCache,
            LocalDate today) {
        boolean approved = booking.getStatus() == BookingStatus.APPROVED;
        Integer approvedWaitingDays = approved && booking.getDecidedAt() != null
                ? (int) ChronoUnit.DAYS.between(booking.getDecidedAt().toLocalDate(), today)
                : null;
        boolean conflictSuspected = approved && hasMismatchedOccupiedOverlap(booking, clubNames, crawlCache);
        return new AdminBookingSummaryResult(booking.getId(), booking.getClubId(),
                clubNames.getOrDefault(booking.getClubId(), ""), booking.getFacilityId(),
                roomNames.getOrDefault(booking.getFacilityId(), ""), booking.getReservationDate(),
                booking.getStartTime(), booking.getEndTime(), booking.getStatus(), booking.getPurpose(),
                booking.getCreatedAt(), approvedWaitingDays, conflictSuspected);
    }

    /** (시설,월) 점유행 중 예약 시간과 겹치는데 정규화 이름이 동아리명과 불일치하는 행이 존재하는가. */
    private boolean hasMismatchedOccupiedOverlap(FacilityBooking booking, Map<Long, String> clubNames,
            Map<FacilityMonthKey, List<FacilityReservation>> crawlCache) {
        String normalizedClubName = normalizer.normalize(clubNames.getOrDefault(booking.getClubId(), ""));
        return crawlRows(booking, crawlCache).stream()
                .filter(row -> row.getReservationDate().equals(booking.getReservationDate()))
                .filter(row -> availabilityPolicy.classify(row) == CrawlRowType.OCCUPIED)
                .filter(row -> row.getStartTime().isBefore(booking.getEndTime())
                        && row.getEndTime().isAfter(booking.getStartTime()))
                .anyMatch(row -> !normalizer.normalize(row.getOrganizationName()).equals(normalizedClubName));
    }

    private List<FacilityReservation> crawlRows(FacilityBooking booking,
            Map<FacilityMonthKey, List<FacilityReservation>> crawlCache) {
        FacilityMonthKey key = new FacilityMonthKey(
                booking.getFacilityId(), YearMonth.from(booking.getReservationDate()));
        return crawlCache.computeIfAbsent(key, missingKey ->
                facilityReservationRepository.findByFacilityIdAndYearMonth(
                        missingKey.facilityId(), missingKey.yearMonth()));
    }

    private Map<Long, String> clubNames(List<FacilityBooking> bookings) {
        List<Long> clubIds = bookings.stream().map(FacilityBooking::getClubId).distinct().toList();
        return clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Club::getName, (first, second) -> first));
    }

    private Map<Long, String> roomNames(List<FacilityBooking> bookings) {
        List<Long> facilityIds = bookings.stream().map(FacilityBooking::getFacilityId).distinct().toList();
        return facilityRepository.findAllById(facilityIds).stream()
                .collect(Collectors.toMap(Facility::getId, Facility::getRoomName, (first, second) -> first));
    }

    /** 가용성 서비스(GeneralFacilityAvailabilityService.isStale)와 동일 규칙: STALE_CACHE·스냅샷 null·비SUCCESS·10분 초과. */
    private boolean isStale(LocalDateTime crawledAt, FetchStatus fetchStatus, DataSource source) {
        if (source == DataSource.STALE_CACHE || crawledAt == null || fetchStatus != FetchStatus.SUCCESS) {
            return true;
        }
        return Duration.between(crawledAt, LocalDateTime.now(clock)).compareTo(FRESH_TTL) > 0;
    }
}

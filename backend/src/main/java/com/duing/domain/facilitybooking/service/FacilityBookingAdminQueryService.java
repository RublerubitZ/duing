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
import com.duing.domain.facility.service.SnapshotFreshnessPolicy;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingSearchCondition;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
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

    // 오늘 접수 카운트의 하루 경계 존 — createdAt 저장 존(JVM 기본)과 별개로, "오늘"은 KST 로 판단한다(§9.7).
    private static final ZoneId SEOUL_ZONE = ZoneId.of("Asia/Seoul");

    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityBookingStatusHistoryRepository historyRepository;
    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityCrawlService facilityCrawlService;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final OrganizationNameNormalizer normalizer;
    private final FacilityBookingMatchingService matchingService;
    private final ClubRepository clubRepository;
    private final Clock clock;

    public record AdminBookingSummaryResult(Long bookingId, Long clubId, String clubName,
            Long facilityId, String roomName, LocalDate date, LocalTime startTime, LocalTime endTime,
            BookingStatus status, String purpose, Integer attendeeCount, String contactPhone,
            LocalDateTime createdAt,
            Integer approvedWaitingDays, boolean conflictSuspected, boolean partiallyMatched) {}

    public record OverlapContext(String source, String organization, LocalTime startTime, LocalTime endTime) {}

    public record AdminBookingDetailResult(Long bookingId, Long clubId, String clubName,
            Long facilityId, String roomName, LocalDate date, LocalTime startTime, LocalTime endTime,
            BookingStatus status, String purpose, Integer attendeeCount, String contactPhone,
            String rejectReason, String conflictDetail, Long matchedScheduleSeq,
            LocalDateTime crawlBasisAt, boolean stale,
            List<OverlapContext> overlaps, long overlappingPendingCount,
            List<FacilityBookingService.HistoryEntry> history) {}

    public record AdminBookingSummaryCounts(long pendingCount, long todaySubmittedCount,
            long oldestPendingWaitingDays, long approvedWaitingCount, long oldestApprovedWaitingDays,
            long conflictCount, long conflictSuspectedCount, long confirmedThisMonthCount,
            LocalDateTime crawledAt) {}

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
        availabilityPolicy.occupiedOverlapping(
                        facilityReservationRepository.findByFacilityIdAndYearMonth(booking.getFacilityId(), month),
                        date, booking.getStartTime(), booking.getEndTime())
                .forEach(row -> overlaps.add(new OverlapContext(
                        "SCHOOL", row.getOrganizationName(), row.getStartTime(), row.getEndTime())));
        // 내부 APPROVED/CONFIRMED(자기 제외) — 관리자 화면은 내부용이므로 동아리명을 노출한다.
        List<FacilityBooking> internalOverlaps = facilityBookingRepository.findOverlapping(
                        booking.getFacilityId(), date,
                        BookingStatus.slotBlockingStatuses(),
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
                blankToNull(booking.getContactPhone()),
                booking.getRejectReason(), booking.getConflictDetail(), booking.getMatchedScheduleSeq(),
                crawlBasisAt, stale, overlaps, overlappingPendingCount, history);
    }

    /** 기존 행(빈 문자열)의 대표 연락처는 응답에서 null 로 내린다(FE "—" 표기 폴백, 설계 §1). */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    public AdminBookingSummaryCounts getSummary() {
        LocalDate today = LocalDate.now(clock);
        long pendingCount = facilityBookingRepository.countByStatus(BookingStatus.PENDING);
        // 오늘 접수(§9.7·§5.3): 상태 무관 "오늘 생성된 신청" 수(처리 완료돼도 오늘 접수는 접수).
        // createdAt 은 감사가 저장 존으로 기록(system regime)하므로 KST 하루 경계를 저장 존으로 옮겨 넘긴다.
        LocalDateTime dayStart = TimeMapper.seoulToSystemWallClock(today.atStartOfDay());
        LocalDateTime dayEnd = TimeMapper.seoulToSystemWallClock(today.atTime(LocalTime.MAX));
        long todaySubmittedCount = facilityBookingRepository.countByCreatedAtBetween(dayStart, dayEnd);
        long oldestPendingWaitingDays = facilityBookingRepository
                .findFirstByStatusOrderByCreatedAtAsc(BookingStatus.PENDING)
                // createdAt 은 감사가 저장 존으로 기록(system regime)하므로 KST 날짜로 환산해 today(KST)와 뺀다.
                .map(oldest -> ChronoUnit.DAYS.between(
                        TimeMapper.systemWallClockToInstant(oldest.getCreatedAt())
                                .atZone(SEOUL_ZONE).toLocalDate(), today))
                .orElse(0L);
        long approvedWaitingCount = facilityBookingRepository.countByStatus(BookingStatus.APPROVED);
        long oldestApprovedWaitingDays = facilityBookingRepository
                .findFirstByStatusOrderByDecidedAtAsc(BookingStatus.APPROVED)
                .filter(oldest -> oldest.getDecidedAt() != null)
                // decidedAt 은 clock(KST wall-clock)으로 기록되므로 존 변환 없이 그대로 KST 날짜로 뺀다(createdAt 과 구분).
                .map(oldest -> ChronoUnit.DAYS.between(oldest.getDecidedAt().toLocalDate(), today))
                .orElse(0L);
        long conflictCount = facilityBookingRepository.countByStatus(BookingStatus.CONFLICT);
        YearMonth thisMonth = YearMonth.now(clock);
        long conflictSuspectedCount = countConflictSuspected(thisMonth);
        long confirmedThisMonthCount = facilityBookingRepository.countByStatusAndReservationDateBetween(
                BookingStatus.CONFIRMED, thisMonth.atDay(1), thisMonth.atEndOfMonth());
        // 헤더 신선도 칩(개편 스펙 A1) — 당월 스냅샷의 마지막 수집 시각. 재크롤 트리거 없이 저장값만 노출한다.
        LocalDateTime crawledAt = facilityMonthSnapshotRepository.findByYearMonth(thisMonth)
                .map(FacilityMonthSnapshot::getCrawledAt)
                .orElse(null);

        return new AdminBookingSummaryCounts(pendingCount, todaySubmittedCount, oldestPendingWaitingDays,
                approvedWaitingCount, oldestApprovedWaitingDays,
                conflictCount, conflictSuspectedCount, confirmedThisMonthCount, crawledAt);
    }

    /**
     * 당월·익월 APPROVED 중 충돌 의심(정규화 불일치 점유행 겹침) 건수(§9.7) — 큐 파생과 같은 규칙을 재사용한다.
     * 대상은 규모 수십 건이라 전수 계산을 허용하고, 크롤 행은 (시설,월) 조합당 1회만 조회해 캐시한다.
     */
    private long countConflictSuspected(YearMonth thisMonth) {
        List<FacilityBooking> approved = facilityBookingRepository.findByStatusAndReservationDateBetween(
                BookingStatus.APPROVED, thisMonth.atDay(1), thisMonth.plusMonths(1).atEndOfMonth());
        if (approved.isEmpty()) {
            return 0L;
        }
        Map<Long, String> clubNames = clubNames(approved);
        Map<FacilityMonthKey, List<FacilityReservation>> crawlCache = new HashMap<>();
        return approved.stream()
                .filter(booking -> hasMismatchedOccupiedOverlap(booking, clubNames, crawlCache))
                .count();
    }

    private AdminBookingSummaryResult toSummary(FacilityBooking booking, Map<Long, String> clubNames,
            Map<Long, String> roomNames, Map<FacilityMonthKey, List<FacilityReservation>> crawlCache,
            LocalDate today) {
        boolean approved = booking.getStatus() == BookingStatus.APPROVED;
        Integer approvedWaitingDays = approved && booking.getDecidedAt() != null
                ? (int) ChronoUnit.DAYS.between(booking.getDecidedAt().toLocalDate(), today)
                : null;
        boolean conflictSuspected = approved && hasMismatchedOccupiedOverlap(booking, clubNames, crawlCache);
        boolean partiallyMatched = approved && isPartiallyMatched(booking, clubNames, crawlCache);
        return new AdminBookingSummaryResult(booking.getId(), booking.getClubId(),
                clubNames.getOrDefault(booking.getClubId(), ""), booking.getFacilityId(),
                roomNames.getOrDefault(booking.getFacilityId(), ""), booking.getReservationDate(),
                booking.getStartTime(), booking.getEndTime(), booking.getStatus(), booking.getPurpose(),
                booking.getAttendeeCount(), blankToNull(booking.getContactPhone()), booking.getCreatedAt(),
                approvedWaitingDays, conflictSuspected, partiallyMatched);
    }

    /**
     * 부분 반영(§5.3 P1) — 정규화 일치 이름의 점유행이 예약과 겹치지만 완전 커버(자동 확정 판정 confirmed)는
     * 아닐 때 true. 학교가 우리 예약을 등록하기 시작했으나 아직 일부 슬롯만 반영된 상태로, 관리자 주의 표시가 필요하다.
     * 판정은 자동 매칭 서비스(decide)를 그대로 재사용해 스케줄러와 기준을 일치시킨다.
     */
    private boolean isPartiallyMatched(FacilityBooking booking, Map<Long, String> clubNames,
            Map<FacilityMonthKey, List<FacilityReservation>> crawlCache) {
        String clubName = clubNames.getOrDefault(booking.getClubId(), "");
        String normalizedClubName = normalizer.normalize(clubName);
        if (normalizedClubName.isEmpty()) {
            return false;
        }
        List<FacilityReservation> dayRows = dayRows(booking, crawlCache);
        boolean matchingNameOverlap = availabilityPolicy.occupiedOverlapping(
                        dayRows, booking.getReservationDate(), booking.getStartTime(), booking.getEndTime())
                .anyMatch(row -> normalizer.normalize(row.getOrganizationName()).equals(normalizedClubName));
        if (!matchingNameOverlap) {
            return false;
        }
        return !matchingService.decide(booking, clubName, dayRows).confirmed();
    }

    /** 예약 시설·월 크롤 행을 예약 날짜로 필터한 행(매칭 판정 decide 의 dayRows 입력). */
    private List<FacilityReservation> dayRows(FacilityBooking booking,
            Map<FacilityMonthKey, List<FacilityReservation>> crawlCache) {
        return crawlRows(booking, crawlCache).stream()
                .filter(row -> row.getReservationDate().equals(booking.getReservationDate()))
                .toList();
    }

    /** (시설,월) 점유행 중 예약 시간과 겹치는데 정규화 이름이 동아리명과 불일치하는 행이 존재하는가. */
    private boolean hasMismatchedOccupiedOverlap(FacilityBooking booking, Map<Long, String> clubNames,
            Map<FacilityMonthKey, List<FacilityReservation>> crawlCache) {
        String normalizedClubName = normalizer.normalize(clubNames.getOrDefault(booking.getClubId(), ""));
        return availabilityPolicy.occupiedOverlapping(crawlRows(booking, crawlCache),
                        booking.getReservationDate(), booking.getStartTime(), booking.getEndTime())
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

    /** 관리자 상세는 당월·익월 예약 심사 화면이라 고정 10분 TTL(가용성 서비스와 동일 정책 파라미터). */
    private boolean isStale(LocalDateTime crawledAt, FetchStatus fetchStatus, DataSource source) {
        return SnapshotFreshnessPolicy.isStale(source, fetchStatus, crawledAt,
                SnapshotFreshnessPolicy.CURRENT_NEXT_TTL, LocalDateTime.now(clock));
    }
}

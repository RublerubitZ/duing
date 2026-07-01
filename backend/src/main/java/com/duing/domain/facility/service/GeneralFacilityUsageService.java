package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.ReservationStatus;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.parser.ParsedReservation;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.SlotMerger.MergedSlot;
import com.duing.domain.facility.service.dto.query.FacilityUsageItem;
import com.duing.domain.facility.service.dto.query.FacilityUsageResult;
import com.duing.domain.facility.service.dto.query.ReservationSlot;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 이용현황 조회 조립 + 조회 시점 상태계산(Asia/Seoul). 저장된 reservation_date(DATE)+time(TIME)(KST 벽시계)을
 * LocalDateTime.now(seoulClock) 와 비교하므로 JVM 타임존(prod=UTC)과 무관하게 정확하다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilityUsageService implements FacilityUsageService {

    private static final int MONTH_WINDOW = 12;
    private static final int CURRENT_NEXT_TTL_MINUTES = 10;
    private static final int OTHER_TTL_HOURS = 24;

    private final FacilityCrawlService crawlService;
    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository reservationRepository;
    private final FacilityMonthSnapshotRepository snapshotRepository;
    private final SlotMerger slotMerger;
    private final Clock clock;

    /** §7.1 활성 시설 목록(가벼움). */
    @Override
    public List<Facility> getActiveFacilities() {
        return facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc();
    }

    /** §7.2 이용현황. yearMonth 가 null 이면 현재월. 범위 초과는 400. */
    @Override
    public FacilityUsageResult getUsage(YearMonth requestedMonth) {
        YearMonth yearMonth = (requestedMonth == null) ? YearMonth.now(clock) : requestedMonth;
        assertWithinWindow(yearMonth);
        DataSource source = crawlService.ensureFresh(yearMonth);
        List<FacilityUsageItem> items = assemble(yearMonth, facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc());
        return buildResult(yearMonth, source, items);
    }

    /** §7.3 단일 시설 상세 — usage 의 시설 1건 슬라이스. */
    @Override
    public FacilityUsageResult getDetail(Long facilityId, YearMonth requestedMonth) {
        YearMonth yearMonth = (requestedMonth == null) ? YearMonth.now(clock) : requestedMonth;
        assertWithinWindow(yearMonth);
        Facility facility = facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc().stream()
                .filter(candidate -> candidate.getId().equals(facilityId))
                .findFirst()
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        DataSource source = crawlService.ensureFresh(yearMonth);
        List<FacilityUsageItem> items = assemble(yearMonth, List.of(facility));
        return buildResult(yearMonth, source, items);
    }

    private void assertWithinWindow(YearMonth yearMonth) {
        YearMonth current = YearMonth.now(clock);
        long months = Math.abs(ChronoUnit.MONTHS.between(current, yearMonth));
        if (months > MONTH_WINDOW) {
            throw new FacilityException.MonthOutOfRangeException();
        }
    }

    private List<FacilityUsageItem> assemble(YearMonth yearMonth, List<Facility> facilities) {
        LocalDateTime now = LocalDateTime.now(clock);
        List<Long> facilityIds = facilities.stream().map(Facility::getId).toList();
        Map<Long, List<FacilityReservation>> byFacility = facilityIds.isEmpty()
                ? Map.of()
                : reservationRepository.findByFacilityIdInAndYearMonth(facilityIds, yearMonth).stream()
                        .collect(Collectors.groupingBy(FacilityReservation::getFacilityId));

        List<FacilityUsageItem> items = new ArrayList<>();
        for (Facility facility : facilities) {
            List<ParsedReservation> raw = byFacility.getOrDefault(facility.getId(), List.of()).stream()
                    .map(row -> new ParsedReservation(row.getScheduleSeq(), row.getReservationDate(),
                            row.getStartTime(), row.getEndTime(), row.getOrganizationName()))
                    .toList();
            List<ReservationSlot> slots = slotMerger.merge(raw).stream()
                    .map(merged -> toSlot(merged, now))
                    .sorted(Comparator.comparing(ReservationSlot::date).thenComparing(ReservationSlot::start))
                    .toList();
            ReservationSlot current = slots.stream()
                    .filter(slot -> slot.status() == ReservationStatus.USING)
                    .findFirst().orElse(null);
            ReservationSlot next = slots.stream()
                    .filter(slot -> slot.status() == ReservationStatus.UPCOMING)
                    .min(Comparator.comparing((ReservationSlot slot) -> slot.date().atTime(slot.start())))
                    .orElse(null);
            items.add(new FacilityUsageItem(facility.getId(), facility.getRoomName(), facility.getLocation(),
                    current != null, current, next, slots));
        }
        return items;
    }

    private ReservationSlot toSlot(MergedSlot merged, LocalDateTime now) {
        LocalDateTime start = merged.date().atTime(merged.start());
        LocalDateTime end = merged.date().atTime(merged.end());
        ReservationStatus status;
        if (now.isBefore(start)) {
            status = ReservationStatus.UPCOMING;
        } else if (now.isBefore(end)) {
            status = ReservationStatus.USING;
        } else {
            status = ReservationStatus.FINISHED;
        }
        return new ReservationSlot(merged.date(), merged.start(), merged.end(), merged.organization(), status);
    }

    private FacilityUsageResult buildResult(YearMonth yearMonth, DataSource source, List<FacilityUsageItem> items) {
        Optional<FacilityMonthSnapshot> snapshot = snapshotRepository.findByYearMonth(yearMonth);
        LocalDateTime crawledAt = snapshot.map(FacilityMonthSnapshot::getCrawledAt).orElse(null);
        boolean stale = isStale(yearMonth, crawledAt, source);
        return new FacilityUsageResult(yearMonth, crawledAt, source, stale, items);
    }

    private boolean isStale(YearMonth yearMonth, LocalDateTime crawledAt, DataSource source) {
        if (source == DataSource.STALE_CACHE || crawledAt == null) {
            return true;
        }
        Duration ttl = ttl(yearMonth);
        return Duration.between(crawledAt, LocalDateTime.now(clock)).compareTo(ttl) > 0;
    }

    private Duration ttl(YearMonth yearMonth) {
        YearMonth current = YearMonth.now(clock);
        if (yearMonth.equals(current) || yearMonth.equals(current.plusMonths(1))) {
            return Duration.ofMinutes(CURRENT_NEXT_TTL_MINUTES);
        }
        return Duration.ofHours(OTHER_TTL_HOURS);
    }
}

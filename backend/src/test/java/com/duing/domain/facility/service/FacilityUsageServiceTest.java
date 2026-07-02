package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.entity.ReservationStatus;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.dto.query.FacilityUsageItem;
import com.duing.domain.facility.service.dto.query.FacilityUsageResult;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FacilityUsageServiceTest {

    @Mock FacilityCrawlService crawlService;
    @Mock FacilityRepository facilityRepository;
    @Mock FacilityReservationRepository reservationRepository;
    @Mock FacilityMonthSnapshotRepository snapshotRepository;

    FacilityUsageService service;
    final SlotMerger slotMerger = new SlotMerger();
    // 2026-07-15 14:00 Asia/Seoul (05:00Z). 상대날짜 계산의 기준 — 하드코딩 미래 절대날짜 아님(고정 Clock).
    final Clock clock = Clock.fixed(Instant.parse("2026-07-15T05:00:00Z"), ZoneId.of("Asia/Seoul"));
    final YearMonth july = YearMonth.of(2026, 7);
    final LocalDate today = LocalDate.of(2026, 7, 15);

    @BeforeEach
    void setUp() {
        service = new GeneralFacilityUsageService(crawlService, facilityRepository, reservationRepository,
                snapshotRepository, slotMerger, clock);
    }

    // BaseEntity.id 는 setter 가 없어 리플렉션으로 주입(단위 테스트 전용).
    private Facility facilityWithId(long id, int roomSeq, String name, String location) throws Exception {
        Facility facility = Facility.create(roomSeq, name, location, 0);
        Field idField = facility.getClass().getSuperclass().getDeclaredField("id");
        idField.setAccessible(true);
        idField.set(facility, id);
        return facility;
    }

    private FacilityReservation reservation(long facilityId, long seq, LocalDate date, int startHour, int endHour, String org) {
        return FacilityReservation.create(facilityId, seq, july, date,
                LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), org, LocalDateTime.now(clock));
    }

    @Test
    @DisplayName("현재 시각을 포함하는 예약은 USING·isUsingNow=true·currentReservation 으로 계산되고 다음 예약은 가장 이른 미래로 선택된다")
    void computesUsingAndNext() throws Exception {
        Facility facility = facilityWithId(1L, 4, "공동연습실(1)", "2105");
        when(crawlService.ensureFresh(july)).thenReturn(DataSource.CACHE);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(reservationRepository.findByFacilityIdInAndYearMonth(any(), eq(july))).thenReturn(List.of(
                reservation(1L, 10, today, 9, 10, "아침동아리"),       // 09-10 과거 → FINISHED
                reservation(1L, 11, today, 13, 15, "댄스동아리"),      // 13-15 (14:00 포함) → USING
                reservation(1L, 12, today, 16, 17, "저녁동아리"),      // 오늘 16-17 → 다음 예약 후보(더 이름)
                reservation(1L, 13, today.plusDays(1), 16, 17, "내일동아리"))); // 내일 16-17 → 후순위
        when(snapshotRepository.findByYearMonth(july)).thenReturn(Optional.of(FacilityMonthSnapshot.create(
                july, LocalDateTime.now(clock), CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null)));

        FacilityUsageResult result = service.getUsage(july);

        FacilityUsageItem item = result.facilities().get(0);
        assertThat(item.isUsingNow()).isTrue();
        assertThat(item.currentReservation().status()).isEqualTo(ReservationStatus.USING);
        assertThat(item.currentReservation().start()).isEqualTo(LocalTime.of(13, 0));
        assertThat(item.nextReservation().start()).isEqualTo(LocalTime.of(16, 0));
        assertThat(item.nextReservation().date()).isEqualTo(today); // 오늘 16시가 내일 16시보다 이르다
        assertThat(item.reservations()).extracting(slot -> slot.status())
                .contains(ReservationStatus.FINISHED, ReservationStatus.USING, ReservationStatus.UPCOMING);
        assertThat(result.source()).isEqualTo(DataSource.CACHE);
        assertThat(result.stale()).isFalse();
        assertThat(result.crawledAt()).isEqualTo(LocalDateTime.now(clock));
    }

    @Test
    @DisplayName("오늘 사용 중 예약이 없으면 isUsingNow=false·currentReservation=null 이다")
    void noCurrentWhenNotUsing() throws Exception {
        Facility facility = facilityWithId(1L, 4, "공동연습실(1)", "2105");
        when(crawlService.ensureFresh(july)).thenReturn(DataSource.CACHE);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(reservationRepository.findByFacilityIdInAndYearMonth(any(), eq(july))).thenReturn(List.of(
                reservation(1L, 10, today, 9, 10, "아침동아리"))); // 과거만
        when(snapshotRepository.findByYearMonth(july)).thenReturn(Optional.of(FacilityMonthSnapshot.create(
                july, LocalDateTime.now(clock), CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null)));

        FacilityUsageItem item = service.getUsage(july).facilities().get(0);
        assertThat(item.isUsingNow()).isFalse();
        assertThat(item.currentReservation()).isNull();
        assertThat(item.nextReservation()).isNull();
    }

    @Test
    @DisplayName("PARTIAL 크롤 스냅샷은 crawled_at 이 최근이고 source=CACHE 여도 stale=true 로 노출된다(일부 룸 누락을 최신으로 오표기하지 않음)")
    void partialSnapshotIsReportedAsStale() throws Exception {
        Facility facility = facilityWithId(1L, 4, "공동연습실(1)", "2105");
        when(crawlService.ensureFresh(july)).thenReturn(DataSource.CACHE);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(reservationRepository.findByFacilityIdInAndYearMonth(any(), eq(july))).thenReturn(List.of());
        when(snapshotRepository.findByYearMonth(july)).thenReturn(Optional.of(FacilityMonthSnapshot.create(
                july, LocalDateTime.now(clock), CrawlSource.SCHEDULER, FetchStatus.PARTIAL, "일부 룸 실패")));

        FacilityUsageResult result = service.getUsage(july);

        assertThat(result.stale()).isTrue();
        assertThat(result.crawledAt()).isEqualTo(LocalDateTime.now(clock)); // lastUpdatedAt 은 마지막 성공 시각 그대로 유지
    }

    @Test
    @DisplayName("현재월 기준 +13개월 조회는 MonthOutOfRangeException(400)이다")
    void rejectsOutOfWindow() {
        assertThatThrownBy(() -> service.getUsage(july.plusMonths(13)))
                .isInstanceOf(FacilityException.MonthOutOfRangeException.class);
    }

    @Test
    @DisplayName("yearMonth 가 null 이면 현재월로 조회한다")
    void defaultsToCurrentMonth() throws Exception {
        when(crawlService.ensureFresh(july)).thenReturn(DataSource.CACHE);
        // 시설 목록이 비어있으면 구현체가 reservationRepository 조회를 생략하므로(빈 facilityIds 단락)
        // 그 스텁은 두지 않는다(strict stubbing 시 UnnecessaryStubbingException).
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of());
        when(snapshotRepository.findByYearMonth(july)).thenReturn(Optional.empty());

        FacilityUsageResult result = service.getUsage(null);
        assertThat(result.yearMonth()).isEqualTo(july);
        assertThat(result.crawledAt()).isNull();
        assertThat(result.stale()).isTrue(); // 콜드(성공 이력 없음)
    }
}

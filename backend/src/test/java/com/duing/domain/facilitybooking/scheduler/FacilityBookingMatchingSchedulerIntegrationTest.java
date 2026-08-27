package com.duing.domain.facilitybooking.scheduler;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.BookingWindowFixture;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminService;
import com.duing.domain.facilitybooking.service.FacilityBookingMatchingService;
import com.duing.domain.facilitybooking.service.FacilityBookingService;
import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/**
 * 매칭 스케줄러 코어({@link FacilityBookingMatchingScheduler#runMatchingCycle}) 통합 테스트.
 * 스케줄러 빈은 duing.facility.booking.matching.enabled 조건부라 프로퍼티로 강제 활성화하고 @Autowired 로 조립한다.
 * 픽스처 헬퍼(saveUser/saveActiveClub/saveFacility/fixture/bookableDate/pendingBooking/sequence)는
 * 같은 패키지의 {@code FacilityBookingAdminServiceIntegrationTest} 코드를 그대로 복제한다(사이드 파일 패턴 일치).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.facility.booking.matching.enabled=true")
class FacilityBookingMatchingSchedulerIntegrationTest extends IntegrationTestBase {

    @Autowired FacilityBookingMatchingScheduler scheduler;
    @Autowired FacilityBookingMatchingService matchingService;
    @Autowired FacilityBookingAdminService adminService;
    @Autowired FacilityBookingService bookingService;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilityBookingStatusHistoryRepository historyRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired FacilityMonthSnapshotRepository snapshotRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ---------- fixtures (FacilityBookingAdminServiceIntegrationTest 와 동일) ----------

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L), name + unique, "hashed",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정",
                "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        club.changeCentralClub(true); // 시설 예약 신청은 중앙동아리만 가능(설계 spec 2026-07-18)
        return clubRepository.save(club);
    }

    /** 정규화 키 충돌 시나리오용 — 접미사 없이 정확한 이름으로 ACTIVE 동아리를 저장한다. */
    private Club saveActiveClubExact(String exactName) throws Exception {
        Club club = Club.create(exactName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        club.changeCentralClub(true); // 시설 예약 신청은 중앙동아리만 가능(설계 spec 2026-07-18)
        return clubRepository.save(club);
    }

    private Facility saveFacility() {
        return facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private record Fixture(User leader, Club club, Facility facility) {}

    private Fixture fixture() throws Exception {
        User leader = saveUser("리더");
        Club club = saveActiveClub("대관동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return new Fixture(leader, club, saveFacility());
    }

    private LocalDate bookableDate() {
        // 시각 무관 항상 신청 가능한 날짜(내일) — 롤링 창은 오늘을 포함하나 고정 슬롯 시각 타임밤을 피해 내일을 쓴다.
        return BookingWindowFixture.bookableDate();
    }

    private Long pendingBooking(Fixture fixture, LocalDate date, int startHour, int endHour) {
        return bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
    }

    /**
     * 해당 월 스냅샷을 SUCCESS 로 기록한다. FacilityMonthSnapshot 의 실제 API 에 맞춘다 —
     * 최초 생성은 create(yearMonth, crawledAt, source, fetchStatus, lastError) 팩토리,
     * 성공 기록은 recordSuccessful(crawledAt, source, fetchStatus, lastError)(4-인자) 를 사용한다.
     */
    private void recordSuccessSnapshot(YearMonth yearMonth) {
        recordSuccessSnapshot(yearMonth, LocalDateTime.now());
    }

    /**
     * 지정한 세대 시각(crawledAt)으로 SUCCESS 스냅샷을 기록한다. 전 시설 성공 크롤과 같게 저장된 모든 시설을
     * 세대 성공 집합에 넣는다 — 세대 결박은 "이 세대에 수집 성공한 시설인가"로 판별하기 때문이다.
     */
    private void recordSuccessSnapshot(YearMonth yearMonth, LocalDateTime crawledAt) {
        recordSnapshot(yearMonth, crawledAt, FetchStatus.SUCCESS, null,
                facilityRepository.findAll().stream().map(Facility::getId).toList());
    }

    /** 세대 성공 집합을 직접 지정하는 스냅샷 기록 — 일부 시설만 수집 성공한 PARTIAL 상황 재현용. */
    private void recordSnapshot(YearMonth yearMonth, LocalDateTime crawledAt, FetchStatus fetchStatus,
                                String lastError, List<Long> syncedFacilityIds) {
        FacilityMonthSnapshot snapshot = snapshotRepository.findByYearMonth(yearMonth)
                .orElseGet(() -> FacilityMonthSnapshot.create(yearMonth, crawledAt,
                        CrawlSource.SCHEDULER, FetchStatus.FAILED, null));
        snapshot.recordSuccessful(crawledAt, CrawlSource.SCHEDULER, fetchStatus, lastError, syncedFacilityIds);
        snapshotRepository.save(snapshot);
    }

    // ---------- tests ----------

    @Test
    @DisplayName("정확 매칭되는 APPROVED 는 자동 CONFIRMED + 시스템 이력, 이름 불일치는 APPROVED 유지다")
    void confirmsExactMatchesOnly() throws Exception {
        Fixture fixture = fixture(); // 동아리명이 픽스처에서 유니크 생성되므로 clubRepository 로 실명 조회
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();

        // 정확 세대 결박 — 행과 스냅샷이 같은 세대(crawledAt)여야 확정한다. 행·메타에 동일 generation 을 부여한다.
        LocalDateTime generation = LocalDateTime.now();

        Long matched = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), matched);
        // 학교가 동아리명 그대로 18~19·19~20 점유행 등록
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, false, generation));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, false, generation));

        Long mismatched = pendingBooking(fixture, date, 9, 10);
        adminService.approve(admin.getId(), mismatched);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "전혀다른단체", false, generation));

        recordSuccessSnapshot(YearMonth.from(date), generation);
        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(matched).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);
        assertThat(bookingRepository.findById(matched).orElseThrow().getMatchedScheduleSeq()).isNotNull();
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(matched).get(0).getChangedById())
                .isNull(); // 시스템 전이
        assertThat(bookingRepository.findById(mismatched).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED); // 수동 확정 대상으로 유지

        // 멱등 — 두 번째 실행에도 결과·이력 개수 불변
        int historyCount = historyRepository.findByBookingIdOrderByCreatedAtDesc(matched).size();
        scheduler.runMatchingCycle();
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(matched)).hasSize(historyCount);
    }

    @Test
    @DisplayName("확보 대상 동아리라도 물결 확보 표기 행만으로는 자동 확정되지 않는다 — 상시 확보 표시는 학교 반영 증거가 아니다")
    void securedTailRowAloneDoesNotAutoConfirm() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        Club securedClub = clubRepository.findById(fixture.club().getId()).orElseThrow();
        securedClub.changeFacilitySecuredTimeTarget(true);
        clubRepository.save(securedClub);
        String clubName = securedClub.getName();
        LocalDateTime generation = LocalDateTime.now();

        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        // 동아리명 그대로 예약 전 구간을 덮는 물결 확보 표기 행 — 실예약 행이었다면 자동 확정 조건 충족.
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(20, 0), clubName, true, generation));
        recordSuccessSnapshot(YearMonth.from(date), generation);

        scheduler.runMatchingCycle();

        // securedTail 행은 decide 증거에서 행 단위로 제외되어 APPROVED 유지(수동 확정 폴백) — 차단과는 무관하다.
        assertThat(bookingRepository.findById(approved).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("확보 대상 동아리도 무꼬리 실예약 행이 전 구간을 덮으면 자동 CONFIRMED 된다 — 실예약 행은 증거로 복귀한다")
    void securedTargetClubAutoConfirmsOnRealReservationRows() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        Club securedClub = clubRepository.findById(fixture.club().getId()).orElseThrow();
        securedClub.changeFacilitySecuredTimeTarget(true);
        clubRepository.save(securedClub);
        String clubName = securedClub.getName();
        LocalDateTime generation = LocalDateTime.now();

        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        // 상시 확보 물결 행(증거 아님)과 별개로, 학교가 이 예약을 무꼬리 실예약 행으로 등록했다 —
        // 구 동아리 단위 스킵이었다면 영구 수동 확정 대상이던 케이스가 정상 자동 확정으로 복귀한다.
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(22, 0), clubName, true, generation));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(20, 0), clubName, false, generation));
        recordSuccessSnapshot(YearMonth.from(date), generation);

        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(approved).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);
    }

    @Test
    @DisplayName("PARTIAL 월에서도 세대가 일치하는 시설은 자동 확정된다 — 한 룸의 실패가 월 전체 자동 확정을 멈추지 않는다")
    void confirmsGenerationMatchedFacilitiesInPartialMonth() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();
        LocalDateTime generation = LocalDateTime.now();

        Long matched = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), matched);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(20, 0), clubName, false, generation));

        // 크롤이 실패한 룸의 예약 — 세대 성공 집합에서 빠져 있어 세대 결박이 확정을 막아야 한다
        Fixture staleFixture = fixture();
        String staleClubName = clubRepository.findById(staleFixture.club().getId()).orElseThrow().getName();
        Long staleBooking = pendingBooking(staleFixture, date, 9, 11);
        adminService.approve(admin.getId(), staleBooking);
        facilityReservationRepository.save(FacilityReservation.create(staleFixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(11, 0), staleClubName,
                false, generation.minusMinutes(10)));

        // 룸 1개 실패 상황 — 월 메타는 새 세대의 PARTIAL 로 기록되고, 성공한 시설만 세대 집합에 들어간다
        // (FacilityCrawlService 와 동일 경로).
        recordSnapshot(YearMonth.from(date), generation, FetchStatus.PARTIAL, "룸 1개 실패",
                List.of(fixture.facility().getId()));

        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(matched).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);
        assertThat(bookingRepository.findById(staleBooking).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED); // 세대 집합에 없는 시설은 fail-closed 로 제외
    }

    @Test
    @DisplayName("스냅샷이 없거나 FAILED 인 월은 건너뛴다 — 신뢰 불가 데이터로 오판하지 않는다")
    void skipsNonSuccessMonths() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();
        Long approved = pendingBooking(fixture, date, 11, 12);
        adminService.approve(admin.getId(), approved);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(11, 0), LocalTime.of(12, 0), clubName, false, LocalDateTime.now()));
        // 1) 스냅샷 미기록 상태 — 게이트가 막아 APPROVED 유지
        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(approved).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);

        // 2) FAILED 스냅샷이 기록돼도(부분/실패 크롤) SUCCESS 게이트가 막아 APPROVED 유지
        FacilityMonthSnapshot failedSnapshot = FacilityMonthSnapshot.create(YearMonth.from(date),
                LocalDateTime.now(), CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null);
        failedSnapshot.recordFailure(CrawlSource.SCHEDULER, "크롤 실패");
        snapshotRepository.save(failedSnapshot);

        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(approved).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("아카이브 시설의 예약은 정확 매칭돼도 자동 확정하지 않는다 — 잔존 크롤 행 세대 결박 방어")
    void skipsArchivedFacility() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();

        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        // 동아리명 그대로 18~20 을 완전 커버하는 점유행(승인 후 유입) — 활성 시설이면 자동 확정될 상태
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, false, LocalDateTime.now()));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, false, LocalDateTime.now()));

        // 시설을 아카이브 — 크롤이 잔존 행을 지우지 않아도 매칭 대상에서 제외돼야 한다
        fixture.facility().archive(LocalDateTime.now());
        facilityRepository.save(fixture.facility());

        recordSuccessSnapshot(YearMonth.from(date));
        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(approved).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("세대 성공 집합에 없는 시설의 크롤 행은 SUCCESS 월이어도 커버로 인정하지 않는다 — 정확 세대 결박")
    void skipsFacilityMissingFromGeneration() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();

        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        // 18~20 을 완전 커버하는 행이지만, 이 시설은 이번 세대에 수집이 되지 않아 행이 최신이라는 보장이 없다.
        LocalDateTime generation = LocalDateTime.now();
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, false, generation));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, false, generation));

        // 월은 SUCCESS 지만 세대 성공 집합이 비어 있다(마이그레이션 직후 등) — fail-closed 로 확정하지 않는다.
        recordSnapshot(YearMonth.from(date), generation, FetchStatus.SUCCESS, null, List.of());
        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(approved).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("정규화 키가 다른 동아리와 충돌하면 정확 매칭돼도 자동 확정하지 않는다 — 오확정 방지 폴백")
    void skipsWhenNormalizedClubKeyCollides() throws Exception {
        User admin = saveUser("총동연");
        User leader = saveUser("리더");
        long base = sequence.getAndIncrement();
        String bandName = "밴드부" + base;
        Club bandClub = saveActiveClubExact(bandName);
        saveActiveClubExact(bandName + "(중앙)"); // 정규화 후 같은 키 — 충돌 유발
        clubMemberRepository.save(ClubMember.asLeader(bandClub, leader));
        Facility facility = saveFacility();
        LocalDate date = bookableDate();

        Long approved = bookingService.create(new CreateFacilityBookingCommand(
                bandClub.getId(), leader.getId(), facility.getId(), date,
                LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
        adminService.approve(admin.getId(), approved);
        // 동아리명 그대로 18~20 을 완전 커버하는 점유행 — 세대는 스냅샷과 일치시켜, 스킵의 실제 원인이 키 충돌임을 보장한다.
        LocalDateTime generation = LocalDateTime.now();
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), bandName, false, generation));
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), bandName, false, generation));

        recordSuccessSnapshot(YearMonth.from(date), generation);
        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(approved).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED); // 키 충돌 → 자동 확정 스킵(수동 확정 폴백)
    }

    @Test
    @DisplayName("자동 확정과 관리자 취소가 동시에 들어와도 취소된 예약이 CONFIRMED 로 덮이지 않는다 — @Version 백스톱")
    void concurrentConfirmAndCancelNeverResurrectsCancelled() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();
        LocalDateTime generation = LocalDateTime.now();

        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, false, generation));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, false, generation));
        recordSuccessSnapshot(YearMonth.from(date), generation);

        CountDownLatch startGate = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> confirmTask = () -> {
            startGate.await(5, TimeUnit.SECONDS);
            try {
                matchingService.verifyAndConfirm(approved, clubName, Set.of());
                return null;
            } catch (Throwable failure) {
                return failure;
            }
        };
        Callable<Throwable> cancelTask = () -> {
            startGate.await(5, TimeUnit.SECONDS);
            try {
                adminService.cancel(admin.getId(), approved, "학교 측 사정으로 취소");
                return null;
            } catch (Throwable failure) {
                return failure;
            }
        };
        Future<Throwable> confirmOutcome = pool.submit(confirmTask);
        Future<Throwable> cancelOutcome = pool.submit(cancelTask);
        startGate.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS)).isTrue();

        Throwable cancelFailure = cancelOutcome.get(1, TimeUnit.SECONDS);
        Throwable confirmFailure = confirmOutcome.get(1, TimeUnit.SECONDS);
        var finalState = bookingRepository.findById(approved).orElseThrow();
        if (cancelFailure == null) {
            // 취소가 커밋됐다면 매칭의 늦은 커밋은 @Version 이 차단(또는 멱등 게이트가 스킵)해야 한다 —
            // 이 단언이 깨지면 CANCELLED 가 불가역 CONFIRMED 로 덮이는 lost update 회귀다.
            assertThat(finalState.getStatus()).isEqualTo(BookingStatus.CANCELLED);
            if (confirmFailure != null) {
                assertThat(confirmFailure).isInstanceOf(ObjectOptimisticLockingFailureException.class);
            }
        } else {
            // 확정이 선행 커밋된 경합 — 취소는 낙관 잠금 충돌 또는 상태 가드로 거부된다
            // (CONFIRMED 취소가 열리면 순차 취소는 성공 경로가 되므로 이 분기는 동시 커밋 충돌만 남는다).
            assertThat(finalState.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
            assertThat(cancelFailure).isInstanceOfAny(ObjectOptimisticLockingFailureException.class,
                    FacilityBookingException.InvalidStatusTransitionException.class);
        }
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(approved).get(0).getNewStatus())
                .as("마지막 이력은 최종 상태와 일치한다").isEqualTo(finalState.getStatus());
    }
}

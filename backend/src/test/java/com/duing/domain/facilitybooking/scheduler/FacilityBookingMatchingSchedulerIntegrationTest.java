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
        return clubRepository.save(club);
    }

    /** 정규화 키 충돌 시나리오용 — 접미사 없이 정확한 이름으로 ACTIVE 동아리를 저장한다. */
    private Club saveActiveClubExact(String exactName) throws Exception {
        Club club = Club.create(exactName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
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
     * 지정한 세대 시각(crawledAt)으로 SUCCESS 스냅샷을 기록한다. 정확 세대 결박은 크롤 행의 crawledAt 이
     * 스냅샷 crawledAt 과 일치해야 확정하므로, 행과 스냅샷이 같은 세대임을 표현하려면 이 시각을 공유해야 한다.
     */
    private void recordSuccessSnapshot(YearMonth yearMonth, LocalDateTime crawledAt) {
        FacilityMonthSnapshot snapshot = snapshotRepository.findByYearMonth(yearMonth)
                .orElseGet(() -> FacilityMonthSnapshot.create(yearMonth, crawledAt,
                        CrawlSource.SCHEDULER, FetchStatus.FAILED, null));
        snapshot.recordSuccessful(crawledAt, CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null);
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
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, null, null, generation));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, null, null, generation));

        Long mismatched = pendingBooking(fixture, date, 9, 10);
        adminService.approve(admin.getId(), mismatched);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "전혀다른단체", null, null, generation));

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
    @DisplayName("스냅샷이 SUCCESS 가 아닌 월은 건너뛴다 — 반쪽 데이터로 오판하지 않는다")
    void skipsNonSuccessMonths() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();
        Long approved = pendingBooking(fixture, date, 11, 12);
        adminService.approve(admin.getId(), approved);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(11, 0), LocalTime.of(12, 0), clubName, null, null, LocalDateTime.now()));
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
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, null, null, LocalDateTime.now()));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, null, null, LocalDateTime.now()));

        // 시설을 아카이브 — 크롤이 잔존 행을 지우지 않아도 매칭 대상에서 제외돼야 한다
        fixture.facility().archive(LocalDateTime.now());
        facilityRepository.save(fixture.facility());

        recordSuccessSnapshot(YearMonth.from(date));
        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(approved).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("스냅샷 세대(crawledAt)와 다른 세대의 크롤 행은 커버로 인정하지 않는다 — 정확 세대 결박")
    void skipsRowsOfDifferentGeneration() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();

        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        // 완전 커버하지만 crawledAt 이 스냅샷 세대(generation)와 다른 이전 세대(-10분)의 행 — 옛 15분 창이면
        // 통과했겠지만 정확 세대 결박(행 crawledAt == 스냅샷 crawledAt)이 제외해 미커버가 된다.
        LocalDateTime generation = LocalDateTime.now();
        LocalDateTime previousGeneration = generation.minusMinutes(10);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, null, null, previousGeneration));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, null, null, previousGeneration));

        recordSuccessSnapshot(YearMonth.from(date), generation); // 스냅샷 세대 = generation (행보다 10분 최신)
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
                LocalTime.of(18, 0), LocalTime.of(19, 0), bandName, null, null, generation));
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), bandName, null, null, generation));

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
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, null, null, generation));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, null, null, generation));
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

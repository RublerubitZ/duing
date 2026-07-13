package com.duing.domain.facilitybooking.scheduler;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
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
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminService;
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
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

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
        // 오늘+3 은 항상 미래이면서 다음 달 말일 이내다(현재월의 어느 날이든 다음 달 말일까지 최소 4주 여유)
        return LocalDate.now().plusDays(3);
    }

    private Long pendingBooking(Fixture fixture, LocalDate date, int startHour, int endHour) {
        return bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null)).bookingId();
    }

    /**
     * 해당 월 스냅샷을 SUCCESS 로 기록한다. FacilityMonthSnapshot 의 실제 API 에 맞춘다 —
     * 최초 생성은 create(yearMonth, crawledAt, source, fetchStatus, lastError) 팩토리,
     * 성공 기록은 recordSuccessful(crawledAt, source, fetchStatus, lastError)(4-인자) 를 사용한다.
     */
    private void recordSuccessSnapshot(YearMonth yearMonth) {
        FacilityMonthSnapshot snapshot = snapshotRepository.findByYearMonth(yearMonth)
                .orElseGet(() -> FacilityMonthSnapshot.create(yearMonth, LocalDateTime.now(),
                        CrawlSource.SCHEDULER, FetchStatus.FAILED, null));
        snapshot.recordSuccessful(LocalDateTime.now(), CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null);
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

        Long matched = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), matched);
        // 학교가 동아리명 그대로 18~19·19~20 점유행 등록
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, null, null, LocalDateTime.now()));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, null, null, LocalDateTime.now()));

        Long mismatched = pendingBooking(fixture, date, 9, 10);
        adminService.approve(admin.getId(), mismatched);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "전혀다른단체", null, null, LocalDateTime.now()));

        recordSuccessSnapshot(YearMonth.from(date));
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
    @DisplayName("스냅샷 기준보다 오래된 크롤 행(-1시간)은 커버로 인정하지 않는다 — 행 신선도 가드")
    void skipsStaleCrawlRows() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();

        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        // 완전 커버하지만 crawledAt 이 스냅샷 기준보다 1시간 이른 행 — 신선도 가드로 제외돼 미커버가 된다
        LocalDateTime staleCrawledAt = LocalDateTime.now().minusHours(1);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, null, null, staleCrawledAt));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, null, null, staleCrawledAt));

        recordSuccessSnapshot(YearMonth.from(date)); // 스냅샷 crawledAt = now (행보다 1시간 최신)
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
                LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null)).bookingId();
        adminService.approve(admin.getId(), approved);
        // 동아리명 그대로 18~20 을 완전 커버하는 점유행 — 키 충돌만 없으면 자동 확정될 상태
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), bandName, null, null, LocalDateTime.now()));
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), bandName, null, null, LocalDateTime.now()));

        recordSuccessSnapshot(YearMonth.from(date));
        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(approved).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED); // 키 충돌 → 자동 확정 스킵(수동 확정 폴백)
    }
}

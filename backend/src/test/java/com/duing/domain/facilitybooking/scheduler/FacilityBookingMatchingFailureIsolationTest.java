package com.duing.domain.facilitybooking.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;

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
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
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
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * 매칭 잡의 예약 단위 실패 격리(try/catch) 계약 고정 테스트 — 스파이 빈으로 특정 예약에만 예외를 주입해야
 * 하므로(컨텍스트 오염 방지) 본체 통합 테스트와 클래스를 분리한다. 픽스처 헬퍼는 같은 패키지의
 * {@link FacilityBookingMatchingSchedulerIntegrationTest} 코드를 그대로 복제한다(사이드 파일 패턴 일치).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.facility.booking.matching.enabled=true")
class FacilityBookingMatchingFailureIsolationTest extends IntegrationTestBase {

    @Autowired FacilityBookingMatchingScheduler scheduler;
    @MockitoSpyBean FacilityBookingMatchingService matchingService;
    @Autowired FacilityBookingAdminService adminService;
    @Autowired FacilityBookingService bookingService;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired FacilityMonthSnapshotRepository snapshotRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ---------- fixtures (FacilityBookingMatchingSchedulerIntegrationTest 와 동일) ----------

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

    private Long approvedBookingWithMatchingRows(Fixture fixture, User admin, LocalDate date,
            int startHour, int endHour, LocalDateTime generation) throws Exception {
        Long bookingId = bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
        adminService.approve(admin.getId(), bookingId);
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();
        for (int hour = startHour; hour < endHour; hour++) {
            facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                    sequence.getAndIncrement(), YearMonth.from(date), date,
                    LocalTime.of(hour, 0), LocalTime.of(hour + 1, 0), clubName, null, null, generation));
        }
        return bookingId;
    }

    /** 전 시설 성공 크롤 — 저장된 모든 시설이 이 세대의 성공 집합에 들어간다(세대 결박 판별 근거). */
    private void recordSuccessSnapshot(YearMonth yearMonth, LocalDateTime crawledAt) {
        FacilityMonthSnapshot snapshot = snapshotRepository.findByYearMonth(yearMonth)
                .orElseGet(() -> FacilityMonthSnapshot.create(yearMonth, crawledAt,
                        CrawlSource.SCHEDULER, FetchStatus.FAILED, null));
        snapshot.recordSuccessful(crawledAt, CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null,
                facilityRepository.findAll().stream().map(Facility::getId).toList());
        snapshotRepository.save(snapshot);
    }

    // ---------- tests ----------

    @Test
    @DisplayName("한 건의 매칭 처리 실패가 사이클을 죽이지 않는다 — 나머지 예약은 그대로 자동 확정된다")
    void isolatesPerBookingFailure() throws Exception {
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        LocalDateTime generation = LocalDateTime.now();

        Fixture failingFixture = fixture();
        Long failingBooking = approvedBookingWithMatchingRows(failingFixture, admin, date, 9, 10, generation);
        Fixture healthyFixture = fixture();
        Long healthyBooking = approvedBookingWithMatchingRows(healthyFixture, admin, date, 18, 20, generation);
        recordSuccessSnapshot(YearMonth.from(date), generation);

        // 특정 예약 한 건에만 처리 실패를 주입한다 — 데이터 이상·일시 장애로 한 건이 영구 실패하는 상황 재현
        doThrow(new IllegalStateException("주입된 처리 실패"))
                .when(matchingService).verifyAndConfirm(eq(failingBooking), anyString(), anySet());

        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(healthyBooking).orElseThrow().getStatus())
                .as("실패 건 이후의 예약도 확정된다 — try/catch 격리가 제거되면 이 단언이 깨진다")
                .isEqualTo(BookingStatus.CONFIRMED);
        assertThat(bookingRepository.findById(failingBooking).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }
}

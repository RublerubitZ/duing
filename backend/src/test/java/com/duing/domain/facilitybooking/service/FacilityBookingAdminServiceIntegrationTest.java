package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
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

/**
 * 관리자 액션 서비스(승인 재검증·거절·수동확정·충돌·취소) 통합 테스트.
 * 픽스처 헬퍼(saveUser/saveActiveClub/saveFacility/fixture/bookableDate/sequence)는
 * 같은 패키지의 {@link FacilityBookingServiceIntegrationTest} 코드를 그대로 복제한다(사이드 파일 패턴 일치).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityBookingAdminServiceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilityBookingAdminService adminService;
    @Autowired FacilityBookingService bookingService;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilityBookingStatusHistoryRepository historyRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ---------- fixtures (FacilityBookingServiceIntegrationTest 와 동일) ----------

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

    // ---------- tests ----------

    private Long pendingBooking(Fixture fixture, LocalDate date, int startHour, int endHour) {
        return bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
    }

    @Test
    @DisplayName("승인은 APPROVED + 결정자·크롤 기준 시각 + 이력을 남긴다")
    void approveHappyPath() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        Long bookingId = pendingBooking(fixture, bookableDate(), 18, 20);

        adminService.approve(admin.getId(), bookingId);

        FacilityBooking approved = bookingRepository.findById(bookingId).orElseThrow();
        assertThat(approved.getStatus()).isEqualTo(BookingStatus.APPROVED);
        assertThat(approved.getDecidedById()).isEqualTo(admin.getId());
        var histories = historyRepository.findByBookingIdOrderByCreatedAtDesc(bookingId);
        assertThat(histories.get(0).getNewStatus()).isEqualTo(BookingStatus.APPROVED);
        assertThat(histories.get(0).getChangedById()).isEqualTo(admin.getId());
    }

    @Test
    @DisplayName("승인 시 크롤 점유행과 겹치면 SchoolConflict 409, 운영행 겹침은 승인된다")
    void approveRevalidatesAgainstSchoolRows() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        Long blocked = pendingBooking(fixture, date, 18, 20);
        // 신청 이후에 학교 점유행(꼬리 없음)이 크롤로 유입된 상황
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), "문화팀", null, null, LocalDateTime.now()));

        assertThatThrownBy(() -> adminService.approve(admin.getId(), blocked))
                .isInstanceOf(FacilityBookingException.SchoolConflictException.class);

        // 운영행(꼬리 있음)만 겹치는 다른 신청은 승인된다
        Long allowed = pendingBooking(fixture, date, 9, 11);
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "고정관념",
                LocalTime.of(9, 0), LocalTime.of(20, 0), LocalDateTime.now()));
        adminService.approve(admin.getId(), allowed);
        assertThat(bookingRepository.findById(allowed).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("수동 확정은 학교 점유행과 겹쳐도 성공한다 — 표기 차이로 자동 매칭이 못 잡은 자기 등록 행의 관리자 오버라이드 경로다")
    void confirmManuallyOverridesSchoolRows() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        // 승인 후 자기 동아리의 학교 등록 행이 표기 차이로 유입 — 정규화 불일치라 자동 매칭 불발(§5.3).
        // 이 시나리오에서 학교 점유 재검증을 걸면 수동 확정이 필요한 모든 경우가 409 가 된다(2026-07-17 감사).
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(20, 0), "두잉 대관동아리(중앙)", null, null, LocalDateTime.now()));

        adminService.confirmManually(admin.getId(), approved);

        FacilityBooking confirmed = bookingRepository.findById(approved).orElseThrow();
        assertThat(confirmed.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(confirmed.getConfirmedAt()).isNotNull();
        var histories = historyRepository.findByBookingIdOrderByCreatedAtDesc(approved);
        assertThat(histories.get(0).getNewStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(histories.get(0).getCrawlBasisAt()).isNotNull(); // 판정 근거 크롤 세대는 계속 기록
    }

    @Test
    @DisplayName("확정 취소는 슬롯을 해제한다 — 취소 후 같은 시간대의 다른 신청이 승인된다")
    void cancellingConfirmedReleasesSlot() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        Long confirmed = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), confirmed);
        adminService.confirmManually(admin.getId(), confirmed);

        adminService.cancel(admin.getId(), confirmed, "학교 측 사정으로 예약 취소");
        assertThat(bookingRepository.findById(confirmed).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CANCELLED);
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(confirmed).get(0).getReason())
                .isEqualTo("학교 측 사정으로 예약 취소");

        // CANCELLED 는 EXCLUDE 대상에서 이탈 — 겹치는 타 동아리 신청이 승인까지 통과한다
        User otherLeader = saveUser("리더B");
        Club otherClub = saveActiveClub("후속동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        Long successor = bookingService.create(new CreateFacilityBookingCommand(
                otherClub.getId(), otherLeader.getId(), fixture.facility().getId(),
                date, LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
        adminService.approve(admin.getId(), successor);
        assertThat(bookingRepository.findById(successor).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("아카이브된 시설의 신청은 승인되지 않는다 — 시설 잠금 하 아카이브 재검증")
    void approveRejectsArchivedFacility() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        Long bookingId = pendingBooking(fixture, bookableDate(), 18, 20);
        // 신청 접수 후 일일 시설 동기화가 학교 목록에서 사라진 시설을 아카이브한 상황
        Facility archived = facilityRepository.findById(fixture.facility().getId()).orElseThrow();
        archived.archive(LocalDateTime.now());
        facilityRepository.save(archived);

        assertThatThrownBy(() -> adminService.approve(admin.getId(), bookingId))
                .isInstanceOf(FacilityBookingException.ArchivedFacilityException.class);
        assertThat(bookingRepository.findById(bookingId).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.PENDING);
    }

    @Test
    @DisplayName("아카이브된 시설의 승인 건은 수동 확정되지 않는다 — 잔존 크롤 행 오확정 방지")
    void confirmManuallyRejectsArchivedFacility() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        Long bookingId = pendingBooking(fixture, bookableDate(), 18, 20);
        adminService.approve(admin.getId(), bookingId);
        Facility archived = facilityRepository.findById(fixture.facility().getId()).orElseThrow();
        archived.archive(LocalDateTime.now());
        facilityRepository.save(archived);

        assertThatThrownBy(() -> adminService.confirmManually(admin.getId(), bookingId))
                .isInstanceOf(FacilityBookingException.ArchivedFacilityException.class);
        assertThat(bookingRepository.findById(bookingId).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("겹치는 두 PENDING 을 동시에 승인하면 정확히 1건만 APPROVED 다 (시설 잠금 직렬화)")
    void concurrentApproveSerializesPerFacility() throws Exception {
        Fixture first = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        Long firstBooking = pendingBooking(first, date, 18, 20);
        // 타 동아리의 겹치는 PENDING (PENDING 겹침은 설계상 허용)
        User otherLeader = saveUser("리더B");
        Club otherClub = saveActiveClub("경쟁동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        Long secondBooking = bookingService.create(new CreateFacilityBookingCommand(
                otherClub.getId(), otherLeader.getId(), first.facility().getId(),
                date, LocalTime.of(19, 0), LocalTime.of(21, 0), "회의", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();

        // 두 스레드를 같은 출발선에서 풀어 실제 경합을 만든다 — invokeAll 은 블로킹이라
        // startGate 를 열 틈이 없으므로 submit 으로 Future 를 먼저 확보한 뒤 gate 를 연다.
        CountDownLatch startGate = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> approveFirst = () -> {
            startGate.await(5, TimeUnit.SECONDS);
            return tryApprove(admin.getId(), firstBooking);
        };
        Callable<Throwable> approveSecond = () -> {
            startGate.await(5, TimeUnit.SECONDS);
            return tryApprove(admin.getId(), secondBooking);
        };
        List<Future<Throwable>> outcomes = List.of(pool.submit(approveFirst), pool.submit(approveSecond));
        startGate.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS)).isTrue();

        long successes = outcomes.stream().map(this::quietGet).filter(failure -> failure == null).count();
        assertThat(successes).as("정확히 한 건만 승인").isEqualTo(1);
        List<Throwable> failures = outcomes.stream().map(this::quietGet)
                .filter(failure -> failure != null).toList();
        assertThat(failures).hasSize(1);
        assertThat(failures.get(0))
                .as("후행은 잠금 대기 후 선행의 APPROVED 를 보고 우아한 409 로 실패해야 한다 — 제약 위반이면 잠금 회귀")
                .isInstanceOf(FacilityBookingException.SlotUnavailableException.class);
        long approvedCount = bookingRepository.findOverlapping(first.facility().getId(), date,
                List.of(BookingStatus.APPROVED), LocalTime.of(18, 0), LocalTime.of(21, 0)).size();
        assertThat(approvedCount).isEqualTo(1);
    }

    @Test
    @DisplayName("거절·수동확정·충돌전환·관리자취소 전이와 이력이 규칙대로 동작한다")
    void adminTransitionsFollowMatrix() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();

        Long rejected = pendingBooking(fixture, date, 9, 10);
        adminService.reject(admin.getId(), rejected, "시설 점검 기간입니다");
        assertThat(bookingRepository.findById(rejected).orElseThrow().getRejectReason())
                .isEqualTo("시설 점검 기간입니다");

        Long confirmed = pendingBooking(fixture, date, 11, 12);
        adminService.approve(admin.getId(), confirmed);
        adminService.confirmManually(admin.getId(), confirmed);
        assertThat(bookingRepository.findById(confirmed).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);
        // CONFIRMED 취소는 관리자 전용 복구 경로 — 학교 측 취소·오확정 정정(§4.3)
        adminService.cancel(admin.getId(), confirmed, "학교 측 취소 확인");
        assertThat(bookingRepository.findById(confirmed).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CANCELLED);

        Long conflicted = pendingBooking(fixture, date, 13, 14);
        adminService.approve(admin.getId(), conflicted);
        adminService.markConflict(admin.getId(), conflicted, "문화팀 일정과 충돌");
        // CONFLICT 재승인 경로(§4.2)
        adminService.approve(admin.getId(), conflicted);
        assertThat(bookingRepository.findById(conflicted).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);

        adminService.cancel(admin.getId(), conflicted, "동아리 요청으로 취소");
        FacilityBooking cancelled = bookingRepository.findById(conflicted).orElseThrow();
        assertThat(cancelled.getStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(cancelled.getRejectReason()).isNull(); // 취소 사유는 이력에만
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(conflicted).get(0).getReason())
                .isEqualTo("동아리 요청으로 취소");
    }

    private Throwable tryApprove(Long adminId, Long bookingId) {
        try {
            adminService.approve(adminId, bookingId);
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }
}

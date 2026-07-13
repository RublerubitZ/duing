package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
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
 * 픽스처 헬퍼(saveUser/saveActiveClub/saveFacility/fixture/forceStatus/bookableDate/sequence)는
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
        // 오늘+3 은 항상 미래이면서 다음 달 말일 이내다(현재월의 어느 날이든 다음 달 말일까지 최소 4주 여유)
        return LocalDate.now().plusDays(3);
    }

    private void forceStatus(FacilityBooking booking, BookingStatus status) throws Exception {
        Field statusField = FacilityBooking.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(booking, status);
    }

    // ---------- tests ----------

    private Long pendingBooking(Fixture fixture, LocalDate date, int startHour, int endHour) {
        return bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null)).bookingId();
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
                date, LocalTime.of(19, 0), LocalTime.of(21, 0), "회의", null)).bookingId();

        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> approveFirst = () -> tryApprove(admin.getId(), firstBooking);
        Callable<Throwable> approveSecond = () -> tryApprove(admin.getId(), secondBooking);
        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(approveFirst, approveSecond));
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS)).isTrue();

        long successes = outcomes.stream().map(this::quietGet).filter(failure -> failure == null).count();
        assertThat(successes).as("정확히 한 건만 승인").isEqualTo(1);
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
        // CONFIRMED 는 완전 터미널 — 관리자 취소도 409
        assertThatThrownBy(() -> adminService.cancel(admin.getId(), confirmed, "불가"))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);

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

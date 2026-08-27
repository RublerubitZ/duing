package com.duing.domain.facilitybooking.service;

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
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
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
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/**
 * 예약 상태 전이 → 인앱 알림 발행(스펙 §7.6 이행, 2026-07-17 감사 후속) 통합 테스트.
 * 전이 트랜잭션 커밋 후 AFTER_COMMIT 리스너가 수신자별 알림을 dedup 멱등으로 남기는지 검증한다.
 * 픽스처 헬퍼는 같은 패키지의 {@link FacilityBookingServiceIntegrationTest} 코드를 그대로 복제한다(사이드 파일 패턴).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityBookingNotificationIntegrationTest extends IntegrationTestBase {

    @Autowired FacilityBookingService bookingService;
    @Autowired FacilityBookingAdminService adminService;
    @Autowired FacilityBookingMatchingService matchingService;
    @Autowired NotificationRepository notificationRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired FacilityMonthSnapshotRepository snapshotRepository;
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

    private User saveAdmin(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L), name + unique, "hashed",
                UserRole.ADMIN, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정",
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

    private Long pendingBooking(Fixture fixture, LocalDate date, int startHour, int endHour) {
        return bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
    }

    private List<Notification> notificationsOf(Long userId, NotificationType type) {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getUserId().equals(userId)
                        && notification.getType() == type)
                .toList();
    }

    // ---------- tests ----------

    @Test
    @DisplayName("신청이 접수되면 ADMIN 전원에게 접수 알림이 남고, 신청 동아리 운영진에게는 남지 않는다")
    void submittedNotifiesAdmins() throws Exception {
        User admin = saveAdmin("총동연");
        Fixture fixture = fixture();

        pendingBooking(fixture, bookableDate(), 18, 20);

        List<Notification> adminNotifications =
                notificationsOf(admin.getId(), NotificationType.FACILITY_BOOKING_SUBMITTED);
        assertThat(adminNotifications).hasSize(1);
        assertThat(adminNotifications.get(0).getBody()).contains("커뮤니티룸(1)");
        assertThat(adminNotifications.get(0).getLinkUrl()).isEqualTo("/admin/facility-bookings");
        assertThat(notificationsOf(fixture.leader().getId(), NotificationType.FACILITY_BOOKING_SUBMITTED))
                .isEmpty();
    }

    @Test
    @DisplayName("승인되면 신청 동아리 운영진에게 승인 알림이 남고, 일반 부원에게는 남지 않는다")
    void approvedNotifiesOfficersOnly() throws Exception {
        Fixture fixture = fixture();
        User member = saveUser("일반부원");
        clubMemberRepository.save(ClubMember.asMember(fixture.club(), member));
        User admin = saveAdmin("총동연");
        Long bookingId = pendingBooking(fixture, bookableDate(), 18, 20);

        adminService.approve(admin.getId(), bookingId);

        List<Notification> leaderNotifications =
                notificationsOf(fixture.leader().getId(), NotificationType.FACILITY_BOOKING_APPROVED);
        assertThat(leaderNotifications).hasSize(1);
        assertThat(leaderNotifications.get(0).getLinkUrl())
                .isEqualTo("/manage/clubs/" + fixture.club().getId() + "/facility-bookings");
        assertThat(notificationsOf(member.getId(), NotificationType.FACILITY_BOOKING_APPROVED)).isEmpty();
    }

    @Test
    @DisplayName("거절되면 운영진 알림 본문에 거절 사유가 포함된다")
    void rejectedNotificationCarriesReason() throws Exception {
        Fixture fixture = fixture();
        User admin = saveAdmin("총동연");
        Long bookingId = pendingBooking(fixture, bookableDate(), 9, 10);

        adminService.reject(admin.getId(), bookingId, "시설 점검 기간입니다");

        List<Notification> rejected =
                notificationsOf(fixture.leader().getId(), NotificationType.FACILITY_BOOKING_REJECTED);
        assertThat(rejected).hasSize(1);
        assertThat(rejected.get(0).getBody()).contains("시설 점검 기간입니다");
    }

    @Test
    @DisplayName("충돌 전환은 신청 동아리 운영진과 ADMIN 양쪽에 알림을 남긴다")
    void conflictNotifiesOfficersAndAdmins() throws Exception {
        Fixture fixture = fixture();
        User admin = saveAdmin("총동연");
        Long bookingId = pendingBooking(fixture, bookableDate(), 11, 12);
        adminService.approve(admin.getId(), bookingId);

        adminService.markConflict(admin.getId(), bookingId, "문화팀 일정과 충돌");

        assertThat(notificationsOf(fixture.leader().getId(), NotificationType.FACILITY_BOOKING_CONFLICT))
                .hasSize(1)
                .first().satisfies(notification ->
                        assertThat(notification.getBody()).contains("문화팀 일정과 충돌"));
        assertThat(notificationsOf(admin.getId(), NotificationType.FACILITY_BOOKING_CONFLICT)).hasSize(1);
    }

    @Test
    @DisplayName("관리자가 확정 예약을 취소하면 운영진 알림 본문에 취소 사유가 포함된다")
    void adminCancelNotifiesOfficersWithReason() throws Exception {
        Fixture fixture = fixture();
        User admin = saveAdmin("총동연");
        Long bookingId = pendingBooking(fixture, bookableDate(), 13, 14);
        adminService.approve(admin.getId(), bookingId);
        adminService.confirmManually(admin.getId(), bookingId);

        adminService.cancel(admin.getId(), bookingId, "학교 측 사정으로 취소");

        List<Notification> cancelled =
                notificationsOf(fixture.leader().getId(), NotificationType.FACILITY_BOOKING_CANCELLED);
        assertThat(cancelled).hasSize(1);
        assertThat(cancelled.get(0).getBody()).contains("학교 측 사정으로 취소");
        // 확정 알림도 앞서 남아 있어야 한다 (수동 확정 경로)
        assertThat(notificationsOf(fixture.leader().getId(), NotificationType.FACILITY_BOOKING_CONFIRMED))
                .hasSize(1);
    }

    @Test
    @DisplayName("매칭 잡의 자동 확정도 운영진에게 확정 알림을 남긴다")
    void autoConfirmNotifiesOfficers() throws Exception {
        Fixture fixture = fixture();
        User admin = saveAdmin("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();
        LocalDateTime generation = LocalDateTime.now();
        Long bookingId = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), bookingId);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, generation));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, generation));
        FacilityMonthSnapshot snapshot = snapshotRepository.findByYearMonth(YearMonth.from(date))
                .orElseGet(() -> FacilityMonthSnapshot.create(YearMonth.from(date), generation,
                        CrawlSource.SCHEDULER, FetchStatus.FAILED, null));
        snapshot.recordSuccessful(generation, CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null,
                List.of(fixture.facility().getId()));
        snapshotRepository.save(snapshot);

        boolean confirmed = matchingService.verifyAndConfirm(bookingId, clubName, Set.of(), Set.of());

        assertThat(confirmed).isTrue();
        assertThat(notificationsOf(fixture.leader().getId(), NotificationType.FACILITY_BOOKING_CONFIRMED))
                .hasSize(1);
    }
}

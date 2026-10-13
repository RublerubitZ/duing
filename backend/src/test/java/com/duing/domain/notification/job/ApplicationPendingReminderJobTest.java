package com.duing.domain.notification.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubStaffFixture;
import com.duing.common.fixture.ClubStaffFixture.Staff;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.PendingApplicationPolicy;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.time.TimeMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 미처리 지원서 리마인더 잡 — 7일 넘게 SUBMITTED 로 남은 지원서를 모집별로 세어 운영진에게 하루 1건.
 * 고정 시계 대신 주입된 seoulClock 기준 상대 시각으로 픽스처를 만들고, created_at(감사 필드)은 저장 뒤 JDBC 로 과거화한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.notification.jobs.enabled=true")
class ApplicationPendingReminderJobTest extends IntegrationTestBase {

    @Autowired private ApplicationPendingReminderJob job;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    private Staff saveClubWithStaff() {
        return ClubStaffFixture.saveWithStaff(clubRepository, userRepository, clubMemberRepository);
    }

    private Recruitment saveOpenRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        return recruitmentRepository.save(Recruitment.create(club, "모집" + sequence.incrementAndGet(),
                null, startDate, endDate, 10));
    }

    private Recruitment saveOngoingRecruitment(Club club) {
        LocalDate today = LocalDate.now(clock);
        return saveOpenRecruitment(club, today.minusDays(30), today.plusDays(7));
    }

    /** 지정 상태의 지원서를 저장한다 — 상태 전이는 도메인 메서드로(면접 미사용 모집). */
    private Application saveApplication(Recruitment recruitment, ApplicationStatus status) {
        Application application = Application.submit(recruitment, saveUser(), List.of());
        if (status != ApplicationStatus.SUBMITTED) {
            application.transitionTo(status, false);
        }
        return applicationRepository.saveAndFlush(application);
    }

    /**
     * 제출 시각을 과거로 옮긴다. created_at 은 @CreatedDate 가 INSERT 때 덮어써 저장 뒤 JDBC 로 바꾼다.
     * 감사 필드는 system regime(JVM 기본 존 벽시계)이라 잡과 같은 TimeMapper.systemNow(clock) 를 기준으로 삼는다.
     */
    private void submittedAgo(Application application, Duration age) {
        LocalDateTime submittedAt = TimeMapper.systemNow(clock).minus(age);
        jdbcTemplate.update("UPDATE application SET created_at = ? WHERE id = ?",
                Timestamp.valueOf(submittedAt), application.getId());
    }

    private void saveSubmittedApplicationDaysAgo(Recruitment recruitment, int daysAgo) {
        submittedAgo(saveApplication(recruitment, ApplicationStatus.SUBMITTED), Duration.ofDays(daysAgo));
    }

    private List<Notification> remindersOf(User user) {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getUserId().equals(user.getId())
                        && notification.getType() == NotificationType.APPLICATION_PENDING_REMINDER)
                .toList();
    }

    private List<Notification> allReminders() {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.APPLICATION_PENDING_REMINDER)
                .toList();
    }

    // ── 테스트 ───────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("7일 넘게 SUBMITTED 로 남은 지원서만 세어 회장·임원에게 리마인더를 보내고, 일반 부원에게는 보내지 않는다")
    void remindsOfficersWithPendingCountOfSubmittedOlderThanSevenDays() {
        Staff staff = saveClubWithStaff();
        Recruitment recruitment = saveOngoingRecruitment(staff.club());
        LocalDate today = LocalDate.now(clock);

        // 집계 대상 2건: 10일 전, 그리고 7일 경계 바로 바깥(7일 + 1시간 전 — 실행 중 시계가 흐르므로 정확히 7일은 결정적으로 못 만든다).
        saveSubmittedApplicationDaysAgo(recruitment, 10);
        submittedAgo(saveApplication(recruitment, ApplicationStatus.SUBMITTED),
                Duration.ofDays(7).plusHours(1));
        // 제외: 7일 경계 바로 안쪽(7일 − 1시간 전 — 픽스처와 실행 사이 시간이 흘러도 경계를 넘지 않을 여유)·6일 전 SUBMITTED.
        submittedAgo(saveApplication(recruitment, ApplicationStatus.SUBMITTED),
                Duration.ofDays(7).minusHours(1));
        saveSubmittedApplicationDaysAgo(recruitment, 6);
        // 제외: 오래됐어도 운영진이 손댄 지원서(보류·합격·불합격).
        for (ApplicationStatus handledStatus
                : List.of(ApplicationStatus.ON_HOLD, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED)) {
            submittedAgo(saveApplication(recruitment, handledStatus), Duration.ofDays(10));
        }
        // 제외: 철회(soft-delete)된 SUBMITTED.
        Application withdrawn = saveApplication(recruitment, ApplicationStatus.SUBMITTED);
        applicationRepository.delete(withdrawn);
        submittedAgo(withdrawn, Duration.ofDays(10));

        job.run();

        List<Notification> leaderReminders = remindersOf(staff.leader());
        assertThat(leaderReminders).hasSize(1);
        Notification reminder = leaderReminders.get(0);
        assertThat(reminder.getTitle()).isEqualTo("지원서 2건이 7일 넘게 대기 중이에요");
        assertThat(reminder.getBody()).isEqualTo(recruitment.getTitle() + " · 지원자가 결과를 기다리고 있어요");
        assertThat(reminder.getLinkUrl()).isEqualTo("/manage/clubs/" + staff.club().getId()
                + "/recruitments/" + recruitment.getId() + "/applicants?status=SUBMITTED");
        assertThat(reminder.getDedupKey())
                .isEqualTo("APPLICATION_PENDING_REMINDER:r=" + recruitment.getId() + ":on=" + today);
        assertThat(((Number) reminder.getPayload().get("recruitmentId")).longValue()).isEqualTo(recruitment.getId());
        assertThat(((Number) reminder.getPayload().get("clubId")).longValue()).isEqualTo(staff.club().getId());
        assertThat(((Number) reminder.getPayload().get("pendingCount")).longValue()).isEqualTo(2L);
        assertThat(remindersOf(staff.officer())).hasSize(1);
        assertThat(remindersOf(staff.member())).isEmpty();
    }

    @Test
    @DisplayName("7일 넘은 미처리 지원서가 없으면(6일 전 제출뿐) 리마인더를 보내지 않는다")
    void noReminderWhenNothingIsOlderThanSevenDays() {
        Staff staff = saveClubWithStaff();
        Recruitment recruitment = saveOngoingRecruitment(staff.club());
        saveSubmittedApplicationDaysAgo(recruitment, 6);

        job.run();

        assertThat(allReminders()).isEmpty();
    }

    @Test
    @DisplayName("수동 마감(CLOSED)된 모집과 운영 중단(비 ACTIVE) 동아리의 모집은 미처리 지원서가 있어도 리마인더 대상이 아니다")
    void excludesClosedRecruitmentAndInactiveClub() {
        Staff closedRecruitmentStaff = saveClubWithStaff();
        LocalDate today = LocalDate.now(clock);
        Recruitment closedRecruitment = Recruitment.create(closedRecruitmentStaff.club(), "마감모집",
                null, today.minusDays(30), today.plusDays(7), 10);
        closedRecruitment.close(LocalDateTime.now(clock));
        recruitmentRepository.save(closedRecruitment);
        saveSubmittedApplicationDaysAgo(closedRecruitment, 10);

        Staff inactiveClubStaff = saveClubWithStaff();
        Recruitment inactiveClubRecruitment = saveOngoingRecruitment(inactiveClubStaff.club());
        saveSubmittedApplicationDaysAgo(inactiveClubRecruitment, 10);
        // 운영 중단 전환의 벌크 마감을 우회해 동아리만 INACTIVE 로 만든다. 수신자 조회도 ACTIVE 를 걸어 알림 0건만으로는
        // 후보 쿼리의 c.status 조건을 입증하지 못하므로, 후보 목록이 비는지 직접 본다.
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", inactiveClubStaff.club().getId());

        assertThat(applicationRepository.findPendingReminderCandidates(
                PendingApplicationPolicy.submittedBefore(clock))).isEmpty();
        job.run();

        assertThat(allReminders()).isEmpty();
    }

    @Test
    @DisplayName("마감일이 지났지만 아직 OPEN 인 모집(심사 기간)의 미처리 지원서는 리마인더 대상이다")
    void includesExpiredOpenRecruitmentInReviewPeriod() {
        Staff staff = saveClubWithStaff();
        LocalDate today = LocalDate.now(clock);
        Recruitment reviewingRecruitment = saveOpenRecruitment(staff.club(), today.minusDays(30), today.minusDays(3));
        saveSubmittedApplicationDaysAgo(reviewingRecruitment, 10);

        job.run();

        assertThat(remindersOf(staff.leader())).extracting(Notification::getTitle)
                .containsExactly("지원서 1건이 7일 넘게 대기 중이에요");
    }

    @Test
    @DisplayName("같은 날 잡을 두 번 실행해도 운영진당 리마인더는 1건이다(멱등)")
    void rerunOnSameDayIsIdempotent() {
        Staff staff = saveClubWithStaff();
        Recruitment recruitment = saveOngoingRecruitment(staff.club());
        saveSubmittedApplicationDaysAgo(recruitment, 10);

        job.run();
        job.run();

        assertThat(remindersOf(staff.leader())).hasSize(1);
        assertThat(remindersOf(staff.officer())).hasSize(1);
        assertThat(allReminders()).hasSize(2);
    }
}

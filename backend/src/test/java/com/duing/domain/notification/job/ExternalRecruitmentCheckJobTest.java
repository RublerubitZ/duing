package com.duing.domain.notification.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubStaffFixture;
import com.duing.common.fixture.ClubStaffFixture.Staff;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 외부 폼 상시모집 유지 확인 잡 — 시작 후 30일 주기마다 운영진에게 "아직 받고 있는지" 확인 알림을 1건 보낸다.
 * 고정 시계 대신 주입된 seoulClock 기준 상대 날짜로 시작일을 만든다(start_date 는 date 컬럼이라 저장값 그대로 쓴다).
 * 동아리당 진행 중(OPEN) 모집은 1건(V38)이라 케이스마다 동아리를 따로 만든다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.notification.jobs.enabled=true")
class ExternalRecruitmentCheckJobTest extends IntegrationTestBase {

    private static final String BODY_SUFFIX = " · 아직 받고 있다면 그대로 두고, 마감했다면 '접수 마감'을 눌러 주세요";

    @Autowired private ExternalRecruitmentCheckJob job;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private NotificationService notificationService;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private Staff saveClubWithStaff() {
        return ClubStaffFixture.saveWithStaff(clubRepository, userRepository, clubMemberRepository);
    }

    /** 외부 폼 모집(저장 전) — 종료일이 null 이면 상시모집. V10 CHECK(chk_recruitment_external_url) 때문에 URL 필수. */
    private Recruitment externalRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        return Recruitment.createWithOptions(club, "외부폼모집" + sequence.incrementAndGet(), null,
                startDate, endDate, 10, ApplicationMode.EXTERNAL, "https://forms.gle/aBcD1234", false,
                TargetRole.MEMBER, null, null, false);
    }

    /** 시작 후 daysOpen 일이 지난 외부 폼 상시모집. */
    private Recruitment saveAlwaysOpenExternalRecruitment(Club club, int daysOpen) {
        return recruitmentRepository.save(
                externalRecruitment(club, LocalDate.now(clock).minusDays(daysOpen), null));
    }

    /** 픽스처와 실행 사이 KST 자정이 지나면 경과일이 하루 밀리므로, 제목의 일수는 실행 뒤 오늘로 다시 계산한다. */
    private int daysOpenNow(Recruitment recruitment) {
        return (int) ChronoUnit.DAYS.between(recruitment.getStartDate(), LocalDate.now(clock));
    }

    private List<Notification> checksOf(User user) {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getUserId().equals(user.getId())
                        && notification.getType() == NotificationType.EXTERNAL_RECRUITMENT_STILL_OPEN)
                .toList();
    }

    private List<Notification> allChecks() {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.EXTERNAL_RECRUITMENT_STILL_OPEN)
                .toList();
    }

    // ── 테스트 ───────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("시작 후 30일이 지난 외부 폼 상시모집은 회장·임원에게 유지 확인 알림을 1건씩 보내고, 일반 부원에게는 보내지 않는다")
    void notifiesOfficersWhenExternalAlwaysOpenRecruitmentReachesThirtyDays() {
        Staff staff = saveClubWithStaff();
        Recruitment recruitment = saveAlwaysOpenExternalRecruitment(staff.club(), 30);

        job.run();

        int daysOpen = daysOpenNow(recruitment);
        List<Notification> leaderChecks = checksOf(staff.leader());
        assertThat(leaderChecks).hasSize(1);
        Notification check = leaderChecks.get(0);
        assertThat(check.getTitle()).isEqualTo("외부 폼 모집이 " + daysOpen + "일째 열려 있어요");
        assertThat(check.getBody()).isEqualTo(recruitment.getTitle() + BODY_SUFFIX);
        assertThat(check.getLinkUrl()).isEqualTo("/manage/clubs/" + staff.club().getId()
                + "/recruitments/" + recruitment.getId());
        assertThat(check.getDedupKey())
                .isEqualTo("EXTERNAL_RECRUITMENT_STILL_OPEN:r=" + recruitment.getId() + ":p=1");
        assertThat(((Number) check.getPayload().get("recruitmentId")).longValue()).isEqualTo(recruitment.getId());
        assertThat(((Number) check.getPayload().get("clubId")).longValue()).isEqualTo(staff.club().getId());
        assertThat(((Number) check.getPayload().get("daysOpen")).intValue()).isEqualTo(daysOpen);
        assertThat(checksOf(staff.officer())).hasSize(1);
        assertThat(checksOf(staff.member())).isEmpty();
    }

    @Test
    @DisplayName("시작 후 29일째인 외부 폼 상시모집은 아직 유지 확인 대상이 아니다")
    void noCheckBeforeThirtyDays() {
        Staff staff = saveClubWithStaff();
        saveAlwaysOpenExternalRecruitment(staff.club(), 29);

        job.run();

        assertThat(allChecks()).isEmpty();
    }

    @Test
    @DisplayName("시작 후 65일째면 두 번째 주기(p=2) 키로 운영진당 1건을 보낸다")
    void sixtyFiveDaysUsesSecondPeriodKey() {
        Staff staff = saveClubWithStaff();
        Recruitment recruitment = saveAlwaysOpenExternalRecruitment(staff.club(), 65);

        job.run();

        assertThat(checksOf(staff.leader()))
                .extracting(Notification::getTitle, Notification::getDedupKey)
                .containsExactly(tuple(
                        "외부 폼 모집이 " + daysOpenNow(recruitment) + "일째 열려 있어요",
                        "EXTERNAL_RECRUITMENT_STILL_OPEN:r=" + recruitment.getId() + ":p=2"));
        assertThat(checksOf(staff.officer())).hasSize(1);
    }

    @Test
    @DisplayName("자체 폼 상시모집·외부 폼 기간 모집·접수 마감한 외부 폼·수동 마감(CLOSED)·시작 전 모집·운영 중단 동아리의 모집은 유지 확인 대상이 아니다")
    void excludesNonTargetRecruitments() {
        LocalDate today = LocalDate.now(clock);
        // 자체 폼(SELF) 상시모집 — 지원서가 두잉에 있어 접수·미처리 알림이 닿는다.
        recruitmentRepository.save(Recruitment.create(saveClubWithStaff().club(), "자체폼상시모집",
                null, today.minusDays(40), null, 10));
        // 외부 폼 기간 모집 — 종료일이 지나면 표시가 자동으로 마감된다.
        recruitmentRepository.save(externalRecruitment(saveClubWithStaff().club(),
                today.minusDays(40), today.plusDays(10)));
        // 접수 마감한 외부 폼 상시모집 — stopIntake 가 종료일(어제)을 확정해 상시모집이 아니게 된다.
        Recruitment stoppedIntake = externalRecruitment(saveClubWithStaff().club(), today.minusDays(40), null);
        stoppedIntake.stopIntake(today);
        recruitmentRepository.save(stoppedIntake);
        // 수동 마감(CLOSED)된 외부 폼 상시모집.
        Recruitment closed = externalRecruitment(saveClubWithStaff().club(), today.minusDays(40), null);
        closed.close(LocalDateTime.now(clock));
        recruitmentRepository.save(closed);
        // 시작 전(내일 시작) 외부 폼 상시모집.
        recruitmentRepository.save(externalRecruitment(saveClubWithStaff().club(), today.plusDays(1), null));
        // 운영 중단(INACTIVE) 동아리 — 벌크 마감을 우회해 동아리만 바꾼다. 수신자 조회도 ACTIVE 를 걸어
        // 알림 0건만으로는 후보 쿼리의 c.status 조건을 입증하지 못하므로, 아래에서 후보 목록이 비는지 직접 본다.
        Staff inactiveClubStaff = saveClubWithStaff();
        saveAlwaysOpenExternalRecruitment(inactiveClubStaff.club(), 40);
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", inactiveClubStaff.club().getId());

        assertThat(recruitmentRepository.findExternalStillOpenCandidates(
                today, ExternalRecruitmentCheckJob.CHECK_INTERVAL_DAYS)).isEmpty();
        job.run();

        assertThat(allChecks()).isEmpty();
    }

    @Test
    @DisplayName("같은 날 잡을 두 번 실행해도 운영진당 유지 확인 알림은 1건이다(멱등)")
    void rerunOnSameDayIsIdempotent() {
        Staff staff = saveClubWithStaff();
        saveAlwaysOpenExternalRecruitment(staff.club(), 30);

        job.run();
        job.run();

        assertThat(checksOf(staff.leader())).hasSize(1);
        assertThat(checksOf(staff.officer())).hasSize(1);
        assertThat(allChecks()).hasSize(2);
    }

    @Test
    @DisplayName("같은 주기 안에서 다음 날 다시 실행해도 추가 알림이 없다 — 날짜가 아닌 주기 번호로 중복을 막는다")
    void nextDayInSamePeriodAddsNothing() {
        Staff staff = saveClubWithStaff();
        Recruitment recruitment = saveAlwaysOpenExternalRecruitment(staff.club(), 30);
        job.run();

        // 다음 날(31일째) 실행 — 고정 시계 컨텍스트를 따로 띄우지 않고 하루 앞선 시계로 잡을 직접 만든다.
        // 날짜 기반 키("on=오늘")였다면 오늘과 다른 키가 생겨 여기서 추가 알림이 남는다.
        new ExternalRecruitmentCheckJob(recruitmentRepository, clubMemberRepository, notificationService,
                Clock.offset(clock, Duration.ofDays(1))).run();

        assertThat(checksOf(staff.leader())).extracting(Notification::getDedupKey)
                .containsExactly("EXTERNAL_RECRUITMENT_STILL_OPEN:r=" + recruitment.getId() + ":p=1");
        assertThat(allChecks()).hasSize(2);
    }
}

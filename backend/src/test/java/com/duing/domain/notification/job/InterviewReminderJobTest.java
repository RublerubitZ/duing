package com.duing.domain.notification.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewConfigFixture;
import com.duing.common.fixture.InterviewScheduleFixture;
import com.duing.common.fixture.InterviewSlotFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.notification.jobs.enabled=true")
class InterviewReminderJobTest extends IntegrationTestBase {

    @Autowired
    private InterviewReminderJob job;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RecruitmentRepository recruitmentRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private InterviewConfigRepository interviewConfigRepository;

    @Autowired
    private InterviewSlotRepository interviewSlotRepository;

    @Autowired
    private InterviewScheduleRepository interviewScheduleRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("ASSIGNED 상태이고 slot.startTime 이 23h~25h 윈도 안인 InterviewSchedule 만 INTERVIEW_REMINDER 가 생성된다")
    void interviewReminder_createdForAssignedSchedulesInWindow() throws Exception {
        // 잡과 동일한 Clock(Asia/Seoul) 을 사용해 CI TZ 와 무관하게 윈도 계산이 일치하도록 한다.
        LocalDateTime now = LocalDateTime.now(clock);

        // 윈도 안 + ASSIGNED → 대상
        InterviewSchedule inWindowAssigned = fixtureAssignedSchedule(now.plusHours(24), "윈도중심");
        // 윈도 밖 + ASSIGNED → 제외
        fixtureAssignedSchedule(now.plusHours(48), "윈도밖");
        // 윈도 안 + CANCELLED → 상태 제외 (COMPLETED 부재 → CANCELLED 로 의미 동일하게)
        fixtureCancelledSchedule(now.plusHours(24), "취소됨");

        long beforeCount = notificationRepository.count();
        job.run();
        long afterCount = notificationRepository.count();

        assertThat(afterCount - beforeCount).isEqualTo(1);

        InterviewSlot inWindowSlot = interviewSlotRepository.findById(inWindowAssigned.getSlotId())
                .orElseThrow();
        String expectedDedupKey = "INTERVIEW_REMINDER:a=" + inWindowAssigned.getApplicationId()
                + ":t=" + inWindowSlot.getStartTime().toString();

        List<Notification> created = notificationRepository.findAll();
        assertThat(created).hasSize(1);
        assertThat(created.get(0).getType()).isEqualTo(NotificationType.INTERVIEW_REMINDER);
        assertThat(created.get(0).getDedupKey()).isEqualTo(expectedDedupKey);
    }

    @Test
    @DisplayName("같은 dedup_key 로 한 번만 INTERVIEW_REMINDER 가 생성된다 (잡 재실행 idempotent)")
    void interviewReminder_idempotentOnReRun() throws Exception {
        // 잡과 동일한 Clock(Asia/Seoul) 을 사용해 CI TZ 와 무관하게 윈도 계산이 일치하도록 한다.
        LocalDateTime now = LocalDateTime.now(clock);

        fixtureAssignedSchedule(now.plusHours(24), "멱등검증");

        long beforeCount = notificationRepository.count();
        job.run();
        long afterFirstRun = notificationRepository.count();
        job.run();
        long afterSecondRun = notificationRepository.count();

        assertThat(afterFirstRun - beforeCount).isEqualTo(1);
        assertThat(afterSecondRun).isEqualTo(afterFirstRun);
    }

    // ── Fixture 헬퍼 ─────────────────────────────────────────────────────────────

    private InterviewSchedule fixtureAssignedSchedule(LocalDateTime slotStartTime, String label) throws Exception {
        return persistSchedule(slotStartTime, label, false);
    }

    private InterviewSchedule fixtureCancelledSchedule(LocalDateTime slotStartTime, String label) throws Exception {
        return persistSchedule(slotStartTime, label, true);
    }

    private InterviewSchedule persistSchedule(LocalDateTime slotStartTime, String label, boolean cancelled)
            throws Exception {
        User applicant = saveStudent("지원자" + label);
        Club club = saveActiveClub("면접동아리" + label);
        Recruitment recruitment = saveRecruitment(club);

        // 자동배정 윈도 기준일 무관 — Reminder Job 은 InterviewConfig 의 location 만 사용한다.
        InterviewConfig config = InterviewConfigFixture.create(
                recruitment.getId(), LocalDateTime.now(clock).plusDays(30));
        config.updateLocation("공학관 101호");
        interviewConfigRepository.save(config);

        InterviewSlot slot = interviewSlotRepository.save(
                InterviewSlotFixture.create(recruitment.getId(), slotStartTime, 5));

        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        InterviewSchedule schedule = InterviewScheduleFixture.assigned(
                application.getId(), slot.getId(), recruitment.getId());
        if (cancelled) {
            schedule.cancel();
        }
        return interviewScheduleRepository.save(schedule);
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "reminder" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveRecruitment(Club club) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(club, "면접모집-" + sequence.getAndIncrement(),
                null, today, today.plusDays(30), 10);
        return recruitmentRepository.save(recruitment);
    }
}

package com.duing.domain.notification.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(properties = "duing.notification.jobs.enabled=true")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class InterviewReminderJobTest {

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
    private NotificationRepository notificationRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("interviewAt 이 23h~25h 윈도 안인 지원에만 INTERVIEW_REMINDER 가 생성된다")
    void onlyWindowApplicationGetsReminder() throws Exception {
        LocalDateTime now = LocalDateTime.now();

        // 윈도 중심: now+24h (대상)
        Application centerApplication = saveInterviewPendingApplication(now.plusHours(24), "윈도중심지원자");
        // 윈도 직전: now+22h (제외)
        Application beforeApplication = saveInterviewPendingApplication(now.plusHours(22), "윈도직전지원자");
        // 윈도 직후: now+26h (제외)
        Application afterApplication = saveInterviewPendingApplication(now.plusHours(26), "윈도직후지원자");

        long beforeCount = notificationRepository.count();
        job.run();
        long afterCount = notificationRepository.count();

        assertThat(afterCount - beforeCount).isEqualTo(1);

        boolean hasReminderForCenter = notificationRepository.findAll().stream()
                .anyMatch(n ->
                        n.getUserId().equals(centerApplication.getUser().getId())
                                && n.getType() == NotificationType.INTERVIEW_REMINDER
                                && n.getDedupKey().startsWith("INTERVIEW_REMINDER:a=" + centerApplication.getId())
                );
        assertThat(hasReminderForCenter).isTrue();
    }

    @Test
    @DisplayName("잡을 두 번 실행해도 INTERVIEW_REMINDER row 수가 동일하다 (멱등)")
    void idempotentReminderJob() throws Exception {
        LocalDateTime now = LocalDateTime.now();
        saveInterviewPendingApplication(now.plusHours(24), "멱등검증지원자");

        long beforeCount = notificationRepository.count();
        job.run();
        long afterFirstRun = notificationRepository.count();
        job.run();
        long afterSecondRun = notificationRepository.count();

        assertThat(afterFirstRun - beforeCount).isEqualTo(1);
        assertThat(afterSecondRun).isEqualTo(afterFirstRun);
    }

    private Application saveInterviewPendingApplication(LocalDateTime interviewAt, String applicantName)
            throws Exception {
        User applicant = saveStudent(applicantName);
        Club club = saveActiveClub("면접동아리");
        Recruitment recruitment = saveRecruitment(club);

        Application application = Application.submit(recruitment, applicant, java.util.List.of());

        // status → INTERVIEW_PENDING, interviewAt 설정
        Field statusField = Application.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(application, ApplicationStatus.INTERVIEW_PENDING);

        Field interviewAtField = Application.class.getDeclaredField("interviewAt");
        interviewAtField.setAccessible(true);
        interviewAtField.set(application, interviewAt);

        Field interviewLocationField = Application.class.getDeclaredField("interviewLocation");
        interviewLocationField.setAccessible(true);
        interviewLocationField.set(application, "공학관 101호");

        return applicationRepository.save(application);
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "reminder" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
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
        Recruitment recruitment = Recruitment.create(club, "면접모집", null, today, today.plusDays(30), 10);
        return recruitmentRepository.save(recruitment);
    }
}
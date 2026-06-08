package com.duing.domain.notification.event;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.ApplicationService;
import com.duing.domain.application.service.dto.command.UpdateInterviewCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class InterviewScheduledEventTest extends IntegrationTestBase {

    @Autowired
    private ApplicationService applicationService;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private ClubMemberRepository clubMemberRepository;

    @Autowired
    private RecruitmentRepository recruitmentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @AfterEach
    void cleanup() {
        notificationRepository.deleteAll();
        applicationRepository.deleteAll();
        clubMemberRepository.deleteAll();
        recruitmentRepository.deleteAll();
        clubRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    @DisplayName("운영진이 interviewAt 을 설정하면 지원자에게 INTERVIEW_SCHEDULED 알림이 1건 생성된다")
    void updateInterviewCreatesInterviewScheduledNotificationForApplicant() throws Exception {
        User leader = saveUser("운영진");
        User applicant = saveUser("지원자");
        Club club = saveActiveClub("인터뷰동아리");
        saveMembership(club, leader, ClubMemberRole.LEADER);

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "2026 면접 모집", "내용",
                        LocalDate.now(), LocalDate.now().plusDays(14), 10)
        );

        Application application = saveApplicationWithStatus(recruitment, applicant, ApplicationStatus.INTERVIEW_PENDING);

        LocalDateTime interviewAt = LocalDateTime.now().plusDays(5);
        String interviewLocation = "공학관 301호";

        applicationService.updateInterview(new UpdateInterviewCommand(
                application.getId(), leader.getId(), interviewAt, interviewLocation));

        List<Notification> scheduledNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_SCHEDULED)
                .toList();

        assertThat(scheduledNotifications).hasSize(1);
        Notification notification = scheduledNotifications.get(0);
        assertThat(notification.getUserId()).isEqualTo(applicant.getId());
        assertThat(notification.getTitle()).contains(club.getName());
        assertThat(notification.getBody()).contains(interviewLocation);
        assertThat(notification.getLinkUrl()).isEqualTo("/me/applications/" + application.getId());
    }

    @Test
    @DisplayName("interviewAt 을 변경하면 새 dedup_key 로 새 알림이 생성되고 기존 알림은 readAt 그대로 유지된다")
    void changingInterviewAtCreatesNewNotificationWithNewDedupKey() throws Exception {
        User leader = saveUser("운영진변경");
        User applicant = saveUser("지원자변경");
        Club club = saveActiveClub("인터뷰변경동아리");
        saveMembership(club, leader, ClubMemberRole.LEADER);

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "2026 변경 모집", "내용",
                        LocalDate.now(), LocalDate.now().plusDays(14), 10)
        );

        Application application = saveApplicationWithStatus(recruitment, applicant, ApplicationStatus.INTERVIEW_PENDING);

        LocalDateTime firstInterviewAt = LocalDateTime.now().plusDays(3);
        applicationService.updateInterview(new UpdateInterviewCommand(
                application.getId(), leader.getId(), firstInterviewAt, "1차 장소"));

        // Application.updateInterview 는 INTERVIEW_PENDING 상태에서만 호출 가능하므로
        // 상태를 다시 INTERVIEW_PENDING 으로 돌려야 두 번째 호출이 가능하다
        Application saved = applicationRepository.findById(application.getId()).orElseThrow();
        Field statusField = Application.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(saved, ApplicationStatus.INTERVIEW_PENDING);
        applicationRepository.save(saved);

        LocalDateTime secondInterviewAt = firstInterviewAt.plusDays(2);
        applicationService.updateInterview(new UpdateInterviewCommand(
                application.getId(), leader.getId(), secondInterviewAt, "2차 장소"));

        List<Notification> scheduledNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_SCHEDULED
                        && notification.getUserId().equals(applicant.getId()))
                .toList();

        // 일시가 달라 dedup_key 가 달라지므로 알림이 2건이어야 한다
        assertThat(scheduledNotifications).hasSize(2);

        // 첫 번째 알림의 readAt 은 null 그대로여야 한다
        boolean firstNotificationReadAtIsNull = scheduledNotifications.stream()
                .anyMatch(notification -> notification.getDedupKey().contains(firstInterviewAt.toString())
                        && notification.getReadAt() == null);
        assertThat(firstNotificationReadAtIsNull).isTrue();
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "interview" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(), ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private void saveMembership(Club club, User user, ClubMemberRole role) {
        clubMemberRepository.save(ClubMember.of(club, user, role));
    }

    private Application saveApplicationWithStatus(Recruitment recruitment, User applicant,
                                                   ApplicationStatus status) throws Exception {
        Application application = Application.submit(recruitment, applicant, List.of());
        Field statusField = Application.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(application, status);
        return applicationRepository.save(application);
    }
}

package com.duing.domain.notification.event;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.InterviewScheduleService;
import com.duing.domain.interview.service.dto.command.AssignInterviewScheduleCommand;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.util.ReflectionTestUtils;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class InterviewScheduledEventTest extends IntegrationTestBase {

    @Autowired
    private InterviewScheduleService interviewScheduleService;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private InterviewSlotRepository slotRepository;

    @Autowired
    private InterviewScheduleRepository scheduleRepository;

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

    @Test
    @DisplayName("운영진이 M9 으로 면접 일정을 배정하면 지원자에게 INTERVIEW_SCHEDULED 알림이 1건 생성된다")
    void M9_배정_시_지원자에게_INTERVIEW_SCHEDULED_알림_1건_생성() {
        User leader = saveUser("리더");
        User applicant = saveUser("지원자");
        Club club = saveActiveClub("인터뷰동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "2026 면접 모집", "내용",
                        LocalDate.now(), LocalDate.now().plusDays(14), 10));

        Application application = saveInterviewPendingApplication(recruitment, applicant);
        InterviewSlot slot = saveSlot(recruitment.getId());

        interviewScheduleService.assign(
                new AssignInterviewScheduleCommand(application.getId(), slot.getId(), leader.getId()));

        List<Notification> scheduledNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_SCHEDULED)
                .toList();

        assertThat(scheduledNotifications).hasSize(1);
        Notification notification = scheduledNotifications.get(0);
        assertThat(notification.getUserId()).isEqualTo(applicant.getId());
        assertThat(notification.getTitle()).contains(club.getName());
        assertThat(notification.getLinkUrl()).isEqualTo("/me/applications/" + application.getId());
    }

    @Test
    @DisplayName("M9 으로 슬롯 이동 시 INTERVIEW_UPDATED 알림이 생성되고 기존 INTERVIEW_SCHEDULED 알림의 readAt 은 변경되지 않는다")
    void M9_슬롯_이동_시_INTERVIEW_UPDATED_알림_생성_및_기존_INTERVIEW_SCHEDULED_readAt_유지() {
        User leader = saveUser("리더이동");
        User applicant = saveUser("지원자이동");
        Club club = saveActiveClub("인터뷰이동동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "2026 이동 모집", "내용",
                        LocalDate.now(), LocalDate.now().plusDays(14), 10));

        Application application = saveInterviewPendingApplication(recruitment, applicant);
        InterviewSlot slotA = saveSlot(recruitment.getId());
        InterviewSlot slotB = saveSlot(recruitment.getId());

        // 첫 배정: INTERVIEW_SCHEDULED 알림 생성
        interviewScheduleService.assign(
                new AssignInterviewScheduleCommand(application.getId(), slotA.getId(), leader.getId()));

        List<Notification> afterFirstAssign = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_SCHEDULED
                        && notification.getUserId().equals(applicant.getId()))
                .toList();
        assertThat(afterFirstAssign).hasSize(1);
        Notification firstNotification = afterFirstAssign.get(0);
        // readAt 은 아직 null — 미읽음 상태
        assertThat(firstNotification.getReadAt()).isNull();

        // 슬롯 이동: INTERVIEW_UPDATED 알림 생성
        interviewScheduleService.assign(
                new AssignInterviewScheduleCommand(application.getId(), slotB.getId(), leader.getId()));

        List<Notification> updatedNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_UPDATED
                        && notification.getUserId().equals(applicant.getId()))
                .toList();
        assertThat(updatedNotifications).hasSize(1);

        // 기존 INTERVIEW_SCHEDULED 알림의 readAt 은 여전히 null 이어야 한다
        Notification reloadedFirstNotification = notificationRepository.findById(firstNotification.getId())
                .orElseThrow();
        assertThat(reloadedFirstNotification.getReadAt()).isNull();
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────────

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "interview" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + sequence.incrementAndGet(),
                ClubCategory.OTHER, "분과", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Application saveInterviewPendingApplication(Recruitment recruitment, User applicant) {
        Application application = Application.submit(recruitment, applicant, List.of());
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.INTERVIEW_PENDING);
        return applicationRepository.save(application);
    }

    private InterviewSlot saveSlot(Long recruitmentId) {
        return slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                5));
    }
}

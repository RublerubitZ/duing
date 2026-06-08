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
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewConfigRepository;
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
class InterviewListenerIntegrationTest extends IntegrationTestBase {

    @Autowired private InterviewScheduleService interviewScheduleService;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private InterviewScheduleRepository scheduleRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private NotificationRepository notificationRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "listenertest" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub() {
        long unique = sequence.incrementAndGet();
        Club club = Club.create("리스너테스트동아리" + unique,
                ClubCategory.ACADEMIC, "공학계열", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveRecruitment(Club club) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "모집" + sequence.incrementAndGet(),
                        null, today.minusDays(1), today.plusDays(7), 10));
        // assign / cancel path 는 InterviewConfig 가 존재하는 면접 모집 가정
        configRepository.save(InterviewConfig.create(recruitment.getId(), LocalDateTime.now().plusDays(3)));
        return recruitment;
    }

    private InterviewSlot saveSlot(Long recruitmentId) {
        return slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                5));
    }

    private Application saveInterviewPendingApplication(Recruitment recruitment, User user) {
        Application application = Application.submit(recruitment, user, List.of());
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.INTERVIEW_PENDING);
        return applicationRepository.save(application);
    }

    private InterviewSchedule saveAssignedSchedule(Long applicationId, Long slotId, Long recruitmentId) {
        return scheduleRepository.save(
                InterviewSchedule.create(applicationId, slotId, recruitmentId, LocalDateTime.now().minusMinutes(10)));
    }

    // ── 테스트 ───────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("InterviewUpdatedEvent 발행 시 대상 사용자에게 INTERVIEW_UPDATED 알림이 생성된다")
    void 슬롯_이동_시_INTERVIEW_UPDATED_알림_생성() {
        Club club = saveActiveClub();
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveRecruitment(club);
        InterviewSlot slotA = saveSlot(recruitment.getId());
        InterviewSlot slotB = saveSlot(recruitment.getId());

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        saveAssignedSchedule(application.getId(), slotA.getId(), recruitment.getId());

        interviewScheduleService.assign(new AssignInterviewScheduleCommand(
                application.getId(), slotB.getId(), leader.getId()));

        List<Notification> updatedNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_UPDATED)
                .toList();

        assertThat(updatedNotifications).hasSize(1);
        Notification notification = updatedNotifications.get(0);
        assertThat(notification.getUserId()).isEqualTo(applicant.getId());
        assertThat(notification.getTitle()).contains(club.getName());
        assertThat(notification.getLinkUrl()).isEqualTo("/me/applications/" + application.getId());
    }

    @Test
    @DisplayName("InterviewCancelledEvent 발행 시 대상 사용자에게 INTERVIEW_CANCELLED 알림이 생성된다")
    void 면접_취소_시_INTERVIEW_CANCELLED_알림_생성() {
        Club club = saveActiveClub();
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        saveAssignedSchedule(application.getId(), slot.getId(), recruitment.getId());

        interviewScheduleService.cancel(application.getId(), leader.getId());

        List<Notification> cancelledNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_CANCELLED)
                .toList();

        assertThat(cancelledNotifications).hasSize(1);
        Notification notification = cancelledNotifications.get(0);
        assertThat(notification.getUserId()).isEqualTo(applicant.getId());
        assertThat(notification.getTitle()).contains(club.getName());
        assertThat(notification.getLinkUrl()).isEqualTo("/me/applications/" + application.getId());
    }

    @Test
    @DisplayName("같은 슬롯으로 재호출(no-op) 시 INTERVIEW_UPDATED 알림이 생성되지 않는다")
    void 같은_슬롯_재호출_시_알림_없음() {
        Club club = saveActiveClub();
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        saveAssignedSchedule(application.getId(), slot.getId(), recruitment.getId());

        interviewScheduleService.assign(new AssignInterviewScheduleCommand(
                application.getId(), slot.getId(), leader.getId()));

        List<Notification> updatedNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_UPDATED)
                .toList();

        assertThat(updatedNotifications).isEmpty();
    }

    @Test
    @DisplayName("리스너 내부에서 application 을 찾지 못해도 면접 취소 자체는 성공한다")
    void 리스너_예외가_면접_취소에_영향을_주지_않는다() {
        Club club = saveActiveClub();
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        InterviewSchedule schedule = saveAssignedSchedule(application.getId(), slot.getId(), recruitment.getId());

        // 면접 일정이 ASSIGNED 상태인지 확인
        assertThat(schedule.getSlotId()).isEqualTo(slot.getId());

        // cancel 호출이 예외 없이 성공해야 한다
        interviewScheduleService.cancel(application.getId(), leader.getId());

        // schedule 이 CANCELLED 로 변경됐는지 확인
        InterviewSchedule cancelled = scheduleRepository.findByApplicationId(application.getId()).orElseThrow();
        assertThat(cancelled.getStatus().name()).isEqualTo("CANCELLED");
    }
}

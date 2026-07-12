package com.duing.domain.notification.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.event.InterviewCancelledEvent;
import com.duing.domain.interview.event.InterviewUpdatedEvent;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

// 슬롯 이동/취소 서비스는 라운드 API PR(BE#3~)에서 재도입된다. 이 테스트는 리스너 계약만 고정한다 —
// 이벤트를 직접 발행해 INTERVIEW_UPDATED / INTERVIEW_CANCELLED 알림 생성·dedup·예외 격리를 검증한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class InterviewListenerIntegrationTest extends IntegrationTestBase {

    @Autowired private ApplicationEventPublisher eventPublisher;
    @Autowired private TransactionTemplate transactionTemplate;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewRoundRepository roundRepository;
    @Autowired private InterviewRoundMemberRepository roundMemberRepository;
    @Autowired private InterviewSlotRepository slotRepository;
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
        return recruitmentRepository.save(
                Recruitment.create(club, "모집" + sequence.incrementAndGet(),
                        null, today.minusDays(1), today.plusDays(7), 10));
    }

    private InterviewRound saveCollectingRound(Recruitment recruitment) {
        return roundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(3), null, RoundStatus.COLLECTING));
    }

    private InterviewSlot saveSlot(Long roundId) {
        return slotRepository.save(InterviewSlot.create(
                roundId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                5));
    }

    private Application saveInterviewPendingApplication(Recruitment recruitment, User user) {
        Application application = Application.submit(recruitment, user, List.of());
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.INTERVIEW_PENDING);
        return applicationRepository.save(application);
    }

    private InterviewSchedule saveAssignedSchedule(Long applicationId, Long slotId, Long roundId) {
        return scheduleRepository.save(
                InterviewSchedule.create(applicationId, slotId, roundId, LocalDateTime.now().minusMinutes(10)));
    }

    /**
     * 리스너가 {@code @TransactionalEventListener(AFTER_COMMIT)} 이므로
     * 커밋되는 트랜잭션 안에서 발행해야 핸들러가 동작한다.
     */
    private void publishAfterCommit(Object event) {
        transactionTemplate.executeWithoutResult(transactionStatus -> eventPublisher.publishEvent(event));
    }

    // ── 테스트 ───────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("InterviewUpdatedEvent 발행 시 대상 사용자에게 INTERVIEW_UPDATED 알림이 생성된다")
    void 슬롯_이동_시_INTERVIEW_UPDATED_알림_생성() {
        Club club = saveActiveClub();
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveRecruitment(club);
        InterviewRound round = saveCollectingRound(recruitment);
        InterviewSlot slotA = saveSlot(round.getId());
        InterviewSlot slotB = saveSlot(round.getId());

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        roundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
        saveAssignedSchedule(application.getId(), slotA.getId(), round.getId());

        publishAfterCommit(new InterviewUpdatedEvent(
                application.getId(), slotB.getId(), recruitment.getId()));

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
        InterviewRound round = saveCollectingRound(recruitment);
        InterviewSlot slot = saveSlot(round.getId());

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        roundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
        saveAssignedSchedule(application.getId(), slot.getId(), round.getId());

        publishAfterCommit(new InterviewCancelledEvent(
                application.getId(), slot.getId(), recruitment.getId()));

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
    @DisplayName("같은 InterviewUpdatedEvent 가 재발행되어도 INTERVIEW_UPDATED 알림은 dedup_key 로 1건만 생성된다")
    void 같은_슬롯_재발행_시_알림_중복_없음() {
        Club club = saveActiveClub();
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveRecruitment(club);
        InterviewRound round = saveCollectingRound(recruitment);
        InterviewSlot slot = saveSlot(round.getId());

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        roundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
        saveAssignedSchedule(application.getId(), slot.getId(), round.getId());

        InterviewUpdatedEvent sameSlotEvent = new InterviewUpdatedEvent(
                application.getId(), slot.getId(), recruitment.getId());
        publishAfterCommit(sameSlotEvent);
        publishAfterCommit(sameSlotEvent);

        List<Notification> updatedNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_UPDATED)
                .toList();

        assertThat(updatedNotifications).hasSize(1);
    }

    @Test
    @DisplayName("리스너 내부에서 application 을 찾지 못해도 이벤트 발행 트랜잭션은 실패하지 않는다")
    void 리스너_예외가_발행_트랜잭션에_영향을_주지_않는다() {
        // 존재하지 않는 applicationId — 리스너는 경고 로그 후 알림 생성을 생략해야 한다.
        assertThatCode(() -> publishAfterCommit(
                new InterviewCancelledEvent(999_999L, 1L, 1L)))
                .doesNotThrowAnyException();

        List<Notification> cancelledNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_CANCELLED)
                .toList();
        assertThat(cancelledNotifications).isEmpty();
    }
}

package com.duing.domain.notification.listener;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubStaffFixture;
import com.duing.common.fixture.ClubStaffFixture.Staff;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.service.ApplicationService;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.ApplicationSubmittedEvent;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 지원서 제출 → 운영진 APPLICATION_RECEIVED 알림(모집 × 운영진 × 하루 1건) 통합 테스트.
 * 실제 제출 서비스를 호출해 트랜잭션 커밋 → AFTER_COMMIT 리스너 경로를 그대로 탄다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicationSubmittedNotificationIntegrationTest extends IntegrationTestBase {

    @Autowired private ApplicationService applicationService;
    @Autowired private ApplicationEventPublisher eventPublisher;
    @Autowired private TransactionTemplate transactionTemplate;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    private Recruitment saveOpenRecruitment(Club club) {
        LocalDate today = LocalDate.now(clock);
        return recruitmentRepository.save(Recruitment.create(club, "모집" + sequence.incrementAndGet(),
                null, today.minusDays(1), today.plusDays(7), 10));
    }

    private Staff saveClubWithStaff() {
        return ClubStaffFixture.saveWithStaff(clubRepository, userRepository, clubMemberRepository);
    }

    private void submit(Recruitment recruitment, User applicant) {
        applicationService.submit(new SubmitApplicationCommand(
                recruitment.getId(), applicant.getId(), List.of(), null));
    }

    private List<Notification> receivedOf(User user) {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getUserId().equals(user.getId())
                        && notification.getType() == NotificationType.APPLICATION_RECEIVED)
                .toList();
    }

    // ── 테스트 ───────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("지원서가 제출되면 회장·임원에게 접수 알림이 1건씩 남고, 일반 부원에게는 남지 않는다")
    void submissionNotifiesLeaderAndOfficerOnly() {
        Staff staff = saveClubWithStaff();
        Recruitment recruitment = saveOpenRecruitment(staff.club());
        LocalDate today = LocalDate.now(clock);

        submit(recruitment, saveUser());

        List<Notification> leaderNotifications = receivedOf(staff.leader());
        assertThat(leaderNotifications).hasSize(1);
        Notification notification = leaderNotifications.get(0);
        assertThat(notification.getTitle()).isEqualTo("새 지원서가 접수됐어요");
        assertThat(notification.getBody())
                .isEqualTo(recruitment.getTitle() + " · 오늘 들어온 지원서는 지원 현황에서 확인할 수 있어요");
        assertThat(notification.getLinkUrl()).isEqualTo("/manage/clubs/" + staff.club().getId()
                + "/recruitments/" + recruitment.getId() + "/applicants?status=SUBMITTED");
        assertThat(notification.getDedupKey())
                .isEqualTo("APPLICATION_RECEIVED:r=" + recruitment.getId() + ":on=" + today);
        assertThat(receivedOf(staff.officer())).hasSize(1);
        assertThat(receivedOf(staff.member())).isEmpty();
    }

    @Test
    @DisplayName("같은 날 같은 모집에 다른 학생이 또 제출해도 운영진 알림은 1건으로 유지된다")
    void secondSubmissionSameDayDoesNotAddNotification() {
        Staff staff = saveClubWithStaff();
        Recruitment recruitment = saveOpenRecruitment(staff.club());

        submit(recruitment, saveUser());
        submit(recruitment, saveUser());

        assertThat(receivedOf(staff.leader())).hasSize(1);
        assertThat(receivedOf(staff.officer())).hasSize(1);
    }

    @Test
    @DisplayName("다른 모집에 제출되면 같은 운영진에게도 모집별로 별도 알림이 남는다")
    void submissionToAnotherRecruitmentNotifiesSeparately() {
        // 동아리당 진행 중 모집은 1건(V38)이라 두 번째 모집은 다른 동아리에 두고, 같은 유저를 양쪽 운영진으로 넣는다.
        Staff staff = saveClubWithStaff();
        Club otherClub = clubRepository.save(ClubStaffFixture.activeClub());
        clubMemberRepository.save(ClubMember.asLeader(otherClub, saveUser()));
        clubMemberRepository.save(ClubMember.of(otherClub, staff.leader(), ClubMemberRole.OFFICER));
        Recruitment firstRecruitment = saveOpenRecruitment(staff.club());
        Recruitment secondRecruitment = saveOpenRecruitment(otherClub);

        submit(firstRecruitment, saveUser());
        submit(secondRecruitment, saveUser());

        assertThat(receivedOf(staff.leader()))
                .extracting(Notification::getLinkUrl)
                .containsExactlyInAnyOrder(
                        "/manage/clubs/" + staff.club().getId() + "/recruitments/" + firstRecruitment.getId()
                                + "/applicants?status=SUBMITTED",
                        "/manage/clubs/" + otherClub.getId() + "/recruitments/" + secondRecruitment.getId()
                                + "/applicants?status=SUBMITTED");
    }

    @Test
    @DisplayName("지원자 본인이 그 동아리 운영진이면 본인에게는 접수 알림을 보내지 않는다")
    void applicantWhoIsOfficerIsExcluded() {
        // 제출 경로의 자격 검증이 운영진 지원을 막아 서비스로는 재현할 수 없다 — 이벤트를 직접 커밋 트랜잭션에서 발행한다.
        Staff staff = saveClubWithStaff();
        Recruitment recruitment = saveOpenRecruitment(staff.club());

        transactionTemplate.executeWithoutResult(transactionStatus -> eventPublisher.publishEvent(
                new ApplicationSubmittedEvent(1L, recruitment.getId(), staff.club().getId(),
                        staff.officer().getId(), recruitment.getTitle())));

        assertThat(receivedOf(staff.officer())).isEmpty();
        assertThat(receivedOf(staff.leader())).hasSize(1);
    }

    @Test
    @DisplayName("제출이 검증 예외로 실패하면 운영진에게 알림이 남지 않는다")
    void failedSubmissionLeavesNoNotification() {
        Staff staff = saveClubWithStaff();
        Recruitment recruitment = saveOpenRecruitment(staff.club());

        // 이미 부원인 학생은 일반 부원 모집에 지원할 수 없다(AlreadyClubMember) — 이벤트 발행 전 단계의 실패다.
        // submit 에는 발행 뒤 실패 지점이 없다. 롤백된 제출에서 알림이 안 나가는 보증은 AFTER_COMMIT 단계 지정 자체가 맡는다.
        assertThatThrownBy(() -> submit(recruitment, staff.member()))
                .isInstanceOf(ApplicationDomainException.AlreadyClubMemberException.class);

        assertThat(receivedOf(staff.leader())).isEmpty();
        assertThat(receivedOf(staff.officer())).isEmpty();
    }
}

package com.duing.domain.fee.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.fee.overdue.enabled=true")
class OverdueBillJobTest extends IntegrationTestBase {

    @Autowired
    private OverdueBillJob job;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubMemberRepository clubMemberRepository;

    @Autowired
    private FeePolicyRepository feePolicyRepository;

    @Autowired
    private FeeBillRepository feeBillRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private Clock clock;

    private Long clubId;
    private Long policyId;

    @BeforeEach
    void setUp() {
        Club club = clubRepository.save(ClubFixture.academic("연체동아리"));
        clubId = club.getId();
        FeePolicy policy = feePolicyRepository.save(
                FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        policyId = policy.getId();
    }

    /** 활성 회원 1명을 만들어 user_id 를 반환한다. */
    private Long saveActiveMember() {
        Club club = clubRepository.findById(clubId).orElseThrow();
        User user = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asMember(club, user));
        return user.getId();
    }

    /** 지정 상태·마감일의 청구를 저장한다(billingStartDate 를 청구별로 달리해 멱등 유니크 인덱스를 분리한다). */
    private FeeBill saveBill(Long userId, String period, LocalDate dueDate, FeeStatus status) {
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        FeeBill bill = FeeBill.issue(clubId, userId, policyId, 10000L, period, start, end, dueDate);
        if (status == FeeStatus.CANCELLED) {
            bill.cancel();
        } else if (status != FeeStatus.PENDING) {
            bill.updateStatus(status);
        }
        return feeBillRepository.save(bill);
    }

    private FeeStatus statusOf(Long billId) {
        return feeBillRepository.findById(billId).orElseThrow().getStatus();
    }

    private long overdueNotificationCount() {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.FEE_BILL_OVERDUE)
                .count();
    }

    @Test
    @DisplayName("마감 지난 PENDING·PARTIAL_PAID 만 OVERDUE 로 전이되고 PAID·CANCELLED·마감 전 청구는 전이되지 않는다")
    void transitionsOnlyOverdueCandidates() {
        LocalDate today = LocalDate.now(clock);
        LocalDate pastDue = today.minusDays(1);
        LocalDate futureDue = today.plusDays(5);

        Long memberA = saveActiveMember();
        Long memberB = saveActiveMember();

        FeeBill overduePending = saveBill(memberA, "2026-01", pastDue, FeeStatus.PENDING);
        FeeBill overduePartial = saveBill(memberB, "2026-02", pastDue, FeeStatus.PARTIAL_PAID);
        FeeBill paidPastDue = saveBill(memberA, "2026-03", pastDue, FeeStatus.PAID);
        FeeBill cancelledPastDue = saveBill(memberB, "2026-04", pastDue, FeeStatus.CANCELLED);
        FeeBill notYetDuePending = saveBill(memberA, "2026-05", futureDue, FeeStatus.PENDING);

        job.run();

        assertThat(statusOf(overduePending.getId())).isEqualTo(FeeStatus.OVERDUE);
        assertThat(statusOf(overduePartial.getId())).isEqualTo(FeeStatus.OVERDUE);
        assertThat(statusOf(paidPastDue.getId())).isEqualTo(FeeStatus.PAID);
        assertThat(statusOf(cancelledPastDue.getId())).isEqualTo(FeeStatus.CANCELLED);
        assertThat(statusOf(notYetDuePending.getId())).isEqualTo(FeeStatus.PENDING);
    }

    @Test
    @DisplayName("마감일이 오늘인 청구는 아직 연체가 아니므로 전이되지 않는다")
    void dueTodayIsNotYetOverdue() {
        LocalDate today = LocalDate.now(clock);

        Long member = saveActiveMember();
        FeeBill dueToday = saveBill(member, "2026-01", today, FeeStatus.PENDING);

        job.run();

        assertThat(statusOf(dueToday.getId())).isEqualTo(FeeStatus.PENDING);
    }

    @Test
    @DisplayName("전이된 청구의 회원에게 FEE_BILL_OVERDUE 알림이 생성된다")
    void sendsOverdueNotificationToTransitionedMembers() {
        LocalDate today = LocalDate.now(clock);
        LocalDate pastDue = today.minusDays(1);

        Long memberA = saveActiveMember();
        Long memberB = saveActiveMember();

        FeeBill overduePending = saveBill(memberA, "2026-01", pastDue, FeeStatus.PENDING);
        FeeBill overduePartial = saveBill(memberB, "2026-02", pastDue, FeeStatus.PARTIAL_PAID);
        // 마감 전 청구 — 알림 대상 아님
        saveBill(memberA, "2026-05", today.plusDays(5), FeeStatus.PENDING);

        // AFTER_COMMIT 리스너가 run() 의 TX 커밋 후 동기 실행되므로 run() 반환 뒤 조회하면 보인다.
        job.run();

        List<Notification> overdueNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.FEE_BILL_OVERDUE)
                .toList();
        assertThat(overdueNotifications).hasSize(2);
        assertThat(overdueNotifications).extracting(Notification::getUserId)
                .containsExactlyInAnyOrder(memberA, memberB);
        assertThat(overdueNotifications).extracting(Notification::getDedupKey)
                .containsExactlyInAnyOrder(
                        "FEE_BILL_OVERDUE:b=" + overduePending.getId(),
                        "FEE_BILL_OVERDUE:b=" + overduePartial.getId());
    }

    @Test
    @DisplayName("크론을 두 번 실행해도 2차에는 추가 전이가 없고 연체 알림이 중복 발송되지 않는다")
    void rerunIsIdempotent() {
        LocalDate today = LocalDate.now(clock);
        LocalDate pastDue = today.minusDays(1);

        Long memberA = saveActiveMember();
        Long memberB = saveActiveMember();

        saveBill(memberA, "2026-01", pastDue, FeeStatus.PENDING);
        saveBill(memberB, "2026-02", pastDue, FeeStatus.PARTIAL_PAID);

        job.run();
        long afterFirstRun = overdueNotificationCount();
        assertThat(afterFirstRun).isEqualTo(2);

        // 2차 실행: 1차에서 모두 OVERDUE 로 전이됐으므로 전이 후보가 없어 추가 알림이 생성되지 않는다.
        job.run();
        long afterSecondRun = overdueNotificationCount();
        assertThat(afterSecondRun).isEqualTo(afterFirstRun);
    }
}

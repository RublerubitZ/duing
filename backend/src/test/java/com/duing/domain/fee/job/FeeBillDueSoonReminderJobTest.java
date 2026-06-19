package com.duing.domain.fee.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
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
@SpringBootTest(properties = "duing.fee.reminder.enabled=true")
class FeeBillDueSoonReminderJobTest extends IntegrationTestBase {

    @Autowired
    private FeeBillDueSoonReminderJob job;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private UserRepository userRepository;

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
        Club club = clubRepository.save(ClubFixture.academic("마감동아리"));
        clubId = club.getId();
        policyId = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L)).getId();
    }

    private Long saveBillRecipient() {
        return userRepository.save(UserFixture.unique()).getId();
    }

    /** 지정 동아리/정책/회원에 마감일·상태를 가진 청구를 저장한다(회차별 시작일을 달리해 멱등 유니크 인덱스를 분리한다). */
    private FeeBill saveBill(Long targetClubId, Long targetPolicyId, Long userId, String period,
                             LocalDate dueDate, FeeStatus status) {
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        FeeBill bill = FeeBill.issue(targetClubId, userId, targetPolicyId, 10000L, period, start, end, dueDate);
        if (status == FeeStatus.CANCELLED) {
            bill.cancel();
        } else if (status != FeeStatus.PENDING) {
            bill.updateStatus(status);
        }
        return feeBillRepository.save(bill);
    }

    private List<Notification> dueSoonNotifications() {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.FEE_BILL_DUE_SOON)
                .toList();
    }

    @Test
    @DisplayName("마감 D-3 / D-1 / D-0 인 미납 청구의 회원에게 각각 FEE_BILL_DUE_SOON 리마인더가 생성된다")
    void sendsRemindersForD3D1D0() {
        LocalDate today = LocalDate.now(clock);
        Long member = saveBillRecipient();

        FeeBill d3 = saveBill(clubId, policyId, member, "2026-01", today.plusDays(3), FeeStatus.PENDING);
        FeeBill d1 = saveBill(clubId, policyId, member, "2026-02", today.plusDays(1), FeeStatus.PENDING);
        FeeBill d0 = saveBill(clubId, policyId, member, "2026-03", today, FeeStatus.PARTIAL_PAID);

        job.run();

        assertThat(dueSoonNotifications()).extracting(Notification::getDedupKey)
                .containsExactlyInAnyOrder(
                        "FEE_BILL_DUE_SOON:b=" + d3.getId() + ":d=3",
                        "FEE_BILL_DUE_SOON:b=" + d1.getId() + ":d=1",
                        "FEE_BILL_DUE_SOON:b=" + d0.getId() + ":d=0");
        assertThat(dueSoonNotifications()).extracting(Notification::getTitle)
                .containsExactlyInAnyOrder(
                        "회비 마감이 3일 남았어요",
                        "회비 마감이 1일 남았어요",
                        "오늘 회비 마감이에요");
    }

    @Test
    @DisplayName("리마인더 대상 창(D-3/D-1/D-0) 밖의 청구(D-2)에는 알림이 생성되지 않는다")
    void skipsBillsOutsideReminderWindow() {
        LocalDate today = LocalDate.now(clock);
        Long member = saveBillRecipient();
        saveBill(clubId, policyId, member, "2026-01", today.plusDays(2), FeeStatus.PENDING); // D-2 — 비대상

        job.run();

        assertThat(dueSoonNotifications()).isEmpty();
    }

    @Test
    @DisplayName("마감 임박이라도 PAID / CANCELLED / OVERDUE 청구에는 리마인더가 생성되지 않는다(미납만 대상)")
    void skipsNonUnpaidBills() {
        LocalDate today = LocalDate.now(clock);
        Long member = saveBillRecipient();
        saveBill(clubId, policyId, member, "2026-01", today.plusDays(1), FeeStatus.PAID);
        saveBill(clubId, policyId, member, "2026-02", today.plusDays(1), FeeStatus.CANCELLED);
        saveBill(clubId, policyId, member, "2026-03", today.plusDays(1), FeeStatus.OVERDUE);

        job.run();

        assertThat(dueSoonNotifications()).isEmpty();
    }

    @Test
    @DisplayName("리마인더 제목·본문·링크·payload·수신자가 명세대로 구성된다")
    void buildsReminderContentAsSpecified() {
        LocalDate today = LocalDate.now(clock);
        LocalDate due = today.plusDays(1);
        Long member = saveBillRecipient();
        FeeBill bill = saveBill(clubId, policyId, member, "2026-05", due, FeeStatus.PENDING);

        job.run();

        List<Notification> reminders = dueSoonNotifications();
        assertThat(reminders).hasSize(1);
        Notification reminder = reminders.get(0);
        assertThat(reminder.getUserId()).isEqualTo(member);
        assertThat(reminder.getTitle()).isEqualTo("회비 마감이 1일 남았어요");
        assertThat(reminder.getBody()).isEqualTo("마감동아리 · 2026-05 · 마감 " + due);
        assertThat(reminder.getLinkUrl()).isEqualTo("/me/fees?billId=" + bill.getId());
        assertThat(reminder.getDedupKey()).isEqualTo("FEE_BILL_DUE_SOON:b=" + bill.getId() + ":d=1");
        assertThat(((Number) reminder.getPayload().get("billId")).longValue()).isEqualTo(bill.getId());
        assertThat(((Number) reminder.getPayload().get("clubId")).longValue()).isEqualTo(clubId);
    }

    @Test
    @DisplayName("크론을 두 번 실행해도 같은 청구·오프셋의 리마인더가 중복 생성되지 않는다(멱등)")
    void rerunIsIdempotent() {
        LocalDate today = LocalDate.now(clock);
        Long member = saveBillRecipient();
        saveBill(clubId, policyId, member, "2026-01", today.plusDays(1), FeeStatus.PENDING);
        saveBill(clubId, policyId, member, "2026-02", today.plusDays(3), FeeStatus.PENDING);

        job.run();
        long afterFirstRun = dueSoonNotifications().size();
        assertThat(afterFirstRun).isEqualTo(2);

        job.run();
        assertThat(dueSoonNotifications()).hasSize((int) afterFirstRun);
    }

    @Test
    @DisplayName("폐쇄(soft-delete)된 동아리의 청구는 리마인더 대상에서 제외된다")
    void excludesBillsOfSoftDeletedClub() {
        LocalDate today = LocalDate.now(clock);
        Club closedClub = clubRepository.save(ClubFixture.academic("폐쇄동아리"));
        Long closedClubId = closedClub.getId();
        Long closedPolicyId = feePolicyRepository.save(
                FeePolicyFixture.of(closedClubId, BillingType.MONTHLY, 10000L)).getId();
        Long member = saveBillRecipient();
        saveBill(closedClubId, closedPolicyId, member, "2026-01", today.plusDays(1), FeeStatus.PENDING);
        clubRepository.delete(closedClub); // @SQLDelete → deleted_at 설정

        job.run();

        assertThat(dueSoonNotifications()).isEmpty();
    }

    @Test
    @DisplayName("한 회원이 서로 다른 동아리에 마감 임박 청구를 가지면 청구마다 리마인더를 받는다")
    void remindsEachBillOfSameMemberAcrossClubs() {
        LocalDate today = LocalDate.now(clock);
        Long member = saveBillRecipient();
        FeeBill billInClubA = saveBill(clubId, policyId, member, "2026-01", today.plusDays(1), FeeStatus.PENDING);

        Club otherClub = clubRepository.save(ClubFixture.academic("다른동아리"));
        Long otherPolicyId = feePolicyRepository.save(
                FeePolicyFixture.of(otherClub.getId(), BillingType.MONTHLY, 10000L)).getId();
        FeeBill billInClubB = saveBill(otherClub.getId(), otherPolicyId, member, "2026-01",
                today.plusDays(3), FeeStatus.PENDING);

        job.run();

        assertThat(dueSoonNotifications()).extracting(Notification::getDedupKey)
                .containsExactlyInAnyOrder(
                        "FEE_BILL_DUE_SOON:b=" + billInClubA.getId() + ":d=1",
                        "FEE_BILL_DUE_SOON:b=" + billInClubB.getId() + ":d=3");
    }
}

package com.duing.domain.fee.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.FixedClockConfig;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.FeeBillService;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

// 오늘을 FixedClockConfig.TODAY(2026-06-15 Asia/Seoul)로 고정 — issue_day 비교(today.day=15)를 결정적으로 만든다.
@Import({TestcontainersConfiguration.class, FixedClockConfig.class})
@SpringBootTest(properties = "duing.fee.auto-issue.enabled=true")
class MonthlyBillIssueJobTest extends IntegrationTestBase {

    @Autowired MonthlyBillIssueJob job;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired NotificationRepository notificationRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired FeeBillService feeBillService;

    private Long clubId;

    @BeforeEach
    void setUp() {
        // 자동 발행은 운영 중(ACTIVE) 동아리만 대상이다 — 픽스처 기본값은 PENDING_APPROVAL.
        Club club = ClubFixture.academic("자동발행동아리");
        club.changeStatus(ClubStatus.ACTIVE, null, null);
        clubId = clubRepository.save(club).getId();
        addActiveMembers(2);
    }

    private void addActiveMembers(int count) {
        Club club = clubRepository.findById(clubId).orElseThrow();
        for (int index = 0; index < count; index++) {
            User user = userRepository.save(UserFixture.unique());
            clubMemberRepository.save(ClubMember.asMember(club, user));
        }
    }

    // created_at 은 감사(@CreatedDate)가 실제 시각으로 채우므로, 고정 '오늘'(2026-06-15) 기준 과거로 되돌린다.
    private FeePolicy saveAutoIssuePolicyCreatedAt(int issueDay, int dueDay, LocalDateTime createdAt) {
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, issueDay, dueDay));
        jdbcTemplate.update("UPDATE fee_policy SET created_at = ? WHERE id = ?", createdAt, policy.getId());
        return policy;
    }

    // 캐치업은 월초 CATCH_UP_WINDOW_DAYS 일 이내에만 돈다 — 공용 고정 시계(6/15) 대신 해당 날짜의 잡을 직접 만든다.
    private MonthlyBillIssueJob jobOn(LocalDate today) {
        ZoneId seoul = ZoneId.of("Asia/Seoul");
        return new MonthlyBillIssueJob(feePolicyRepository, feeBillService,
                Clock.fixed(today.atStartOfDay(seoul).toInstant(), seoul));
    }

    private List<String> billingPeriods() {
        return feeBillRepository.findAll().stream().map(FeeBill::getBillingPeriod).toList();
    }

    private long billCount() {
        return feeBillRepository.count();
    }

    private long issuedNotificationCount() {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.FEE_BILL_ISSUED)
                .count();
    }

    @Test
    @DisplayName("발행일이 오늘 일자 이하면 그 달 청구를 회원 수만큼 발행하고 발행 알림을 보낸다")
    void issuesWhenDayReached() {
        feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 5, 25)); // issue_day=5 <= 15

        job.run();

        List<FeeBill> bills = feeBillRepository.findAll();
        assertThat(bills).hasSize(2);
        assertThat(bills).allSatisfy(bill -> {
            assertThat(bill.getBillingPeriod()).isEqualTo("2026-06");
            assertThat(bill.getBillingStartDate()).isEqualTo(LocalDate.of(2026, 6, 1));
            assertThat(bill.getDueDate()).isEqualTo(LocalDate.of(2026, 6, 25));
        });
        assertThat(issuedNotificationCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("발행일이 오늘 일자보다 크면 그 달 청구를 발행하지 않는다")
    void skipsWhenDayNotReached() {
        feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 20, 25)); // issue_day=20 > 15

        job.run();

        assertThat(billCount()).isZero();
    }

    @Test
    @DisplayName("같은 달에 두 번 실행해도 청구·알림이 중복 생성되지 않는다(캐치업 멱등)")
    void idempotentOnRerun() {
        feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 5, 25));

        job.run();
        long billsAfterFirst = billCount();
        long issuedNotificationsAfterFirst = issuedNotificationCount();
        job.run();

        assertThat(billCount()).isEqualTo(billsAfterFirst);
        assertThat(issuedNotificationCount()).isEqualTo(issuedNotificationsAfterFirst);
    }

    @Test
    @DisplayName("운영진이 취소한 청구는 다음 실행이 다시 발행하지 않고 발행 알림도 다시 보내지 않는다")
    void doesNotReissueCancelledBillOnNextRun() {
        feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 5, 25));
        job.run();
        FeeBill cancelledBill = feeBillRepository.findAll().get(0);
        jdbcTemplate.update("UPDATE fee_bill SET status = 'CANCELLED' WHERE id = ?", cancelledBill.getId());
        addActiveMembers(1); // 첫 실행 뒤 가입한 회원 — 취소한 회원만 건너뛰고 이 회원에게는 발행해야 한다

        job.run();

        List<FeeBill> bills = feeBillRepository.findAll();
        assertThat(bills)
                .filteredOn(bill -> bill.getUserId().equals(cancelledBill.getUserId()))
                .singleElement()
                .extracting(FeeBill::getStatus).isEqualTo(FeeStatus.CANCELLED);
        assertThat(bills).extracting(FeeBill::getUserId)
                .containsExactlyInAnyOrderElementsOf(clubMemberRepository.findAll().stream()
                        .map(member -> member.getUser().getId()).toList());
        assertThat(billCount()).isEqualTo(3); // 첫 실행 2 + 새 회원 1
        assertThat(issuedNotificationCount()).isEqualTo(3); // 첫 실행 2 + 새 회원 1
    }

    @Test
    @DisplayName("다른 정책에서 취소한 청구는 건너뛸 이유가 아니다 — 새 월 정책은 취소된 회원을 포함해 전원에게 발행한다")
    void cancelledBillOfAnotherPolicyDoesNotSkipMember() {
        feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 5, 25));
        job.run();
        jdbcTemplate.update("UPDATE fee_bill SET status = 'CANCELLED' WHERE id = ?",
                feeBillRepository.findAll().get(0).getId());
        FeePolicy newPolicy = feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 5, 25));

        job.run();

        assertThat(feeBillRepository.findAll())
                .filteredOn(bill -> bill.getFeePolicyId().equals(newPolicy.getId()))
                .extracting(FeeBill::getUserId)
                .containsExactlyInAnyOrderElementsOf(clubMemberRepository.findAll().stream()
                        .map(member -> member.getUser().getId()).toList());
        assertThat(billCount()).isEqualTo(4); // 첫 정책 2(그중 1건 취소, 재발행 없음) + 새 정책 2
    }

    @Test
    @DisplayName("비활성·비-MONTHLY·자동발행 꺼짐 정책은 발행 대상에서 제외된다")
    void excludesNonEligiblePolicies() {
        feePolicyRepository.save(FeePolicyFixture.inactive(clubId)); // active=false
        feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.SEMESTER, 50000L)); // 비-MONTHLY
        feePolicyRepository.save(FeePolicyFixture.monthly(clubId)); // auto_issue=false

        job.run();

        assertThat(billCount()).isZero();
    }

    @Test
    @DisplayName("운영 중단(INACTIVE) 동아리의 정책은 이번 달 발행도 전월 캐치업도 하지 않는다")
    void skipsPoliciesOfInactiveClub() {
        saveAutoIssuePolicyCreatedAt(5, 25, LocalDateTime.of(2026, 4, 10, 9, 0));
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubId);

        jobOn(LocalDate.of(2026, 6, 7)).run();

        assertThat(billCount()).isZero();
        assertThat(issuedNotificationCount()).isZero();
    }

    @Test
    @DisplayName("마감일이 오늘보다 과거인 캐치업 발행도 성공한다(과거 검증 미적용)")
    void catchUpWithPastDueSucceeds() {
        feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 5, 10)); // due 2026-06-10 < today 06-15

        job.run();

        List<FeeBill> bills = feeBillRepository.findAll();
        assertThat(bills).hasSize(2);
        assertThat(bills).allSatisfy(bill ->
                assertThat(bill.getDueDate()).isEqualTo(LocalDate.of(2026, 6, 10)));
    }

    @Test
    @DisplayName("전월 이전에 만든 정책은 전월 청구가 빠졌으면 캐치업 발행한다(월말 잡 누락 복구)")
    void catchesUpPreviousMonth() {
        saveAutoIssuePolicyCreatedAt(5, 25, LocalDateTime.of(2026, 4, 10, 9, 0));

        jobOn(LocalDate.of(2026, 6, 7)).run();

        assertThat(billingPeriods()).containsExactlyInAnyOrder("2026-05", "2026-05", "2026-06", "2026-06");
        assertThat(feeBillRepository.findAll())
                .filteredOn(bill -> bill.getBillingPeriod().equals("2026-05"))
                .allSatisfy(bill -> {
                    assertThat(bill.getBillingStartDate()).isEqualTo(LocalDate.of(2026, 5, 1));
                    assertThat(bill.getDueDate()).isEqualTo(LocalDate.of(2026, 5, 25));
                });
        assertThat(issuedNotificationCount()).isEqualTo(4);
    }

    @Test
    @DisplayName("이번 달에 만든 정책은 전월 캐치업 대상이 아니다")
    void skipsPreviousMonthForPolicyCreatedThisMonth() {
        saveAutoIssuePolicyCreatedAt(5, 25, LocalDateTime.of(2026, 6, 3, 9, 0));

        jobOn(LocalDate.of(2026, 6, 7)).run();

        assertThat(billingPeriods()).containsExactlyInAnyOrder("2026-06", "2026-06");
    }

    @Test
    @DisplayName("전월이 이미 발행돼 있으면 캐치업은 청구·알림을 중복 생성하지 않는다")
    void catchUpDoesNotDuplicateIssuedPreviousMonth() {
        FeePolicy policy = saveAutoIssuePolicyCreatedAt(5, 25, LocalDateTime.of(2026, 4, 10, 9, 0));
        for (ClubMember member : clubMemberRepository.findAll()) {
            feeBillRepository.save(FeeBill.issue(clubId, member.getUser().getId(), policy.getId(), policy.getAmount(),
                    "2026-05", LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 31), LocalDate.of(2026, 5, 25)));
        }

        jobOn(LocalDate.of(2026, 6, 7)).run();

        assertThat(billingPeriods()).containsExactlyInAnyOrder("2026-05", "2026-05", "2026-06", "2026-06");
        assertThat(issuedNotificationCount()).isEqualTo(2); // 이번 달 발행분만 알림
    }

    @Test
    @DisplayName("전월 청구를 취소했으면 월초 캐치업도 그 회원의 전월 청구를 되살리지 않는다")
    void catchUpDoesNotReviveCancelledPreviousMonthBill() {
        FeePolicy policy = saveAutoIssuePolicyCreatedAt(5, 25, LocalDateTime.of(2026, 4, 10, 9, 0));
        for (ClubMember member : clubMemberRepository.findAll()) {
            feeBillRepository.save(FeeBill.issue(clubId, member.getUser().getId(), policy.getId(), policy.getAmount(),
                    "2026-05", LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 31), LocalDate.of(2026, 5, 25)));
        }
        jdbcTemplate.update("UPDATE fee_bill SET status = 'CANCELLED' WHERE id = ?",
                feeBillRepository.findAll().get(0).getId());

        jobOn(LocalDate.of(2026, 6, 7)).run();

        assertThat(billingPeriods()).containsExactlyInAnyOrder("2026-05", "2026-05", "2026-06", "2026-06");
        assertThat(issuedNotificationCount()).isEqualTo(2); // 이번 달 발행분만
    }

    @Test
    @DisplayName("월초 캐치업 창(7일)이 지나면 전월 청구가 빠져 있어도 캐치업하지 않는다")
    void skipsCatchUpAfterWindow() {
        saveAutoIssuePolicyCreatedAt(5, 25, LocalDateTime.of(2026, 4, 10, 9, 0));

        job.run(); // 고정 시계 2026-06-15

        assertThat(billingPeriods()).containsExactlyInAnyOrder("2026-06", "2026-06");
    }

    @Test
    @DisplayName("UTC 벽시계 created_at 은 KST 날짜로 정규화된다(5/31 15:30 UTC == 6/1 00:30 KST)")
    void normalizesCreatedAtToJobZone() {
        assertThat(MonthlyBillIssueJob.createdDateInJobZone(
                LocalDateTime.of(2026, 5, 31, 15, 30), ZoneId.of("UTC"), ZoneId.of("Asia/Seoul")))
                .isEqualTo(LocalDate.of(2026, 6, 1));
    }
}

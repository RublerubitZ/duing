package com.duing.domain.fee.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.FixedClockConfig;
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
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
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

    private Long clubId;

    @BeforeEach
    void setUp() {
        Club club = clubRepository.save(ClubFixture.academic("자동발행동아리"));
        clubId = club.getId();
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
    @DisplayName("비활성·비-MONTHLY·자동발행 꺼짐 정책은 발행 대상에서 제외된다")
    void excludesNonEligiblePolicies() {
        feePolicyRepository.save(FeePolicyFixture.inactive(clubId)); // active=false
        feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.SEMESTER, 50000L)); // 비-MONTHLY
        feePolicyRepository.save(FeePolicyFixture.monthly(clubId)); // auto_issue=false

        job.run();

        assertThat(billCount()).isZero();
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

        job.run();

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

        job.run();

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

        job.run();

        assertThat(billingPeriods()).containsExactlyInAnyOrder("2026-05", "2026-05", "2026-06", "2026-06");
        assertThat(issuedNotificationCount()).isEqualTo(2); // 이번 달 발행분만 알림
    }
}

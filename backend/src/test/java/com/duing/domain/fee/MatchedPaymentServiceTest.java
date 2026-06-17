package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.exception.BankMatchingException;
import com.duing.domain.fee.repository.BankTransactionRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.MatchCandidate;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.fee.service.MatchedPaymentService;
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
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

@Import({TestcontainersConfiguration.class, MatchedPaymentServiceTest.FixedClockConfig.class})
@SpringBootTest
class MatchedPaymentServiceTest extends IntegrationTestBase {

    // '오늘'을 2026-06-15(Asia/Seoul)로 고정해 마감 경과(OVERDUE) 판정을 결정적으로 만든다.
    static final LocalDate TODAY = LocalDate.of(2026, 6, 15);

    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(
                    TODAY.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(),
                    ZoneId.of("Asia/Seoul"));
        }
    }

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    ClubMemberRepository clubMemberRepository;
    @Autowired
    FeePolicyRepository feePolicyRepository;
    @Autowired
    FeeBillRepository feeBillRepository;
    @Autowired
    PaymentRepository paymentRepository;
    @Autowired
    BankTransactionRepository bankTransactionRepository;
    @Autowired
    MatchedPaymentService matchedPaymentService;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private Club club;
    private Long clubId;
    private Long policyId;
    private Long actorId;
    private Long memberUserId;

    @BeforeEach
    void setUp() {
        club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        policyId = policy.getId();

        User leader = userRepository.save(UserFixture.unique());
        actorId = leader.getId();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        User member = userRepository.save(UserFixture.unique());
        memberUserId = member.getId();
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));
    }

    /** "YYYY-MM" 회차로 청구 1건을 발행한다(마감일은 회차 말일). */
    private FeeBill saveBill(long amount, String period) {
        return saveBill(memberUserId, amount, period);
    }

    private FeeBill saveBill(Long userId, long amount, String period) {
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return feeBillRepository.save(
                FeeBill.issue(clubId, userId, policyId, amount, period, start, end, end));
    }

    /** 입금 거래 1건을 적재한다(매칭 대상이 되도록 DEPOSIT 으로). */
    private BankTransaction saveDeposit(long amount) {
        return bankTransactionRepository.save(BankTransaction.ingest(
                clubId, "NH", LocalDateTime.of(2026, 6, 10, 9, 0), amount, 100000L, "홍길동",
                TransactionType.DEPOSIT, "hash-" + amount + "-" + System.nanoTime(), "{}"));
    }

    private FeeStatus billStatus(Long billId) {
        return feeBillRepository.findById(billId).orElseThrow().getStatus();
    }

    /** 회비 완납 알림(FEE_PAID_CONFIRMED) 중 body 가 substring 을 포함하는 건수. AFTER_COMMIT 리스너는 동기라 호출 반환 시점에 이미 생성돼 있다. */
    private long paidNotificationCount(String bodySubstring) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification WHERE user_id = ? AND type = 'FEE_PAID_CONFIRMED' AND body LIKE ?",
                Long.class, memberUserId, "%" + bodySubstring + "%");
        return count == null ? 0L : count;
    }

    @Test
    @DisplayName("입금액이 청구 잔액과 일치하면 자동 매칭으로 TRANSFER 납부가 생성되고 청구는 PAID, 거래는 AUTO_MATCHED 로 전이한다")
    void autoMatchCreatesTransferPaymentAndCompletesBill() {
        FeeBill bill = saveBill(10000L, "2026-07"); // 마감 2026-07-31, 미경과
        BankTransaction tx = saveDeposit(10000L);

        matchedPaymentService.createMatchedPayment(tx, bill.getId(), actorId, MatchStatus.AUTO_MATCHED, true);

        // 납부: TRANSFER · 금액=잔액 · bank_transaction_id 연결
        Long paymentBankTxId = jdbcTemplate.queryForObject(
                "SELECT bank_transaction_id FROM payment WHERE fee_bill_id = ?", Long.class, bill.getId());
        String method = jdbcTemplate.queryForObject(
                "SELECT method FROM payment WHERE fee_bill_id = ?", String.class, bill.getId());
        assertThat(paymentBankTxId).isEqualTo(tx.getId());
        assertThat(method).isEqualTo(PaymentMethod.TRANSFER.name());
        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isEqualTo(10000L);

        // 청구 PAID · 거래 AUTO_MATCHED + matched_fee_bill_id 연결
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PAID);
        BankTransaction matched = bankTransactionRepository.findById(tx.getId()).orElseThrow();
        assertThat(matched.getMatchStatus()).isEqualTo(MatchStatus.AUTO_MATCHED);
        assertThat(matched.getMatchedFeeBillId()).isEqualTo(bill.getId());

        // 자동 확인 알림: "자동으로" 문구만 생성, 표준 완납 문구는 없음
        assertThat(paidNotificationCount("자동으로 확인")).isEqualTo(1L);
        assertThat(paidNotificationCount("완납 확인")).isZero();
    }

    @Test
    @DisplayName("autoMatched=false 로 매칭하면 같은 납부 생성이지만 알림 문구는 표준 완납 확인이다")
    void manualMatchUsesStandardConfirmedNotification() {
        FeeBill bill = saveBill(10000L, "2026-07");
        BankTransaction tx = saveDeposit(10000L);

        matchedPaymentService.createMatchedPayment(tx, bill.getId(), actorId, MatchStatus.MANUAL_MATCHED, false);

        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PAID);
        BankTransaction matched = bankTransactionRepository.findById(tx.getId()).orElseThrow();
        assertThat(matched.getMatchStatus()).isEqualTo(MatchStatus.MANUAL_MATCHED);

        assertThat(paidNotificationCount("완납 확인")).isEqualTo(1L);
        assertThat(paidNotificationCount("자동으로 확인")).isZero();
    }

    @Test
    @DisplayName("입금액이 청구 잔액과 일치하지 않으면 매칭 불가 예외(409)가 발생하고 납부가 생성되지 않는다")
    void mismatchedAmountThrows() {
        FeeBill bill = saveBill(10000L, "2026-07");
        BankTransaction tx = saveDeposit(7000L); // 잔액 10000 ≠ 입금 7000

        assertThatThrownBy(() ->
                matchedPaymentService.createMatchedPayment(tx, bill.getId(), actorId, MatchStatus.AUTO_MATCHED, true))
                .isInstanceOf(BankMatchingException.MatchAmountMismatchException.class);

        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isZero();
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PENDING);
    }

    @Test
    @DisplayName("거래의 동아리와 다른 동아리의 청구를 매칭하려 하면 404 가 발생하고 납부가 생성되지 않는다")
    void crossClubBillNotMatched() {
        // 다른 동아리의 청구
        Club otherClub = clubRepository.save(ClubFixture.academic("동아리B"));
        User otherMember = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.of(otherClub, otherMember, ClubMemberRole.MEMBER));
        FeePolicy otherPolicy = feePolicyRepository.save(
                FeePolicyFixture.of(otherClub.getId(), BillingType.MONTHLY, 10000L));
        LocalDate start = LocalDate.parse("2026-07-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        FeeBill otherBill = feeBillRepository.save(FeeBill.issue(
                otherClub.getId(), otherMember.getId(), otherPolicy.getId(), 10000L, "2026-07", start, end, end));

        // clubId(동아리A) 소속 입금 거래로 동아리B 청구를 매칭 시도 → bill 잠금 조회가 cross-club 으로 404.
        BankTransaction tx = saveDeposit(10000L);
        assertThatThrownBy(() ->
                matchedPaymentService.createMatchedPayment(tx, otherBill.getId(), actorId, MatchStatus.AUTO_MATCHED, true))
                .isInstanceOf(com.duing.domain.fee.exception.FeeBillException.FeeBillNotFoundException.class);

        assertThat(paymentRepository.sumActiveByFeeBillId(otherBill.getId())).isZero();
        assertThat(bankTransactionRepository.findById(tx.getId()).orElseThrow().getMatchStatus())
                .isEqualTo(MatchStatus.PENDING);
    }

    @Test
    @DisplayName("후보 조회는 다른 동아리의 청구를 반환하지 않는다")
    void findMatchCandidatesIsolatesByClub() {
        FeeBill mine = saveBill(10000L, "2026-07");

        Club otherClub = clubRepository.save(ClubFixture.academic("동아리B"));
        User otherMember = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.of(otherClub, otherMember, ClubMemberRole.MEMBER));
        FeePolicy otherPolicy = feePolicyRepository.save(
                FeePolicyFixture.of(otherClub.getId(), BillingType.MONTHLY, 10000L));
        LocalDate start = LocalDate.parse("2026-07-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        FeeBill otherBill = feeBillRepository.save(FeeBill.issue(
                otherClub.getId(), otherMember.getId(), otherPolicy.getId(), 10000L, "2026-07", start, end, end));

        List<MatchCandidate> candidates = feeBillRepository.findMatchCandidates(clubId, 10000L);
        assertThat(candidates).extracting(MatchCandidate::feeBillId)
                .containsExactly(mine.getId())
                .doesNotContain(otherBill.getId());
    }

    @Test
    @DisplayName("후보 조회는 입금액과 잔액이 정확히 일치하는 미납 청구를 마감일 오름차순으로 반환하고 PAID/CANCELLED/금액불일치는 제외한다")
    void findMatchCandidatesReturnsSortedExactMatches() {
        User memberA = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.of(club, memberA, ClubMemberRole.MEMBER));

        // 잔액 10000 으로 일치하는 미납 청구 2건 — 마감일이 늦은 것(2026-08)과 이른 것(2026-07).
        FeeBill laterDue = saveBill(memberA.getId(), 10000L, "2026-08"); // 마감 2026-08-31
        FeeBill earlierDue = saveBill(memberUserId, 10000L, "2026-07");  // 마감 2026-07-31

        // 금액이 다른 청구(매칭 안 됨)
        saveBill(memberUserId, 5000L, "2026-10");

        // PAID 청구(완납 매칭 후 제외돼야 함)
        FeeBill paidBill = saveBill(memberA.getId(), 10000L, "2026-11");
        BankTransaction payTx = saveDeposit(10000L);
        matchedPaymentService.createMatchedPayment(payTx, paidBill.getId(), actorId, MatchStatus.AUTO_MATCHED, true);

        // CANCELLED 청구(제외돼야 함)
        FeeBill cancelledBill = saveBill(memberA.getId(), 10000L, "2026-12");
        FeeBill toCancel = feeBillRepository.findById(cancelledBill.getId()).orElseThrow();
        toCancel.cancel();
        feeBillRepository.saveAndFlush(toCancel);

        List<MatchCandidate> candidates = feeBillRepository.findMatchCandidates(clubId, 10000L);

        // 정확히 잔액 10000 인 미납 청구 2건만, 마감일 오름차순(earlierDue → laterDue).
        assertThat(candidates).extracting(MatchCandidate::feeBillId)
                .containsExactly(earlierDue.getId(), laterDue.getId());
        assertThat(candidates).allMatch(candidate -> candidate.remaining() == 10000L);
        // 회원 이름이 club_member→user 조인으로 채워진다.
        assertThat(candidates.get(0).memberName())
                .isEqualTo(userRepository.findById(memberUserId).orElseThrow().getName());
    }

    @Test
    @DisplayName("부분 납부된 청구는 잔여 미납액 기준으로 후보가 산출되고, 완납된 청구는 어떤 입금액 후보에도 포함되지 않는다")
    void candidatesUsePartialPaidRemaining() {
        // 청구 10000 에 6000 을 부분 납부해 잔액 4000 으로 만든다(수동 분할 납부 직접 저장).
        FeeBill partialBill = saveBill(10000L, "2026-07");
        paymentRepository.save(com.duing.domain.fee.entity.Payment.record(
                partialBill.getId(), 6000L, PaymentMethod.CASH,
                LocalDateTime.of(2026, 6, 10, 9, 0), actorId, "선납"));

        // 다른 청구: 완납(매칭) 처리해 후보에서 빠져야 한다.
        FeeBill paidBill = saveBill(10000L, "2026-08");
        BankTransaction payTx = saveDeposit(10000L);
        matchedPaymentService.createMatchedPayment(payTx, paidBill.getId(), actorId, MatchStatus.AUTO_MATCHED, true);

        // 입금 4000 후보 = 부분 납부 청구의 잔액 4000 과 일치 → partialBill 포함.
        List<MatchCandidate> candidatesFor4000 = feeBillRepository.findMatchCandidates(clubId, 4000L);
        assertThat(candidatesFor4000).extracting(MatchCandidate::feeBillId).containsExactly(partialBill.getId());
        assertThat(candidatesFor4000.get(0).remaining()).isEqualTo(4000L);

        // 입금 10000 후보엔 부분 납부 청구(잔액 4000)도, 완납 청구도 포함되지 않는다.
        List<MatchCandidate> candidatesFor10000 = feeBillRepository.findMatchCandidates(clubId, 10000L);
        assertThat(candidatesFor10000).extracting(MatchCandidate::feeBillId)
                .doesNotContain(partialBill.getId(), paidBill.getId());
    }
}

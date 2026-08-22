package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.FixedClockConfig;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

// '오늘'을 FixedClockConfig.TODAY(2026-06-15 Asia/Seoul)로 고정해 마감 경과(OVERDUE) 판정을 결정적으로 만든다.
@Import({TestcontainersConfiguration.class, FixedClockConfig.class})
@SpringBootTest
class MatchedPaymentServiceTest extends IntegrationTestBase {

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
                clubId, "NH", LocalDateTime.of(2026, 6, 10, 9, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant(),
                amount, 100000L, "홍길동",
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

        matchedPaymentService.createMatchedPayment(tx.getId(), tx.getClubId(), bill.getId(), actorId,
                MatchStatus.AUTO_MATCHED, true, false);

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

        matchedPaymentService.createMatchedPayment(tx.getId(), tx.getClubId(), bill.getId(), actorId,
                MatchStatus.MANUAL_MATCHED, false, false);

        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PAID);
        BankTransaction matched = bankTransactionRepository.findById(tx.getId()).orElseThrow();
        assertThat(matched.getMatchStatus()).isEqualTo(MatchStatus.MANUAL_MATCHED);

        assertThat(paidNotificationCount("완납 확인")).isEqualTo(1L);
        assertThat(paidNotificationCount("자동으로 확인")).isZero();
    }

    @Test
    @DisplayName("allowPartial=true 면 입금액이 잔액보다 작아도 입금액 그대로 부분 납부가 기록되고 청구는 PARTIAL_PAID 로 전이한다")
    void allowPartialRecordsDepositAndTransitionsToPartialPaid() {
        FeeBill bill = saveBill(10000L, "2026-07"); // 잔액 10000, 마감 2026-07-31(미경과)
        BankTransaction tx = saveDeposit(5000L);    // 부분 입금 5000

        matchedPaymentService.createMatchedPayment(tx.getId(), tx.getClubId(), bill.getId(), actorId,
                MatchStatus.MANUAL_MATCHED, false, true);

        // 입금액 5000 이 그대로 기록되고 잔액 미만이라 PARTIAL_PAID.
        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isEqualTo(5000L);
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PARTIAL_PAID);
        Long paymentAmount = jdbcTemplate.queryForObject(
                "SELECT amount FROM payment WHERE bank_transaction_id = ?", Long.class, tx.getId());
        assertThat(paymentAmount).isEqualTo(5000L);
        BankTransaction matched = bankTransactionRepository.findById(tx.getId()).orElseThrow();
        assertThat(matched.getMatchStatus()).isEqualTo(MatchStatus.MANUAL_MATCHED);
    }

    @Test
    @DisplayName("allowPartial=true 라도 입금액이 잔액을 초과하면 매칭 불가 예외(409)가 발생하고 납부가 생성되지 않는다")
    void allowPartialStillRejectsOverpay() {
        FeeBill bill = saveBill(10000L, "2026-07");
        BankTransaction tx = saveDeposit(15000L); // 잔액 10000 < 입금 15000

        assertThatThrownBy(() ->
                matchedPaymentService.createMatchedPayment(tx.getId(), tx.getClubId(), bill.getId(), actorId,
                        MatchStatus.MANUAL_MATCHED, false, true))
                .isInstanceOf(BankMatchingException.MatchAmountMismatchException.class);

        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isZero();
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PENDING);
        assertThat(bankTransactionRepository.findById(tx.getId()).orElseThrow().getMatchStatus())
                .isEqualTo(MatchStatus.PENDING);
    }

    @Test
    @DisplayName("입금액이 청구 잔액과 일치하지 않으면 매칭 불가 예외(409)가 발생하고 납부가 생성되지 않는다")
    void mismatchedAmountThrows() {
        FeeBill bill = saveBill(10000L, "2026-07");
        BankTransaction tx = saveDeposit(7000L); // 잔액 10000 ≠ 입금 7000

        assertThatThrownBy(() ->
                matchedPaymentService.createMatchedPayment(tx.getId(), tx.getClubId(), bill.getId(), actorId,
                        MatchStatus.AUTO_MATCHED, true, false))
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
                matchedPaymentService.createMatchedPayment(tx.getId(), tx.getClubId(), otherBill.getId(), actorId,
                        MatchStatus.AUTO_MATCHED, true, false))
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
        matchedPaymentService.createMatchedPayment(payTx.getId(), payTx.getClubId(), paidBill.getId(), actorId,
                MatchStatus.AUTO_MATCHED, true, false);

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
                LocalDateTime.of(2026, 6, 10, 9, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant(), actorId, "선납"));

        // 다른 청구: 완납(매칭) 처리해 후보에서 빠져야 한다.
        FeeBill paidBill = saveBill(10000L, "2026-08");
        BankTransaction payTx = saveDeposit(10000L);
        matchedPaymentService.createMatchedPayment(payTx.getId(), payTx.getClubId(), paidBill.getId(), actorId,
                MatchStatus.AUTO_MATCHED, true, false);

        // 입금 4000 후보 = 부분 납부 청구의 잔액 4000 과 일치 → partialBill 포함.
        List<MatchCandidate> candidatesFor4000 = feeBillRepository.findMatchCandidates(clubId, 4000L);
        assertThat(candidatesFor4000).extracting(MatchCandidate::feeBillId).containsExactly(partialBill.getId());
        assertThat(candidatesFor4000.get(0).remaining()).isEqualTo(4000L);

        // 입금 10000 후보엔 부분 납부 청구(잔액 4000)도, 완납 청구도 포함되지 않는다.
        List<MatchCandidate> candidatesFor10000 = feeBillRepository.findMatchCandidates(clubId, 10000L);
        assertThat(candidatesFor10000).extracting(MatchCandidate::feeBillId)
                .doesNotContain(partialBill.getId(), paidBill.getId());
    }

    @Test
    @DisplayName("같은 입금 거래를 서로 다른 두 청구로 동시에 매칭하면 정확히 한 건만 성공하고 입금은 한 번만 소비된다")
    void sameBankTransactionMatchedToTwoBillsConcurrentlyConsumesDepositOnce() throws Exception {
        // 잔액이 입금액과 정확히 일치하는 미납 청구 2건과 입금 거래 1건. 거래 행 잠금이 없으면
        // 두 스레드가 서로 다른 청구 행만 잠가 상호 배제가 안 되고, 한 입금이 두 청구에 이중 반영된다.
        User memberB = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.of(club, memberB, ClubMemberRole.MEMBER));
        FeeBill billOne = saveBill(memberUserId, 10000L, "2026-07");
        FeeBill billTwo = saveBill(memberB.getId(), 10000L, "2026-08");
        BankTransaction tx = saveDeposit(10000L);

        int threadCount = 2;
        Long[] targetBillIds = {billOne.getId(), billTwo.getId()};
        CyclicBarrier barrier = new CyclicBarrier(threadCount);
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        List<Future<String>> futures = new ArrayList<>();
        for (int index = 0; index < threadCount; index++) {
            Long targetBillId = targetBillIds[index];
            futures.add(pool.submit(() -> {
                // 배리어 실패(셋업 오류)는 매칭 실패와 구분해 즉시 드러내고, 매칭 호출 결과만 분류한다.
                barrier.await(10, TimeUnit.SECONDS); // 두 스레드가 같은 거래를 서로 다른 청구로 동시에 매칭 시도
                try {
                    matchedPaymentService.createMatchedPayment(
                            tx.getId(), tx.getClubId(), targetBillId, actorId, MatchStatus.AUTO_MATCHED, true, false);
                    return "OK";
                } catch (Exception failure) {
                    // 앱 가드(AlreadyMatchedException) 또는 DB 유니크(V64) 중 먼저 발동한 쪽으로 실패.
                    return rootCauseSimpleName(failure);
                }
            }));
        }
        pool.shutdown();
        assertThat(pool.awaitTermination(60, TimeUnit.SECONDS)).isTrue();

        int success = 0;
        int blockedByGuard = 0;
        for (Future<String> future : futures) {
            String outcome = future.get();
            if ("OK".equals(outcome)) {
                success++;
            } else {
                // 거래 비관적 잠금으로 직렬화된 두 번째 호출은 PENDING 가드(AlreadyMatchedException) 또는,
                // 그보다 DB 유니크가 먼저 걸리면 제약 위반으로 막힌다.
                assertThat(outcome).matches("AlreadyMatchedException|ConstraintViolationException"
                        + "|DataIntegrityViolationException|PSQLException");
                blockedByGuard++;
            }
        }

        // 정확히 한 건만 성공, 다른 한 건은 가드/제약으로 차단.
        assertThat(success).isEqualTo(1);
        assertThat(blockedByGuard).isEqualTo(1);

        // 입금은 한 번만 소비: 이 거래를 참조하는 ACTIVE 납부는 정확히 1건.
        Long paymentsForTx = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payment WHERE bank_transaction_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL",
                Long.class, tx.getId());
        assertThat(paymentsForTx).isEqualTo(1L);

        // 거래는 한 번만 매칭됨(AUTO/MANUAL), 두 청구 중 정확히 한 건만 PAID.
        BankTransaction matched = bankTransactionRepository.findById(tx.getId()).orElseThrow();
        assertThat(matched.getMatchStatus())
                .isIn(MatchStatus.AUTO_MATCHED, MatchStatus.MANUAL_MATCHED);
        long paidBills = List.of(billOne.getId(), billTwo.getId()).stream()
                .filter(billId -> billStatus(billId) == FeeStatus.PAID)
                .count();
        assertThat(paidBills).isEqualTo(1L);
        assertThat(matched.getMatchedFeeBillId()).isIn(billOne.getId(), billTwo.getId());
    }

    @Test
    @DisplayName("이미 AUTO_MATCHED 된 거래를 다시 매칭하면 이미 처리된 거래 예외(409)가 발생하고 새 납부가 생성되지 않는다")
    void alreadyMatchedTransactionRejectsReMatch() {
        FeeBill firstBill = saveBill(memberUserId, 10000L, "2026-07");
        BankTransaction tx = saveDeposit(10000L);
        matchedPaymentService.createMatchedPayment(tx.getId(), tx.getClubId(), firstBill.getId(), actorId,
                MatchStatus.AUTO_MATCHED, true, false);

        // 같은 거래(이미 AUTO_MATCHED)를 다른 청구로 재매칭 시도 → PENDING 가드에서 차단.
        User memberB = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.of(club, memberB, ClubMemberRole.MEMBER));
        FeeBill secondBill = saveBill(memberB.getId(), 10000L, "2026-08");

        assertThatThrownBy(() ->
                matchedPaymentService.createMatchedPayment(tx.getId(), tx.getClubId(), secondBill.getId(), actorId,
                        MatchStatus.AUTO_MATCHED, true, false))
                .isInstanceOf(BankMatchingException.AlreadyMatchedException.class);

        // 두 번째 청구엔 납부가 생기지 않고, 이 거래를 참조하는 ACTIVE 납부는 여전히 1건.
        assertThat(paymentRepository.sumActiveByFeeBillId(secondBill.getId())).isZero();
        assertThat(billStatus(secondBill.getId())).isEqualTo(FeeStatus.PENDING);
        Long paymentsForTx = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payment WHERE bank_transaction_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL",
                Long.class, tx.getId());
        assertThat(paymentsForTx).isEqualTo(1L);
    }

    @Test
    @DisplayName("취소된 청구에 매칭하면 매칭 불가 예외(409)가 발생하고 납부가 생성되지 않으며 거래는 PENDING 으로 남는다")
    void cancelledBillRejectsMatchAndCreatesNoPayment() {
        // 후보 조회 후 청구가 취소된 TOCTOU 상황을 청구를 직접 취소해 재현한다.
        FeeBill bill = saveBill(10000L, "2026-07");
        FeeBill toCancel = feeBillRepository.findById(bill.getId()).orElseThrow();
        toCancel.cancel();
        feeBillRepository.saveAndFlush(toCancel);
        BankTransaction tx = saveDeposit(10000L);

        assertThatThrownBy(() ->
                matchedPaymentService.createMatchedPayment(tx.getId(), tx.getClubId(), bill.getId(), actorId,
                        MatchStatus.MANUAL_MATCHED, false, false))
                .isInstanceOf(BankMatchingException.BillNotMatchableException.class);

        // 취소된 청구에 활성 납부가 붙지 않고, 거래는 검토 큐(PENDING)에 그대로 남는다.
        Long paymentsForBill = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payment WHERE fee_bill_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL",
                Long.class, bill.getId());
        assertThat(paymentsForBill).isZero();
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.CANCELLED);
        assertThat(bankTransactionRepository.findById(tx.getId()).orElseThrow().getMatchStatus())
                .isEqualTo(MatchStatus.PENDING);
    }

    /** 동시성 실패 원인을 앱 예외/DB 제약 어느 쪽이든 식별할 수 있게 원인 체인을 따라가 가장 의미 있는 단순명을 고른다. */
    private String rootCauseSimpleName(Throwable failure) {
        Throwable current = failure;
        String lastMeaningful = current.getClass().getSimpleName();
        while (current != null) {
            String simpleName = current.getClass().getSimpleName();
            if (simpleName.equals("AlreadyMatchedException")
                    || simpleName.equals("ConstraintViolationException")
                    || simpleName.equals("DataIntegrityViolationException")
                    || simpleName.equals("PSQLException")) {
                lastMeaningful = simpleName;
            }
            current = current.getCause();
        }
        return lastMeaningful;
    }
}

package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

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
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.repository.BankTransactionRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 검토 큐 API(BE-6) 검증. PENDING 입금 + 후보 청구를 직접 적재해 목록·승인·무시·매칭취소 흐름과
 * 권한·상태 가드(403/404/409/400)를 확인한다. BANK API 호출은 검토 단계에 필요 없어 stub 도 두지 않는다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderBankTransactionReviewTest extends IntegrationTestBase {

    private static final long DEPOSIT_AMOUNT = 10000L;

    @LocalServerPort
    int port;

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
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private final AtomicInteger hashCounter = new AtomicInteger();

    private Club club;
    private Long clubId;
    private Long policyId;
    private User leader;
    private String leaderToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        club = clubRepository.save(ClubFixture.academic("회비동아리"));
        clubId = club.getId();
        leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, DEPOSIT_AMOUNT));
        policyId = policy.getId();
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
    }

    private User joinMember(Club targetClub) {
        User member = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.of(targetClub, member, ClubMemberRole.MEMBER));
        return member;
    }

    private User joinMemberWithName(Club targetClub, String name) {
        User member = userRepository.save(UserFixture.withName(name));
        clubMemberRepository.save(ClubMember.of(targetClub, member, ClubMemberRole.MEMBER));
        return member;
    }

    private FeeBill saveBill(Long ownerClubId, Long ownerPolicyId, Long userId, long amount, String period) {
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return feeBillRepository.save(FeeBill.issue(ownerClubId, userId, ownerPolicyId, amount, period, start, end, end));
    }

    /** PENDING 입금 거래 1건을 적재한다. transaction_hash 유니크 제약을 피하려 카운터로 고유 해시를 부여한다. */
    private BankTransaction savePendingDeposit(Long ownerClubId, long amount, String counterparty) {
        String hash = "hash-" + hashCounter.incrementAndGet();
        BankTransaction transaction = BankTransaction.ingest(
                ownerClubId, "011", LocalDateTime.of(2026, 6, 10, 12, 0), amount, 100000L,
                counterparty, TransactionType.DEPOSIT, hash, "{\"type\":\"deposit\"}");
        return bankTransactionRepository.save(transaction);
    }

    /** 입금 거래를 청구에 매칭(MANUAL/AUTO)하고, 연결된 ACTIVE TRANSFER 납부 1건을 적재한다(검토취소 입력 상태). */
    private BankTransaction saveMatchedDeposit(FeeBill bill, MatchStatus matchStatus) {
        return saveMatchedDeposit(bill, matchStatus, "홍길동");
    }

    /** 입금자명을 지정해 매칭된 거래를 적재한다(입금자명 ↔ 매칭 회원명 대조 검증용). */
    private BankTransaction saveMatchedDeposit(FeeBill bill, MatchStatus matchStatus, String counterparty) {
        BankTransaction transaction = savePendingDeposit(bill.getClubId(), bill.getAmount(), counterparty);
        transaction.matchTo(bill.getId(), matchStatus);
        bankTransactionRepository.save(transaction);
        Payment payment = Payment.record(bill.getId(), bill.getAmount(), PaymentMethod.TRANSFER,
                transaction.getTransactionAt(), leader.getId(), "BANK 매칭");
        payment.linkBankTransaction(transaction.getId());
        paymentRepository.save(payment);
        bill.updateStatus(FeeStatus.PAID);
        feeBillRepository.save(bill);
        return transaction;
    }

    private io.restassured.specification.RequestSpecification authed(String token) {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    @Test
    @DisplayName("검토 큐 조회: PENDING 입금에 후보 청구가 due_date 오름차순으로 동봉된다")
    void listAttachesCandidatesSortedByDueDate() {
        User memberJuly = joinMember(club);
        User memberAugust = joinMember(club);
        // 마감일이 더 늦은 8월 회차를 먼저 적재해도 후보는 due_date 오름차순(7월 → 8월)으로 정렬돼야 한다.
        FeeBill august = saveBill(clubId, policyId, memberAugust.getId(), DEPOSIT_AMOUNT, "2026-08");
        FeeBill july = saveBill(clubId, policyId, memberJuly.getId(), DEPOSIT_AMOUNT, "2026-07");
        savePendingDeposit(clubId, DEPOSIT_AMOUNT, "홍길동");

        authed(leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/bank-transactions")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].matchStatus", equalTo("PENDING"))
                .body("data.content[0].candidates", hasSize(2))
                .body("data.content[0].candidates.feeBillId",
                        contains(july.getId().intValue(), august.getId().intValue()))
                .body("data.content[0].candidates.billingPeriod", contains("2026-07", "2026-08"));
    }

    @Test
    @DisplayName("승인 → 거래 MANUAL_MATCHED + payment(TRANSFER, bank_transaction_id) 생성 + 청구 PAID")
    void approveMatchesAndCreatesTransferPayment() {
        User member = joinMember(club);
        FeeBill bill = saveBill(clubId, policyId, member.getId(), DEPOSIT_AMOUNT, "2026-07");
        BankTransaction deposit = savePendingDeposit(clubId, DEPOSIT_AMOUNT, "홍길동");

        authed(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("feeBillId", bill.getId()))
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + deposit.getId() + "/approve")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(feeBillRepository.findById(bill.getId()).orElseThrow().getStatus()).isEqualTo(FeeStatus.PAID);
        assertThat(bankTransactionRepository.findById(deposit.getId()).orElseThrow().getMatchStatus())
                .isEqualTo(MatchStatus.MANUAL_MATCHED);

        String method = jdbcTemplate.queryForObject(
                "SELECT method FROM payment WHERE fee_bill_id = ?", String.class, bill.getId());
        Long linkedTxId = jdbcTemplate.queryForObject(
                "SELECT bank_transaction_id FROM payment WHERE fee_bill_id = ?", Long.class, bill.getId());
        assertThat(method).isEqualTo(PaymentMethod.TRANSFER.name());
        assertThat(linkedTxId).isEqualTo(deposit.getId());
    }

    @Test
    @DisplayName("부분 승인: 잔액 10000 청구에 5000 입금을 승인하면 청구 PARTIAL_PAID + payment 5000(TRANSFER) + 거래 MANUAL_MATCHED + 부분 납부 알림")
    void approveAppliesPartialDepositToBill() {
        User member = joinMember(club);
        // 마감일이 먼 미래(2099-12)라 부분 납부 후 청구는 PARTIAL_PAID 로 남는다(OVERDUE 아님).
        FeeBill bill = saveBill(clubId, policyId, member.getId(), DEPOSIT_AMOUNT, "2099-12");
        BankTransaction deposit = savePendingDeposit(clubId, 5000L, "홍길동");

        authed(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("feeBillId", bill.getId()))
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + deposit.getId() + "/approve")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(feeBillRepository.findById(bill.getId()).orElseThrow().getStatus())
                .isEqualTo(FeeStatus.PARTIAL_PAID);
        assertThat(bankTransactionRepository.findById(deposit.getId()).orElseThrow().getMatchStatus())
                .isEqualTo(MatchStatus.MANUAL_MATCHED);

        Long amount = jdbcTemplate.queryForObject(
                "SELECT amount FROM payment WHERE bank_transaction_id = ?", Long.class, deposit.getId());
        String method = jdbcTemplate.queryForObject(
                "SELECT method FROM payment WHERE bank_transaction_id = ?", String.class, deposit.getId());
        assertThat(amount).isEqualTo(5000L);
        assertThat(method).isEqualTo(PaymentMethod.TRANSFER.name());

        // 부분 납부 확인 알림(FEE_PARTIAL_PAYMENT_CONFIRMED)이 회원에게 생성된다(AFTER_COMMIT 동기 발화).
        Long partialNotificationCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification WHERE user_id = ? AND type = 'FEE_PARTIAL_PAYMENT_CONFIRMED'",
                Long.class, member.getId());
        assertThat(partialNotificationCount).isEqualTo(1L);
    }

    @Test
    @DisplayName("초과 입금 승인: 입금액이 청구 잔액을 초과하면 400 이고 납부가 생성되지 않는다")
    void approveRejectsOverpay() {
        User member = joinMember(club);
        FeeBill bill = saveBill(clubId, policyId, member.getId(), DEPOSIT_AMOUNT, "2026-07"); // 잔액 10000
        BankTransaction deposit = savePendingDeposit(clubId, 15000L, "홍길동");                // 입금 15000 > 잔액

        authed(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("feeBillId", bill.getId()))
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + deposit.getId() + "/approve")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(feeBillRepository.findById(bill.getId()).orElseThrow().getStatus()).isEqualTo(FeeStatus.PENDING);
        assertThat(bankTransactionRepository.findById(deposit.getId()).orElseThrow().getMatchStatus())
                .isEqualTo(MatchStatus.PENDING);
        Long paymentCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payment WHERE bank_transaction_id = ?", Long.class, deposit.getId());
        assertThat(paymentCount).isZero();
    }

    @Test
    @DisplayName("완납·취소된 청구 승인 → 400")
    void approveRejectsPaidOrCancelledBill() {
        User paidMember = joinMember(club);
        FeeBill paidBill = saveBill(clubId, policyId, paidMember.getId(), DEPOSIT_AMOUNT, "2026-07");
        // 완납으로 만들어 둔다(매칭 거래 + ACTIVE 납부 + PAID).
        saveMatchedDeposit(paidBill, MatchStatus.MANUAL_MATCHED);
        BankTransaction depositForPaid = savePendingDeposit(clubId, DEPOSIT_AMOUNT, "홍길동");

        authed(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("feeBillId", paidBill.getId()))
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + depositForPaid.getId() + "/approve")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        User cancelledMember = joinMember(club);
        FeeBill cancelledBill = saveBill(clubId, policyId, cancelledMember.getId(), DEPOSIT_AMOUNT, "2026-08");
        cancelledBill.cancel();
        feeBillRepository.save(cancelledBill);
        BankTransaction depositForCancelled = savePendingDeposit(clubId, DEPOSIT_AMOUNT, "홍길동");

        authed(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("feeBillId", cancelledBill.getId()))
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + depositForCancelled.getId() + "/approve")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("매칭 내역 조회: 매칭된 거래에 매칭 회원 이름·회차가 함께 내려와 입금자명과 대조할 수 있다")
    void listMatchedAttachesMatchedMemberNameAndPeriod() {
        // 청구의 주인은 '구승율'이고 입금자명은 '이승민'이라, 총무가 두 이름을 비교해 오매칭을 잡을 수 있어야 한다.
        User member = joinMemberWithName(club, "구승율");
        FeeBill bill = saveBill(clubId, policyId, member.getId(), DEPOSIT_AMOUNT, "2026-07");
        BankTransaction deposit = saveMatchedDeposit(bill, MatchStatus.MANUAL_MATCHED, "이승민");

        authed(leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/bank-transactions?status=MANUAL_MATCHED")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].id", equalTo(deposit.getId().intValue()))
                .body("data.content[0].counterparty", equalTo("이승민"))
                .body("data.content[0].matchedMemberName", equalTo("구승율"))
                .body("data.content[0].matchedBillingPeriod", equalTo("2026-07"));
    }

    @Test
    @DisplayName("매칭 내역 조회: 매칭 후 회원이 탈퇴하면 매칭 회원 이름은 null 이고 회차는 그대로 내려온다")
    void listMatchedKeepsPeriodButNullsNameForWithdrawnMember() {
        User member = joinMemberWithName(club, "구승율");
        FeeBill bill = saveBill(clubId, policyId, member.getId(), DEPOSIT_AMOUNT, "2026-07");
        BankTransaction deposit = saveMatchedDeposit(bill, MatchStatus.AUTO_MATCHED, "이승민");
        // 매칭 이후 회원을 탈퇴(soft-delete)시키면 LEFT JOIN ON deletedAt.isNull() 로 이름만 null 로 남는다.
        clubMemberRepository.delete(clubMemberRepository.findByClubIdAndUserId(clubId, member.getId()).orElseThrow());

        authed(leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/bank-transactions?status=AUTO_MATCHED")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].id", equalTo(deposit.getId().intValue()))
                .body("data.content[0].matchedMemberName", org.hamcrest.Matchers.nullValue())
                .body("data.content[0].matchedBillingPeriod", equalTo("2026-07"));
    }

    @Test
    @DisplayName("타 동아리 청구 승인 → 400(동아리 격리)")
    void approveRejectsOtherClubBill() {
        BankTransaction deposit = savePendingDeposit(clubId, DEPOSIT_AMOUNT, "홍길동");

        // 타 동아리 청구는 운영 동아리 범위에서 잠금 조회되지 않아 매칭 후보가 아니다.
        Club otherClub = clubRepository.save(ClubFixture.academic("다른동아리"));
        FeePolicy otherPolicy = feePolicyRepository.save(
                FeePolicyFixture.of(otherClub.getId(), BillingType.MONTHLY, DEPOSIT_AMOUNT));
        User otherMember = joinMember(otherClub);
        FeeBill otherClubBill = saveBill(otherClub.getId(), otherPolicy.getId(), otherMember.getId(),
                DEPOSIT_AMOUNT, "2026-07");

        authed(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("feeBillId", otherClubBill.getId()))
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + deposit.getId() + "/approve")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("이미 매칭된 거래 승인 → 409")
    void approveAlreadyMatchedConflict() {
        User member = joinMember(club);
        FeeBill bill = saveBill(clubId, policyId, member.getId(), DEPOSIT_AMOUNT, "2026-07");
        BankTransaction matched = saveMatchedDeposit(bill, MatchStatus.MANUAL_MATCHED);

        authed(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("feeBillId", bill.getId()))
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + matched.getId() + "/approve")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("무시 → IGNORED")
    void ignoreMarksTransaction() {
        BankTransaction deposit = savePendingDeposit(clubId, DEPOSIT_AMOUNT, "홍길동");

        authed(leaderToken)
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + deposit.getId() + "/ignore")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(bankTransactionRepository.findById(deposit.getId()).orElseThrow().getMatchStatus())
                .isEqualTo(MatchStatus.IGNORED);
    }

    @Test
    @DisplayName("매칭취소 → 연결 payment VOID + 청구 상태 복귀(PENDING/OVERDUE) + 거래 PENDING 복귀")
    void unmatchVoidsPaymentAndResetsTransaction() {
        User member = joinMember(club);
        // 마감일이 미래(2026-12)라 매칭취소 후 청구는 PENDING 으로 복귀해야 한다.
        FeeBill bill = saveBill(clubId, policyId, member.getId(), DEPOSIT_AMOUNT, "2026-12");
        BankTransaction matched = saveMatchedDeposit(bill, MatchStatus.MANUAL_MATCHED);

        authed(leaderToken)
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + matched.getId() + "/unmatch")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(bankTransactionRepository.findById(matched.getId()).orElseThrow().getMatchStatus())
                .isEqualTo(MatchStatus.PENDING);
        assertThat(feeBillRepository.findById(bill.getId()).orElseThrow().getStatus()).isEqualTo(FeeStatus.PENDING);
        String paymentStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM payment WHERE bank_transaction_id = ?", String.class, matched.getId());
        assertThat(paymentStatus).isEqualTo(PaymentStatus.VOIDED.name());
    }

    @Test
    @DisplayName("매칭 안 된 거래(PENDING) 매칭취소 → 400")
    void unmatchPendingBadRequest() {
        BankTransaction deposit = savePendingDeposit(clubId, DEPOSIT_AMOUNT, "홍길동");

        authed(leaderToken)
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + deposit.getId() + "/unmatch")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("비총무 403, 타 동아리 거래 404")
    void forbiddenForNonManagerAndNotFoundForOtherClub() {
        User outsider = userRepository.save(UserFixture.unique());
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());
        BankTransaction deposit = savePendingDeposit(clubId, DEPOSIT_AMOUNT, "홍길동");

        // 비총무(동아리 비회원)는 검토 큐 조회 403.
        authed(outsiderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/bank-transactions")
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        // 타 동아리에 속한 거래를 운영하는 동아리 경로로 무시 시도 → 거래를 못 찾아 404.
        Club otherClub = clubRepository.save(ClubFixture.academic("다른동아리"));
        BankTransaction otherClubTx = savePendingDeposit(otherClub.getId(), DEPOSIT_AMOUNT, "타인");

        authed(leaderToken)
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + otherClubTx.getId() + "/ignore")
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        // 거래는 그대로다(우리 동아리 거래만 처리).
        assertThat(bankTransactionRepository.findById(deposit.getId()).orElseThrow().getMatchStatus())
                .isEqualTo(MatchStatus.PENDING);
    }
}

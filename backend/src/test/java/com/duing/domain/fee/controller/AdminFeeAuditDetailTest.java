package com.duing.domain.fee.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.entity.BankMatchingSetting;
import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeAccount;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.FeeTargetType;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.repository.BankMatchingSettingRepository;
import com.duing.domain.fee.repository.BankTransactionRepository;
import com.duing.domain.fee.repository.FeeAccountRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.crypto.FeeAccountCipher;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import java.time.LocalDate;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
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
 * 총동연 회비 감사 상세 탭(정책·청구·납부·계좌) 검증.
 *
 * <p>날짜는 전부 오늘 기준 상대값이다 — 절대 날짜를 박으면 그 날이 지나는 순간 CI 가 깨진다.
 * 연체 케이스도 status 는 PENDING 인 채로 시드한다(OverdueBillJob 이 돌지 않은 상태 재현) —
 * 미납/연체는 저장된 status 가 아니라 마감일 파생이라는 것이 이 API 의 핵심 규칙이다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminFeeAuditDetailTest extends IntegrationTestBase {

    private static final String POLICIES_PATH = "/api/v1/admin/fees/{clubId}/policies";
    private static final String BILLS_PATH = "/api/v1/admin/fees/{clubId}/bills";
    private static final String PAYMENTS_PATH = "/api/v1/admin/fees/{clubId}/payments";
    private static final String ACCOUNT_PATH = "/api/v1/admin/fees/{clubId}/account";
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String PLAIN_ACCOUNT_NUMBER = "352-1234-5678-90";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired PaymentRepository paymentRepository;
    @Autowired FeeAccountRepository feeAccountRepository;
    @Autowired BankTransactionRepository bankTransactionRepository;
    @Autowired BankMatchingSettingRepository bankMatchingSettingRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired FeeAccountCipher feeAccountCipher;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private String adminToken;
    private String adminName;
    private String leaderName;

    private Long auditClubId;
    private Long otherClubId;

    private Long paidBillId;
    private Long dueTodayBillId;
    private Long overdueBillId;
    private Long futureBillId;
    private Long cancelledBillId;
    private Long withdrawnMemberBillId;

    private Long directPaymentId;
    private Long autoMatchedPaymentId;
    private Long voidedPaymentId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        User adminUser = userRepository.save(UserFixture.admin());
        adminName = adminUser.getName();
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());

        LocalDate today = LocalDate.now(SEOUL);

        Club auditClub = activeClub("감사상세동아리");
        auditClubId = auditClub.getId();
        User leaderUser = saveUser("20230001", "이운영");
        User kimUser = saveUser("20231234", "김두잉");
        User parkUser = saveUser("20239999", "박두잉");
        User withdrawnUser = saveUser("20115555", "탈퇴회원");
        leaderName = leaderUser.getName();
        clubMemberRepository.save(ClubMember.asLeader(auditClub, leaderUser));
        clubMemberRepository.save(ClubMember.of(auditClub, kimUser, ClubMemberRole.MEMBER, 3));
        clubMemberRepository.save(ClubMember.of(auditClub, parkUser, ClubMemberRole.MEMBER, null));
        // 탈퇴 회원 — 청구는 남고 회원 정보만 사라지는 상태를 만든다(soft delete).
        clubMemberRepository.delete(
                clubMemberRepository.save(ClubMember.asMember(auditClub, withdrawnUser)));

        Long mainPolicyId = savePolicy(auditClubId, "월 회비", 10_000L, true);
        paidBillId = saveBill(auditClubId, kimUser.getId(), mainPolicyId, 10_000L,
                today.minusDays(10), FeeStatus.PAID);
        dueTodayBillId = saveBill(auditClubId, parkUser.getId(), mainPolicyId, 20_000L,
                today, FeeStatus.PENDING);
        overdueBillId = saveBill(auditClubId, parkUser.getId(), mainPolicyId, 30_000L,
                today.minusDays(1), FeeStatus.PENDING);
        futureBillId = saveBill(auditClubId, kimUser.getId(), mainPolicyId, 40_000L,
                today.plusDays(10), FeeStatus.PENDING);
        cancelledBillId = saveBill(auditClubId, kimUser.getId(), mainPolicyId, 5_000L,
                today.minusDays(20), FeeStatus.CANCELLED);
        withdrawnMemberBillId = saveBill(auditClubId, withdrawnUser.getId(), mainPolicyId, 7_000L,
                today.plusDays(3), FeeStatus.PENDING);

        // 납부 3건 — 납부일을 벌려 최신순 정렬이 결정적이게 둔다(정정 > 자동매칭 > 수기).
        Instant now = Instant.now();
        directPaymentId = saveActivePayment(paidBillId, 4_000L, leaderUser.getId(),
                now.minusSeconds(3 * 3600), null);
        BankTransaction depositTransaction =
                saveAutoMatchedTransaction(auditClubId, paidBillId, 6_000L, "김두잉");
        autoMatchedPaymentId = saveActivePayment(paidBillId, 6_000L, leaderUser.getId(),
                now.minusSeconds(2 * 3600), depositTransaction.getId());
        voidedPaymentId = saveVoidedPayment(dueTodayBillId, 20_000L, leaderUser.getId(),
                now.minusSeconds(3600), adminUser.getId());

        feeAccountRepository.save(FeeAccount.create(auditClubId, Bank.KB,
                feeAccountCipher.encrypt(PLAIN_ACCOUNT_NUMBER, auditClubId), "총무 김두잉"));
        BankMatchingSetting matchingSetting = BankMatchingSetting.of(auditClubId);
        matchingSetting.activate();
        bankMatchingSettingRepository.save(matchingSetting);

        // 다른 동아리 — 정책 납부율(청구 4건 중 3건 완납)과 계좌 미등록 응답 검증용.
        otherClubId = activeClub("감사비교동아리").getId();
        Long ratePolicyId = savePolicy(otherClubId, "납부율 정책", 10_000L, true);
        savePolicy(otherClubId, "지난 학기 정책", 20_000L, false);
        saveBill(otherClubId, kimUser.getId(), ratePolicyId, 10_000L, today.minusDays(5), FeeStatus.PAID);
        saveBill(otherClubId, kimUser.getId(), ratePolicyId, 10_000L, today.minusDays(4), FeeStatus.PAID);
        saveBill(otherClubId, kimUser.getId(), ratePolicyId, 10_000L, today.minusDays(3), FeeStatus.PAID);
        saveBill(otherClubId, kimUser.getId(), ratePolicyId, 10_000L, today.plusDays(3), FeeStatus.PENDING);
        // 취소 청구는 납부율 분모에서 빠진다.
        saveBill(otherClubId, kimUser.getId(), ratePolicyId, 10_000L, today.minusDays(2), FeeStatus.CANCELLED);
    }

    @Test
    @DisplayName("마감 당일 청구는 미납으로만 잡히고 마감이 지난 청구부터 연체 필터에 잡힌다")
    void unpaidAndOverdueSplitAtDueDate() {
        JsonPath overdueResponse = searchBills("filter", "OVERDUE");
        assertThat(overdueResponse.getList("data.content")).hasSize(1);
        assertThat(overdueResponse.getLong("data.content[0].billId")).isEqualTo(overdueBillId);

        JsonPath unpaidResponse = searchBills("filter", "UNPAID");
        assertThat(unpaidResponse.getList("data.content.billId", Long.class))
                .as("마감 당일 청구는 아직 연체가 아니라 미납이다")
                .containsExactlyInAnyOrder(dueTodayBillId, futureBillId, withdrawnMemberBillId);

        JsonPath cancelledResponse = searchBills("filter", "CANCELLED");
        assertThat(cancelledResponse.getList("data.content.billId", Long.class))
                .containsExactly(cancelledBillId);
    }

    @Test
    @DisplayName("청구 검색은 회원명 부분 일치와 학번 앞자리 일치로 걸리고 학번 중간 일치는 걸리지 않는다")
    void billSearchMatchesNamePartAndStudentIdPrefix() {
        JsonPath byName = searchBills("q", "김두");
        assertThat(byName.getList("data.content.billId", Long.class))
                .containsExactlyInAnyOrder(paidBillId, futureBillId, cancelledBillId);

        JsonPath byStudentIdPrefix = searchBills("q", "20239");
        assertThat(byStudentIdPrefix.getList("data.content.billId", Long.class))
                .containsExactlyInAnyOrder(dueTodayBillId, overdueBillId);

        JsonPath byStudentIdMiddle = searchBills("q", "9999");
        assertThat(byStudentIdMiddle.getList("data.content")).isEmpty();
    }

    @Test
    @DisplayName("청구 검색어의 앞뒤 공백은 매칭을 막지 않는다")
    void billSearchIgnoresSurroundingWhitespace() {
        JsonPath byName = searchBills("q", "  김두  ");
        assertThat(byName.getList("data.content.billId", Long.class))
                .containsExactlyInAnyOrder(paidBillId, futureBillId, cancelledBillId);

        // 학번은 prefix 매칭이라, 공백이 남으면 앞자리부터 어긋나 아무것도 걸리지 않는다.
        JsonPath byStudentIdPrefix = searchBills("q", "  20239  ");
        assertThat(byStudentIdPrefix.getList("data.content.billId", Long.class))
                .containsExactlyInAnyOrder(dueTodayBillId, overdueBillId);
    }

    @Test
    @DisplayName("연체 여부는 저장된 상태가 아니라 마감일로 파생되고 완납 청구는 마감이 지나도 연체가 아니다")
    void overdueFlagIsDerivedFromDueDate() {
        JsonPath response = searchBills();

        assertThat(response.getString(billPath(overdueBillId) + ".status")).isEqualTo("PENDING");
        assertThat(response.getBoolean(billPath(overdueBillId) + ".overdue")).isTrue();
        assertThat(response.getBoolean(billPath(dueTodayBillId) + ".overdue")).isFalse();
        // 완납·취소 청구는 마감이 지났어도 연체가 아니다.
        assertThat(response.getBoolean(billPath(paidBillId) + ".overdue")).isFalse();
        assertThat(response.getBoolean(billPath(cancelledBillId) + ".overdue")).isFalse();

        // 납부액은 활성 납부만 합산한다 — 청구 1건에 납부 2건이 달려도 행이 늘지 않는다.
        assertThat(response.getLong(billPath(paidBillId) + ".paidAmount")).isEqualTo(10_000L);
        assertThat(response.getString(billPath(paidBillId) + ".lastPaidAt")).isNotNull();
        assertThat(response.getLong(billPath(dueTodayBillId) + ".paidAmount"))
                .as("정정된 납부는 납부액에서 빠진다")
                .isZero();
        assertThat(response.getInt(billPath(paidBillId) + ".generation")).isEqualTo(3);
        assertThat(response.getLong("data.totalElements")).isEqualTo(6L);
    }

    @Test
    @DisplayName("탈퇴한 회원의 청구도 목록에 남고 회원 정보만 비어서 내려간다")
    void withdrawnMemberBillSurvivesWithoutMemberInfo() {
        JsonPath response = searchBills();

        assertThat(response.getString(billPath(withdrawnMemberBillId) + ".userName")).isNull();
        assertThat(response.getString(billPath(withdrawnMemberBillId) + ".studentId")).isNull();
        assertThat(response.getString(billPath(withdrawnMemberBillId) + ".generation")).isNull();
        assertThat(response.getLong(billPath(withdrawnMemberBillId) + ".amount")).isEqualTo(7_000L);
    }

    @Test
    @DisplayName("납부 목록은 정정 이력과 매칭 유형을 최신순으로 함께 보여준다")
    void paymentListShowsVoidHistoryAndMatchType() {
        JsonPath response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PAYMENTS_PATH, auditClubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();

        assertThat(response.getList("data.content.paymentId", Long.class))
                .containsExactly(voidedPaymentId, autoMatchedPaymentId, directPaymentId);

        assertThat(response.getString(paymentPath(voidedPaymentId) + ".status")).isEqualTo("VOIDED");
        assertThat(response.getString(paymentPath(voidedPaymentId) + ".voidReason"))
                .isEqualTo("중복 입금 정정");
        assertThat(response.getString(paymentPath(voidedPaymentId) + ".voidedByName")).isEqualTo(adminName);
        assertThat(response.getString(paymentPath(voidedPaymentId) + ".voidedAt")).isNotNull();

        assertThat(response.getString(paymentPath(autoMatchedPaymentId) + ".matchType")).isEqualTo("AUTO");
        assertThat(response.getString(paymentPath(autoMatchedPaymentId) + ".counterparty")).isEqualTo("김두잉");

        assertThat(response.getString(paymentPath(directPaymentId) + ".matchType")).isEqualTo("DIRECT");
        assertThat(response.getString(paymentPath(directPaymentId) + ".counterparty")).isNull();
        assertThat(response.getString(paymentPath(directPaymentId) + ".recordedByName")).isEqualTo(leaderName);
        assertThat(response.getString(paymentPath(directPaymentId) + ".userName")).isEqualTo("김두잉");

        JsonPath voidedOnly = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("status", "VOIDED")
                .when().get(PAYMENTS_PATH, auditClubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
        assertThat(voidedOnly.getList("data.content.paymentId", Long.class)).containsExactly(voidedPaymentId);
    }

    @Test
    @DisplayName("계좌 조회는 마스킹된 번호만 내려주고 평문 계좌번호는 응답 어디에도 없다")
    void accountResponseNeverExposesPlainAccountNumber() {
        Response accountResponse = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(ACCOUNT_PATH, auditClubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().response();

        JsonPath account = accountResponse.jsonPath();
        assertThat(account.getBoolean("data.registered")).isTrue();
        assertThat(account.getString("data.bank")).isEqualTo("KB");
        assertThat(account.getString("data.maskedAccountNumber")).isEqualTo("****7890");
        assertThat(account.getString("data.accountHolder")).isEqualTo("총무 김두잉");
        assertThat(account.getBoolean("data.bankMatchingActive")).isTrue();
        assertThat(accountResponse.asString())
                .as("평문 계좌번호는 어떤 형태로도 응답에 실리면 안 된다")
                .doesNotContain(PLAIN_ACCOUNT_NUMBER)
                .doesNotContain(PLAIN_ACCOUNT_NUMBER.replace("-", ""));

        JsonPath unregistered = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(ACCOUNT_PATH, otherClubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
        assertThat(unregistered.getBoolean("data.registered")).isFalse();
        assertThat(unregistered.getString("data.bank")).isNull();
        assertThat(unregistered.getString("data.maskedAccountNumber")).isNull();
        assertThat(unregistered.getBoolean("data.bankMatchingActive")).isFalse();
    }

    @Test
    @DisplayName("정책 목록은 비활성 정책까지 싣고 취소 청구를 뺀 납부율을 계산한다")
    void policyListIncludesInactivePolicyAndPaymentRate() {
        JsonPath response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(POLICIES_PATH, otherClubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();

        assertThat(response.getList("data")).hasSize(2);
        assertThat(response.getLong("data.find { it.name == '납부율 정책' }.billCount")).isEqualTo(4L);
        assertThat(response.getLong("data.find { it.name == '납부율 정책' }.paidCount")).isEqualTo(3L);
        assertThat(response.getDouble("data.find { it.name == '납부율 정책' }.paymentRate")).isEqualTo(75.0);
        assertThat(response.getString("data.find { it.name == '납부율 정책' }.createdAt")).isNotNull();

        assertThat(response.getBoolean("data.find { it.name == '지난 학기 정책' }.active")).isFalse();
        assertThat(response.getLong("data.find { it.name == '지난 학기 정책' }.billCount")).isZero();
        assertThat(response.getDouble("data.find { it.name == '지난 학기 정책' }.paymentRate")).isZero();
    }

    @Test
    @DisplayName("존재하지 않는 동아리의 하위 탭은 빈 결과가 아니라 404 이고 열람 감사도 남지 않는다")
    void missingClubSubResourceReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(BILLS_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        // 계좌는 미등록 동아리와 응답이 같아 보일 수 있어(registered=false) 별도로 확인한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(ACCOUNT_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        assertThat(clubAuditEventRepository.findAll()).isEmpty();
    }

    private JsonPath searchBills(String... queryParams) {
        var request = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
        for (int index = 0; index < queryParams.length; index += 2) {
            request = request.queryParam(queryParams[index], queryParams[index + 1]);
        }
        return request.when().get(BILLS_PATH, auditClubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private String billPath(Long billId) {
        return "data.content.find { it.billId == " + billId + " }";
    }

    private String paymentPath(Long paymentId) {
        return "data.content.find { it.paymentId == " + paymentId + " }";
    }

    /** 학번·이름을 지정한 학생을 만든다 — 검색 규칙(이름 부분 일치·학번 prefix) 검증에 고정 값이 필요하다. */
    private User saveUser(String studentId, String name) {
        return userRepository.save(User.create(studentId, name, "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    /** ClubFixture 의 기본 상태는 승인 대기라, 감사 대상 스코프(ACTIVE)에 들도록 승격한다. */
    private Club activeClub(String name) {
        Club savedClub = clubRepository.save(ClubFixture.academic(name));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", savedClub.getId());
        return savedClub;
    }

    private Long savePolicy(Long clubId, String name, long amount, boolean active) {
        FeePolicy policy = FeePolicy.create(clubId, name, amount, BillingType.MONTHLY,
                FeeTargetType.ALL_MEMBERS);
        if (!active) {
            policy.update(null, null, null, false);
        }
        return feePolicyRepository.save(policy).getId();
    }

    private Long saveBill(Long clubId, Long userId, Long policyId, long amount,
                          LocalDate dueDate, FeeStatus status) {
        LocalDate billingStartDate = dueDate.minusDays(30);
        FeeBill bill = FeeBill.issue(clubId, userId, policyId, amount, billingStartDate.toString(),
                billingStartDate, billingStartDate.plusDays(29), dueDate);
        if (status == FeeStatus.CANCELLED) {
            bill.cancel();
        } else {
            bill.updateStatus(status);
        }
        return feeBillRepository.save(bill).getId();
    }

    private Long saveActivePayment(Long feeBillId, long amount, Long recordedBy,
                                   Instant paidAt, Long bankTransactionId) {
        PaymentMethod method = bankTransactionId == null
                ? PaymentMethod.TRANSFER : PaymentMethod.AUTO_MATCHED;
        Payment payment = Payment.record(feeBillId, amount, method, paidAt, recordedBy, null);
        if (bankTransactionId != null) {
            payment.linkBankTransaction(bankTransactionId);
        }
        return paymentRepository.save(payment).getId();
    }

    private Long saveVoidedPayment(Long feeBillId, long amount, Long recordedBy,
                                   Instant paidAt, Long voidedBy) {
        Payment payment = Payment.record(feeBillId, amount, PaymentMethod.TRANSFER, paidAt, recordedBy, null);
        payment.voidPayment(voidedBy, "중복 입금 정정", paidAt.plusSeconds(600));
        return paymentRepository.save(payment).getId();
    }

    private BankTransaction saveAutoMatchedTransaction(Long clubId, Long feeBillId, long amount,
                                                       String counterparty) {
        BankTransaction transaction = BankTransaction.ingest(clubId, "KB", Instant.now(),
                amount, null, counterparty, TransactionType.DEPOSIT,
                "hash-" + clubId + "-" + amount, "{}");
        transaction.matchTo(feeBillId, MatchStatus.AUTO_MATCHED);
        return bankTransactionRepository.save(transaction);
    }
}

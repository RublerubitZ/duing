package com.duing.domain.fee.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeTargetType;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.repository.BankTransactionRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
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
 * 회비 이상징후 평가 검증(스펙 §5.1·§7.9) — 임계값 경계와 윈도우 규칙이 이 화면의 전부라 그 둘에 집중한다.
 *
 * <p>경계는 한 요청 안에서 비교할 수 있도록 동아리를 여러 개 두고 각각 다른 건수를 심는다
 * (테스트 메서드마다 DB 가 비워지므로 한 메서드 안에서는 리셋할 수 없다).
 *
 * <p>날짜·시각은 전부 현재 기준 상대값이다 — 절대 날짜를 박으면 그 날이 지나는 순간 CI 가 깨진다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminFeeAnomalyServiceTest extends IntegrationTestBase {

    private static final String ANOMALIES_PATH = "/api/v1/admin/fees/{clubId}/anomalies";
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired PaymentRepository paymentRepository;
    @Autowired BankTransactionRepository bankTransactionRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private String adminToken;
    private Long leaderUserId;
    private Long memberUserId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        User adminUser = userRepository.save(UserFixture.admin());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        leaderUserId = userRepository.save(UserFixture.withName("이운영")).getId();
        memberUserId = userRepository.save(UserFixture.unique()).getId();
    }

    @Test
    @DisplayName("납부 정정은 3건부터 WARNING·8건부터 HIGH 로 오르고 상위가 걸리면 하위 경고를 겹쳐 싣지 않는다")
    void voidedPaymentRuleEscalatesAtEachThreshold() {
        Long belowThresholdClubId = clubWithVoidedPayments("정정2건동아리", 2);
        Long warningClubId = clubWithVoidedPayments("정정3건동아리", 3);
        Long highClubId = clubWithVoidedPayments("정정8건동아리", 8);

        assertThat(evaluate(belowThresholdClubId).getList("data.anomalies.ruleId", String.class))
                .as("기준 미만이면 아무것도 보고하지 않는다")
                .doesNotContain("FA-02");

        JsonPath warningReport = evaluate(warningClubId);
        assertThat(warningReport.getString(rulePath("FA-02") + ".severity")).isEqualTo("WARNING");
        assertThat(warningReport.getString(rulePath("FA-02") + ".title")).isEqualTo("납부 정정(VOID) 과다");
        assertThat(warningReport.getString(rulePath("FA-02") + ".description"))
                .isEqualTo("기간 내 납부 정정 3건 (기준 3건)");
        assertThat(warningReport.getLong(rulePath("FA-02") + ".evidence.voidCount")).isEqualTo(3L);
        assertThat(warningReport.getLong(rulePath("FA-02") + ".evidence.threshold")).isEqualTo(3L);

        JsonPath highReport = evaluate(highClubId);
        assertThat(highReport.getList("data.anomalies.findAll { it.ruleId == 'FA-02' }"))
                .as("이중 임계를 모두 넘겨도 상위 하나만 남는다")
                .hasSize(1);
        assertThat(highReport.getString(rulePath("FA-02") + ".severity")).isEqualTo("HIGH");
        assertThat(highReport.getLong(rulePath("FA-02") + ".evidence.voidCount")).isEqualTo(8L);
    }

    @Test
    @DisplayName("수동 매칭 비율은 매칭 거래가 5건 이상일 때만 판정해 표본이 작으면 비율이 높아도 침묵한다")
    void manualMatchRuleRequiresMinimumSample() {
        Long ratioClubId = clubWithMatchedTransactions("매칭5건동아리", 2, 3);
        Long smallSampleClubId = clubWithMatchedTransactions("매칭4건동아리", 1, 3);

        JsonPath ratioReport = evaluate(ratioClubId);
        assertThat(ratioReport.getString(rulePath("FA-01") + ".severity")).isEqualTo("WARNING");
        assertThat(ratioReport.getString(rulePath("FA-01") + ".description"))
                .isEqualTo("기간 내 매칭 거래 5건 중 수동 매칭 3건 (60.0%, 기준 60%·5건)");
        assertThat(ratioReport.getLong(rulePath("FA-01") + ".evidence.matchedCount")).isEqualTo(5L);
        assertThat(ratioReport.getLong(rulePath("FA-01") + ".evidence.manualCount")).isEqualTo(3L);

        assertThat(evaluate(smallSampleClubId).getList("data.anomalies.ruleId", String.class))
                .as("4건 중 3건(75%)이어도 매칭 거래가 5건 미만이면 판정하지 않는다")
                .doesNotContain("FA-01");
    }

    @Test
    @DisplayName("지난 학기 청구를 이번 달에 몰아 취소하면 발행이 0건이어도 5건부터 보고하고 4건이면 침묵한다")
    void cancelRuleReportsMassCancellationWithoutIssuance() {
        Long reportedClubId = clubWithBillsCancelledAfterIssuePeriod("취소5건동아리", 5);
        Long quietClubId = clubWithBillsCancelledAfterIssuePeriod("취소4건동아리", 4);

        JsonPath report = evaluate(reportedClubId);
        assertThat(report.getString(rulePath("FA-03") + ".severity")).isEqualTo("WARNING");
        assertThat(report.getString(rulePath("FA-03") + ".description"))
                .isEqualTo("기간 내 청구 취소 5건 (기간 내 발행 없음, 기준 5건)");
        assertThat(report.getLong(rulePath("FA-03") + ".evidence.cancelledCount")).isEqualTo(5L);
        assertThat(report.getLong(rulePath("FA-03") + ".evidence.issuedCount"))
                .as("분모가 0 이라 비율은 싣지 않는다 — 발행이 없었다는 사실 자체가 근거다")
                .isZero();

        assertThat(evaluate(quietClubId).getList("data.anomalies.ruleId", String.class))
                .as("취소가 기준(5건) 미만이면 발행이 없어도 보고하지 않는다")
                .doesNotContain("FA-03");
    }

    @Test
    @DisplayName("계좌 변경은 요청 기간이 30일이어도 90일까지 넓혀 보므로 두 달 전 교체까지 CRITICAL 로 잡힌다")
    void accountChangeRuleWidensWindowToNinetyDays() {
        LocalDate today = LocalDate.now(SEOUL);
        Long clubId = saveClub("계좌교체동아리");
        backdateEvent(saveAccountEvent(clubId, ClubAuditEventType.FEE_ACCOUNT_UPDATED), 60);
        backdateEvent(saveAccountEvent(clubId, ClubAuditEventType.FEE_ACCOUNT_DELETED), 10);

        JsonPath report = evaluate(clubId, "from", today.minusDays(30).toString(), "to", today.toString());

        assertThat(report.getString(rulePath("FA-08") + ".severity")).isEqualTo("CRITICAL");
        assertThat(report.getString(rulePath("FA-08") + ".title")).isEqualTo("계좌 빈번 교체");
        assertThat(report.getLong(rulePath("FA-08") + ".evidence.accountChangeCount"))
                .as("기간 밖(60일 전) 교체도 90일 하한 덕에 세어진다")
                .isEqualTo(2L);
        assertThat(report.getLong(rulePath("FA-08") + ".evidence.windowDays")).isEqualTo(90L);
        assertThat(report.getString("data.window.from"))
                .as("window 는 요청한 기간 그대로다 — 넓힌 창은 FA-08 안에서만 쓰인다")
                .isEqualTo(today.minusDays(30).toString());
    }

    @Test
    @DisplayName("단시간 대량 변경은 변이 이벤트 20건에 HIGH 지만 열람 이벤트만 20건이면 아무것도 보고하지 않는다")
    void eventBurstRuleCountsMutationsOnly() {
        Long mutationClubId = saveClub("변이20건동아리");
        Long viewOnlyClubId = saveClub("열람20건동아리");
        for (int index = 0; index < 20; index++) {
            clubAuditEventRepository.save(ClubAuditEvent.feePayment(
                    ClubAuditEventType.FEE_PAYMENT_RECORDED, mutationClubId, null, null, null,
                    leaderUserId, null, null));
            clubAuditEventRepository.save(ClubAuditEvent.feeAdminView(viewOnlyClubId, leaderUserId));
        }

        JsonPath mutationReport = evaluate(mutationClubId);
        assertThat(mutationReport.getString(rulePath("FA-06") + ".severity")).isEqualTo("HIGH");
        assertThat(mutationReport.getString(rulePath("FA-06") + ".description"))
                .isEqualTo("최근 24시간 회비 변경 20건 (기준 20건)");
        assertThat(mutationReport.getLong(rulePath("FA-06") + ".evidence.mutationCount")).isEqualTo(20L);

        assertThat(evaluate(viewOnlyClubId).getList("data.anomalies"))
                .as("총동연이 화면을 여러 번 열어 본 것은 회비 변경이 아니다")
                .isEmpty();
    }

    @Test
    @DisplayName("걸린 규칙이 없으면 빈 목록과 함께 기본 평가 기간(최근 30일)을 돌려준다")
    void quietClubReturnsEmptyAnomalies() {
        LocalDate today = LocalDate.now(SEOUL);
        Long clubId = saveClub("조용한동아리");

        JsonPath report = evaluate(clubId);

        assertThat(report.getList("data.anomalies")).isEmpty();
        assertThat(report.getString("data.evaluatedAt")).isNotNull();
        assertThat(report.getString("data.window.from")).isEqualTo(today.minusDays(30).toString());
        assertThat(report.getString("data.window.to")).isEqualTo(today.toString());
    }

    @Test
    @DisplayName("이상징후는 비로그인 401·학생 403 이고 없는 동아리는 빈 리포트가 아니라 404 다")
    void anomaliesRequireAdminRole() {
        Long clubId = saveClub("권한검증동아리");
        User studentUser = userRepository.save(UserFixture.unique());
        String studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());

        RestAssured.given()
                .when().get(ANOMALIES_PATH, clubId)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(ANOMALIES_PATH, clubId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(ANOMALIES_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    private JsonPath evaluate(Long clubId, String... queryParams) {
        var request = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
        for (int index = 0; index < queryParams.length; index += 2) {
            request = request.queryParam(queryParams[index], queryParams[index + 1]);
        }
        return request.when().get(ANOMALIES_PATH, clubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private static String rulePath(String ruleId) {
        return "data.anomalies.find { it.ruleId == '" + ruleId + "' }";
    }

    /** 마감일을 넉넉히 뒤로 둔 청구 1건에 정정 납부만 심는다 — 마감 후 정정(FA-04)까지 걸리지 않게 하기 위해서다. */
    private Long clubWithVoidedPayments(String clubName, int voidCount) {
        Long clubId = saveClub(clubName);
        Long billId = saveBill(clubId, LocalDate.now(SEOUL).plusDays(7));
        for (int index = 0; index < voidCount; index++) {
            Payment payment = Payment.record(billId, 20_000L, PaymentMethod.TRANSFER,
                    LocalDateTime.now(SEOUL).minusDays(2), leaderUserId, null);
            payment.voidPayment(leaderUserId, "중복 입금 정정", LocalDateTime.now(SEOUL));
            paymentRepository.save(payment);
        }
        return clubId;
    }

    /**
     * 발행은 기본 기간(최근 30일) 밖, 취소는 기간 안인 청구를 심는다 — 지난 학기 청구를 이번 달에 몰아 취소한 상황이다.
     * 취소 시각은 updated_at(취소 저장 시점 = 지금)이고 발행 시각만 SQL 로 되돌린다(created_at 은 JVM 존 벽시계).
     */
    private Long clubWithBillsCancelledAfterIssuePeriod(String clubName, int cancelledCount) {
        Long clubId = saveClub(clubName);
        for (int index = 0; index < cancelledCount; index++) {
            FeeBill bill = feeBillRepository.findById(saveBill(clubId, LocalDate.now(SEOUL).plusDays(7)))
                    .orElseThrow();
            bill.cancel();
            feeBillRepository.save(bill);
        }
        jdbcTemplate.update("UPDATE fee_bill SET created_at = ? WHERE club_id = ?",
                Timestamp.valueOf(LocalDateTime.now().minusDays(200)), clubId);
        return clubId;
    }

    private Long clubWithMatchedTransactions(String clubName, int autoCount, int manualCount) {
        Long clubId = saveClub(clubName);
        Long billId = saveBill(clubId, LocalDate.now(SEOUL).plusDays(7));
        saveMatchedTransactions(clubId, billId, MatchStatus.AUTO_MATCHED, autoCount);
        saveMatchedTransactions(clubId, billId, MatchStatus.MANUAL_MATCHED, manualCount);
        return clubId;
    }

    private void saveMatchedTransactions(Long clubId, Long billId, MatchStatus matchStatus, int count) {
        for (int index = 0; index < count; index++) {
            BankTransaction transaction = BankTransaction.ingest(clubId, "NH",
                    LocalDateTime.now(SEOUL).minusDays(1), 20_000L, 100_000L, "홍길동",
                    TransactionType.DEPOSIT, "hash-" + System.nanoTime() + "-" + index, "{}");
            transaction.matchTo(billId, matchStatus);
            bankTransactionRepository.save(transaction);
        }
    }

    private Long saveBill(Long clubId, LocalDate dueDate) {
        LocalDate today = LocalDate.now(SEOUL);
        Long policyId = feePolicyRepository.save(FeePolicy.create(clubId, "월 회비", 20_000L,
                BillingType.MONTHLY, FeeTargetType.ALL_MEMBERS)).getId();
        return feeBillRepository.save(FeeBill.issue(clubId, memberUserId, policyId, 20_000L,
                YearMonth.now(SEOUL).toString(), today.minusDays(10), today.minusDays(1), dueDate)).getId();
    }

    private Long saveAccountEvent(Long clubId, ClubAuditEventType eventType) {
        return clubAuditEventRepository.save(
                ClubAuditEvent.feeAccount(eventType, clubId, leaderUserId, null)).getId();
    }

    /**
     * created_at 은 BaseEntity 가 저장 시각으로 자동 스탬프하므로 과거 이벤트는 SQL 로 되돌려야 만들어진다.
     * 값은 JVM 존 벽시계다 — 감사 이벤트를 남긴 JPA 와 같은 존이어야 조회 경계와 맞는다.
     */
    private void backdateEvent(Long eventId, int daysAgo) {
        jdbcTemplate.update("UPDATE club_audit_event SET created_at = ? WHERE id = ?",
                Timestamp.valueOf(LocalDateTime.now().minusDays(daysAgo)), eventId);
    }

    private Long saveClub(String clubName) {
        return clubRepository.save(ClubFixture.academic(clubName)).getId();
    }
}

package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.repository.BankTransactionRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
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
 * 납부·매칭 변이가 club_audit_event 를 남기는지 검증한다(수기 납부·정정·승인·매칭취소·무시).
 *
 * <p>detail 은 jsonb 라 키 순서가 보존되지 않으므로 문자열 비교 대신 파싱해 필드 단위로 단언한다.
 * 회차·납부일·거래일은 하드코딩한 절대 날짜 대신 실행 시점 기준 상대값을 쓴다(테스트 시한폭탄 방지).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FeePaymentAuditInstrumentationTest extends IntegrationTestBase {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final long BILL_AMOUNT = 10000L;

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
    ClubAuditEventRepository clubAuditEventRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private final AtomicInteger hashCounter = new AtomicInteger();

    private Long clubId;
    private Long policyId;
    private Long memberUserId;
    private Long leaderUserId;
    private String leaderToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("회비동아리"));
        clubId = club.getId();
        // 회비 운영 행위는 ACTIVE 동아리만 허용되므로 승격한다(Club.create 기본은 PENDING_APPROVAL).
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);

        User leader = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.asMember(club, member));

        leaderUserId = leader.getId();
        memberUserId = member.getId();
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        policyId = feePolicyRepository.save(
                FeePolicyFixture.of(clubId, BillingType.MONTHLY, BILL_AMOUNT)).getId();
    }

    private RequestSpecification authed() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken);
    }

    /** 당월 회차 청구 1건. 마감일은 실행 시점 기준 30일 뒤라 마감 경과(OVERDUE) 판정에 흔들리지 않는다. */
    private FeeBill saveBill() {
        LocalDate today = LocalDate.now(SEOUL);
        YearMonth period = YearMonth.from(today);
        return feeBillRepository.save(FeeBill.issue(
                clubId, memberUserId, policyId, BILL_AMOUNT, period.toString(),
                period.atDay(1), period.atEndOfMonth(), today.plusDays(30)));
    }

    /** PENDING 입금 거래 1건. transaction_hash 유니크 제약을 피하려 카운터로 고유 해시를 부여한다. */
    private BankTransaction savePendingDeposit(long amount) {
        String hash = "hash-" + hashCounter.incrementAndGet();
        return bankTransactionRepository.save(BankTransaction.ingest(
                clubId, "011", Instant.now().minusSeconds(3600), amount, 100000L,
                "홍길동", TransactionType.DEPOSIT, hash, "{\"type\":\"deposit\"}"));
    }

    private Long recordPayment(Long billId, long amount, String method) {
        Map<String, Object> body = new HashMap<>();
        body.put("amount", amount);
        body.put("method", method);
        body.put("paidAt", LocalDate.now(SEOUL).toString());
        return authed()
                .contentType(ContentType.JSON)
                .body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + billId + "/payments")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");
    }

    private void voidPayment(Long billId, Long paymentId, String reason) {
        authed()
                .contentType(ContentType.JSON)
                .body(Map.of("reason", reason))
                .when().post("/api/v1/leader/clubs/" + clubId
                        + "/fee-bills/" + billId + "/payments/" + paymentId + "/void")
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    private void approve(Long txId, Long billId) {
        authed()
                .contentType(ContentType.JSON)
                .body(Map.of("feeBillId", billId))
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + txId + "/approve")
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    private void postTransactionAction(Long txId, String action) {
        authed()
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/" + txId + "/" + action)
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    private List<ClubAuditEvent> eventsOf(ClubAuditEventType eventType) {
        return clubAuditEventRepository.findAll().stream()
                .filter(event -> event.getEventType() == eventType)
                .toList();
    }

    /** 해당 타입의 감사 이벤트가 정확히 1건임을 확인하고 그 한 건을 돌려준다. */
    private ClubAuditEvent singleEventOf(ClubAuditEventType eventType) {
        List<ClubAuditEvent> events = eventsOf(eventType);
        assertThat(events).as("%s 감사 이벤트", eventType).hasSize(1);
        return events.getFirst();
    }

    /** jsonb detail 은 키 순서가 보존되지 않으므로 파싱해 필드 단위로 단언한다. */
    private static JsonNode detailOf(ClubAuditEvent event) {
        try {
            return OBJECT_MAPPER.readTree(event.getDetail());
        } catch (JsonProcessingException parseFailure) {
            throw new IllegalStateException("감사 detail 파싱 실패: " + event.getDetail(), parseFailure);
        }
    }

    @Test
    @DisplayName("수기 납부를 기록하면 연결 거래 없는 납부 감사가 1건 남고 detail 에 자동매칭이 아님이 기록된다")
    void manualPaymentRecordIsAudited() {
        FeeBill bill = saveBill();

        Long paymentId = recordPayment(bill.getId(), 4000L, "CASH");

        ClubAuditEvent event = singleEventOf(ClubAuditEventType.FEE_PAYMENT_RECORDED);
        assertThat(event.getClubId()).isEqualTo(clubId);
        assertThat(event.getFeeBillId()).isEqualTo(bill.getId());
        assertThat(event.getPaymentId()).isEqualTo(paymentId);
        assertThat(event.getBankTransactionId()).as("수기 납부는 연결된 입금 거래가 없다").isNull();
        assertThat(event.getActorUserId()).isEqualTo(leaderUserId);
        assertThat(event.getReason()).isNull();
        JsonNode detail = detailOf(event);
        assertThat(detail.get("amount").asLong()).isEqualTo(4000L);
        assertThat(detail.get("method").asText()).isEqualTo("CASH");
        assertThat(detail.get("autoMatched").asBoolean()).isFalse();
    }

    @Test
    @DisplayName("납부를 정정하면 사유가 담긴 정정 감사가 남고, 이미 정정된 납부를 다시 정정해도 1건으로 유지된다")
    void paymentVoidIsAuditedOnceWithReason() {
        FeeBill bill = saveBill();
        Long paymentId = recordPayment(bill.getId(), BILL_AMOUNT, "CASH");

        voidPayment(bill.getId(), paymentId, "오입금 정정");

        ClubAuditEvent event = singleEventOf(ClubAuditEventType.FEE_PAYMENT_VOIDED);
        assertThat(event.getClubId()).isEqualTo(clubId);
        assertThat(event.getFeeBillId()).isEqualTo(bill.getId());
        assertThat(event.getPaymentId()).isEqualTo(paymentId);
        assertThat(event.getBankTransactionId()).isNull();
        assertThat(event.getActorUserId()).isEqualTo(leaderUserId);
        assertThat(event.getReason()).isEqualTo("오입금 정정");
        assertThat(detailOf(event).get("amount").asLong()).isEqualTo(BILL_AMOUNT);

        // 멱등 no-op 재호출 — 실제 전이가 없으므로 감사도 늘지 않고 최초 사유가 보존된다.
        voidPayment(bill.getId(), paymentId, "2차 정정");
        assertThat(eventsOf(ClubAuditEventType.FEE_PAYMENT_VOIDED)).hasSize(1);
        assertThat(singleEventOf(ClubAuditEventType.FEE_PAYMENT_VOIDED).getReason()).isEqualTo("오입금 정정");
    }

    @Test
    @DisplayName("입금 거래를 수동 승인하면 수기 매칭 감사와 자동매칭이 아닌 납부 기록 감사가 각각 1건 남는다")
    void approveIsAuditedAsManualMatchAndPaymentRecord() {
        FeeBill bill = saveBill();
        BankTransaction deposit = savePendingDeposit(BILL_AMOUNT);

        approve(deposit.getId(), bill.getId());

        ClubAuditEvent matched = singleEventOf(ClubAuditEventType.FEE_TX_MANUAL_MATCHED);
        assertThat(matched.getClubId()).isEqualTo(clubId);
        assertThat(matched.getBankTransactionId()).isEqualTo(deposit.getId());
        assertThat(matched.getFeeBillId()).isEqualTo(bill.getId());
        assertThat(matched.getActorUserId()).isEqualTo(leaderUserId);

        ClubAuditEvent recorded = singleEventOf(ClubAuditEventType.FEE_PAYMENT_RECORDED);
        assertThat(recorded.getFeeBillId()).isEqualTo(bill.getId());
        assertThat(recorded.getBankTransactionId()).as("매칭 납부는 연결된 입금 거래가 남는다")
                .isEqualTo(deposit.getId());
        assertThat(recorded.getPaymentId()).isEqualTo(singlePaymentId());
        assertThat(recorded.getActorUserId()).isEqualTo(leaderUserId);
        JsonNode detail = detailOf(recorded);
        assertThat(detail.get("amount").asLong()).isEqualTo(BILL_AMOUNT);
        assertThat(detail.get("autoMatched").asBoolean()).as("수동 승인은 자동매칭이 아니다").isFalse();
    }

    @Test
    @DisplayName("매칭을 취소하면 거래 매칭취소와 납부 정정 감사가 한 번에 각각 1건씩 남는다")
    void unmatchAuditsTransactionAndPaymentVoidTogether() {
        FeeBill bill = saveBill();
        BankTransaction deposit = savePendingDeposit(BILL_AMOUNT);
        approve(deposit.getId(), bill.getId());
        Long paymentId = singlePaymentId();

        postTransactionAction(deposit.getId(), "unmatch");

        ClubAuditEvent unmatched = singleEventOf(ClubAuditEventType.FEE_TX_UNMATCHED);
        assertThat(unmatched.getClubId()).isEqualTo(clubId);
        assertThat(unmatched.getBankTransactionId()).isEqualTo(deposit.getId());
        assertThat(unmatched.getFeeBillId()).isEqualTo(bill.getId());
        assertThat(unmatched.getActorUserId()).isEqualTo(leaderUserId);

        // 매칭취소는 엔티티에서 직접 납부를 정정하므로 정정 감사도 같은 트랜잭션에서 함께 남아야 한다.
        ClubAuditEvent voided = singleEventOf(ClubAuditEventType.FEE_PAYMENT_VOIDED);
        assertThat(voided.getFeeBillId()).isEqualTo(bill.getId());
        assertThat(voided.getPaymentId()).isEqualTo(paymentId);
        assertThat(voided.getBankTransactionId()).isEqualTo(deposit.getId());
        assertThat(voided.getReason()).isEqualTo("매칭취소");
        assertThat(detailOf(voided).get("amount").asLong()).isEqualTo(BILL_AMOUNT);
    }

    @Test
    @DisplayName("입금 거래를 무시하면 대상 청구가 없는 무시 감사가 1건 남는다")
    void ignoreIsAudited() {
        BankTransaction deposit = savePendingDeposit(BILL_AMOUNT);

        postTransactionAction(deposit.getId(), "ignore");

        ClubAuditEvent event = singleEventOf(ClubAuditEventType.FEE_TX_IGNORED);
        assertThat(event.getClubId()).isEqualTo(clubId);
        assertThat(event.getBankTransactionId()).isEqualTo(deposit.getId());
        assertThat(event.getFeeBillId()).as("무시는 매칭 대상 청구가 없다").isNull();
        assertThat(event.getActorUserId()).isEqualTo(leaderUserId);
    }

    /** 시나리오상 납부는 1건뿐이므로 그 id 를 돌려준다(감사 행의 payment_id 대조용). */
    private Long singlePaymentId() {
        List<Payment> payments = paymentRepository.findAll();
        assertThat(payments).hasSize(1);
        return payments.getFirst().getId();
    }
}

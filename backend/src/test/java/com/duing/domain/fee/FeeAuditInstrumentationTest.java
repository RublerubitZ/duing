package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
 * 회비 변이(정책·청구·계좌)가 club_audit_event 를 남기는지 검증한다.
 *
 * <p>detail 은 jsonb 라 키 순서가 보존되지 않으므로 문자열 비교 대신 파싱해 필드 단위로 단언한다.
 * 회차 라벨은 하드코딩한 절대 연월 대신 실행 시점의 당월을 쓴다(테스트 시한폭탄 방지).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FeeAuditInstrumentationTest extends IntegrationTestBase {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final String ACCOUNT_NUMBER = "352-1234-5678-90";
    private static final String ACCOUNT_HOLDER = "두잉동아리";

    @LocalServerPort
    int port;

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    ClubMemberRepository clubMemberRepository;
    @Autowired
    FeeBillRepository feeBillRepository;
    @Autowired
    ClubAuditEventRepository clubAuditEventRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private String leaderToken;
    private Long leaderUserId;
    private Long clubId;
    private String billingPeriod;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        // 회비 운영 행위는 ACTIVE 동아리만 허용되므로 승격한다(Club.create 기본은 PENDING_APPROVAL).
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);

        User leader = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.asMember(club, member));

        leaderUserId = leader.getId();
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        billingPeriod = YearMonth.now(ZoneId.of("Asia/Seoul")).toString(); // 당월 "yyyy-MM"
    }

    private Long createPolicy(long amount) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "월 회비");
        body.put("amount", amount);
        body.put("billingType", "MONTHLY");
        body.put("targetType", "ALL_MEMBERS");
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");
    }

    private void patchPolicy(Long policyId, Map<String, Object> body) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(body)
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policyId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    private Response generateBills(Long policyId) {
        Map<String, Object> body = new HashMap<>();
        body.put("billingPeriod", billingPeriod);
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policyId + "/bills");
    }

    private void cancelBill(Long billId) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + billId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    private void upsertAccount(String bank, String accountNumber, String accountHolder) {
        Map<String, Object> body = new HashMap<>();
        body.put("bank", bank);
        body.put("accountNumber", accountNumber);
        body.put("accountHolder", accountHolder);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(body)
                .when().put("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.OK.value());
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

    private Long firstBillIdOf(Long policyId) {
        return feeBillRepository.findAll().stream()
                .filter(bill -> bill.getFeePolicyId().equals(policyId))
                .map(FeeBill::getId)
                .findFirst().orElseThrow();
    }

    @Test
    @DisplayName("회비 정책을 생성하면 정책 id·행위자·금액이 담긴 생성 감사가 1건 남는다")
    void policyCreateIsAudited() {
        Long policyId = createPolicy(10000L);

        ClubAuditEvent event = singleEventOf(ClubAuditEventType.FEE_POLICY_CREATED);
        assertThat(event.getClubId()).isEqualTo(clubId);
        assertThat(event.getFeePolicyId()).isEqualTo(policyId);
        assertThat(event.getActorUserId()).isEqualTo(leaderUserId);
        JsonNode detail = detailOf(event);
        assertThat(detail.get("amount").asLong()).isEqualTo(10000L);
        assertThat(detail.get("billingType").asText()).isEqualTo("MONTHLY");
        assertThat(detail.get("targetType").asText()).isEqualTo("ALL_MEMBERS");
    }

    @Test
    @DisplayName("회비 정책 금액을 수정하면 변경 전·후 금액이 담긴 수정 감사가 남는다")
    void policyUpdateAuditKeepsAmountDiff() {
        Long policyId = createPolicy(10000L);

        patchPolicy(policyId, Map.of("amount", 30000));

        ClubAuditEvent event = singleEventOf(ClubAuditEventType.FEE_POLICY_UPDATED);
        assertThat(event.getFeePolicyId()).isEqualTo(policyId);
        assertThat(event.getActorUserId()).isEqualTo(leaderUserId);
        JsonNode amountDiff = detailOf(event).get("amount");
        assertThat(amountDiff.get("old").asLong()).isEqualTo(10000L);
        assertThat(amountDiff.get("new").asLong()).isEqualTo(30000L);
    }

    @Test
    @DisplayName("회비 정책을 삭제하면 삭제 감사가 정책 id·행위자와 함께 남는다")
    void policyDeleteIsAudited() {
        Long policyId = createPolicy(10000L);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policyId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        ClubAuditEvent event = singleEventOf(ClubAuditEventType.FEE_POLICY_DELETED);
        assertThat(event.getFeePolicyId()).isEqualTo(policyId);
        assertThat(event.getActorUserId()).isEqualTo(leaderUserId);
    }

    @Test
    @DisplayName("청구를 2명에게 발행해도 감사는 발행 1회당 1건이고, 멱등 재발행은 기록되지 않는다")
    void billIssueIsAuditedOncePerAction() {
        Long policyId = createPolicy(10000L);

        generateBills(policyId)
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(2));

        ClubAuditEvent event = singleEventOf(ClubAuditEventType.FEE_BILL_ISSUED);
        assertThat(event.getClubId()).isEqualTo(clubId);
        assertThat(event.getFeePolicyId()).isEqualTo(policyId);
        assertThat(event.getFeeBillId()).as("발행 감사는 개별 청구가 아닌 액션 단위라 청구 id 가 비어 있다").isNull();
        assertThat(event.getActorUserId()).isEqualTo(leaderUserId);
        JsonNode detail = detailOf(event);
        assertThat(detail.get("issuedCount").asInt()).isEqualTo(2);
        assertThat(detail.get("billingPeriod").asText()).isEqualTo(billingPeriod);

        // 같은 회차 재발행(created=0) — 새 청구가 없으므로 감사도 늘지 않는다.
        generateBills(policyId)
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(0));
        assertThat(eventsOf(ClubAuditEventType.FEE_BILL_ISSUED)).hasSize(1);
    }

    @Test
    @DisplayName("청구를 취소하면 청구 id·금액·직전 상태가 담긴 취소 감사가 남는다")
    void billCancelIsAudited() {
        Long policyId = createPolicy(10000L);
        generateBills(policyId).then().statusCode(HttpStatus.CREATED.value());
        Long billId = firstBillIdOf(policyId);

        cancelBill(billId);

        ClubAuditEvent event = singleEventOf(ClubAuditEventType.FEE_BILL_CANCELLED);
        assertThat(event.getClubId()).isEqualTo(clubId);
        assertThat(event.getFeePolicyId()).isEqualTo(policyId);
        assertThat(event.getFeeBillId()).isEqualTo(billId);
        assertThat(event.getActorUserId()).isEqualTo(leaderUserId);
        JsonNode detail = detailOf(event);
        assertThat(detail.get("amount").asLong()).isEqualTo(10000L);
        assertThat(detail.get("statusBefore").asText()).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("이미 취소된 청구를 다시 취소해도 취소 감사는 1건으로 유지된다")
    void billCancelAuditIsIdempotent() {
        Long policyId = createPolicy(10000L);
        generateBills(policyId).then().statusCode(HttpStatus.CREATED.value());
        Long billId = firstBillIdOf(policyId);

        cancelBill(billId);
        cancelBill(billId); // 멱등 no-op — 상태 전이가 없으므로 감사도 남기지 않는다.

        assertThat(eventsOf(ClubAuditEventType.FEE_BILL_CANCELLED)).hasSize(1);
    }

    @Test
    @DisplayName("회비 계좌는 등록·변경·삭제가 감사로 남고 값이 그대로인 재저장은 남지 않으며 계좌번호·예금주는 실리지 않는다")
    void accountLifecycleIsAuditedWithoutPii() {
        upsertAccount("KB", ACCOUNT_NUMBER, ACCOUNT_HOLDER);

        ClubAuditEvent registered = singleEventOf(ClubAuditEventType.FEE_ACCOUNT_REGISTERED);
        assertThat(registered.getClubId()).isEqualTo(clubId);
        assertThat(registered.getActorUserId()).isEqualTo(leaderUserId);
        assertThat(detailOf(registered).get("bank").asText()).isEqualTo("KB");

        // 같은 값으로 다시 저장하는 것은 계좌 교체가 아니다 — 여기서 변경 감사를 남기면
        // 폼을 두 번 저장한 것만으로 FA-08(계좌 빈번 교체, 임계 2회·CRITICAL)이 오탐한다.
        upsertAccount("KB", ACCOUNT_NUMBER, ACCOUNT_HOLDER);
        assertThat(eventsOf(ClubAuditEventType.FEE_ACCOUNT_UPDATED)).isEmpty();
        assertThat(eventsOf(ClubAuditEventType.FEE_ACCOUNT_REGISTERED)).hasSize(1);

        // 값이 실제로 달라지면 계좌가 갱신되므로 변경 감사가 남는다.
        upsertAccount("TOSS", "222-222-222", "새예금주");
        ClubAuditEvent updated = singleEventOf(ClubAuditEventType.FEE_ACCOUNT_UPDATED);
        assertThat(detailOf(updated).get("bank").asText()).isEqualTo("TOSS");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        ClubAuditEvent deleted = singleEventOf(ClubAuditEventType.FEE_ACCOUNT_DELETED);
        assertThat(deleted.getActorUserId()).isEqualTo(leaderUserId);

        // detail 은 은행 코드만 담는다 — 계좌번호·예금주는 어떤 감사 행에도 남지 않는다(스펙 §9).
        assertThat(clubAuditEventRepository.findAll()).allSatisfy(event -> {
            String detail = String.valueOf(event.getDetail()); // detail 이 null 인 행도 안전하게 검사
            assertThat(detail).doesNotContain(ACCOUNT_NUMBER).doesNotContain("222-222-222");
            assertThat(detail).doesNotContain(ACCOUNT_HOLDER).doesNotContain("새예금주");
        });
    }
}

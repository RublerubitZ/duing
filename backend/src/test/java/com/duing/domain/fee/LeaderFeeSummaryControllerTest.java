package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

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
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import({TestcontainersConfiguration.class, LeaderFeeSummaryControllerTest.FixedClockConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderFeeSummaryControllerTest extends IntegrationTestBase {

    // '오늘'을 2026-06-15(Asia/Seoul)로 고정해 마감 경과(OVERDUE) 판정을 결정적으로 만든다.
    static final LocalDate TODAY = LocalDate.of(2026, 6, 15);
    static final String FUTURE_PERIOD = "2026-07"; // 마감 2026-07-31 > 오늘 → 미납은 PENDING 유지
    static final String PAST_PERIOD = "2026-05";   // 마감 2026-05-31 < 오늘 → 미납은 부분납부여도 OVERDUE

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

    @LocalServerPort
    int port;

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    ClubMemberRepository clubMemberRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    FeePolicyRepository feePolicyRepository;
    @Autowired
    FeeBillRepository feeBillRepository;
    @Autowired
    PaymentRepository paymentRepository;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private String leaderToken;
    private String memberToken;
    private Long clubId;
    private Long policyId;
    private Long memberUserId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 수납 현황 집계(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);

        User leader = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        memberUserId = member.getId();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());

        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        policyId = policy.getId();
    }

    /** clubId·policyId 로 "YYYY-MM" 회차 청구 1건을 발행한다(마감일=회차 말일). billingStartDate 가 회차마다 달라 멱등 인덱스가 분리된다. */
    private FeeBill saveBill(Long ownerUserId, long amount, String period) {
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return feeBillRepository.save(
                FeeBill.issue(clubId, ownerUserId, policyId, amount, period, start, end, end));
    }

    /** 매니저로 납부를 기록해 청구 상태가 합계에 따라 재계산되게 한다. */
    private Response recordPayment(Long billId, long amount, String paidAt) {
        Map<String, Object> body = new HashMap<>();
        body.put("amount", amount);
        body.put("method", "CASH");
        body.put("paidAt", paidAt);
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + billId + "/payments");
    }

    private Long recordPaymentId(Long billId, long amount, String paidAt) {
        Response response = recordPayment(billId, amount, paidAt);
        response.then().statusCode(HttpStatus.CREATED.value());
        return response.jsonPath().getLong("data");
    }

    private Response getSummaryAs(String token, String query) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills/summary" + query);
    }

    @Test
    @DisplayName("완납·부분납부·미납 청구가 섞여 있으면 총 청구액·납부액·미수금·수납률·청구 건수·상태별 건수가 정확히 집계된다")
    void aggregatesMixedStatusesCorrectly() {
        // 완납 30000(전액 납부) / 부분납부 50000(20000 납부) / 미납 20000(미래 마감이라 PENDING). 합계가 자명하지 않도록 금액을 달리한다.
        FeeBill paidBill = saveBill(memberUserId, 30000L, FUTURE_PERIOD);
        FeeBill partialBill = saveBill(memberUserId, 50000L, "2026-08");
        saveBill(memberUserId, 20000L, "2026-09");

        recordPaymentId(paidBill.getId(), 30000L, "2026-06-10");   // → PAID
        recordPaymentId(partialBill.getId(), 20000L, "2026-06-10"); // → PARTIAL_PAID

        Response response = getSummaryAs(leaderToken, "");
        response.then().statusCode(HttpStatus.OK.value());

        // totalBilled = 30000 + 50000 + 20000 = 100000 (납부 조인 fan-out 으로 중복 합산되지 않아야 한다)
        assertThat(response.jsonPath().getLong("data.totalBilled")).isEqualTo(100000L);
        // totalPaid = 30000 + 20000 = 50000
        assertThat(response.jsonPath().getLong("data.totalPaid")).isEqualTo(50000L);
        // outstanding = 100000 - 50000 = 50000
        assertThat(response.jsonPath().getLong("data.outstanding")).isEqualTo(50000L);
        // collectionRate = 50000 / 100000 = 50.0%
        assertThat(response.jsonPath().getDouble("data.collectionRate")).isEqualTo(50.0);
        assertThat(response.jsonPath().getLong("data.billCount")).isEqualTo(3L);
        assertThat(response.jsonPath().getLong("data.paidCount")).isEqualTo(1L);
        assertThat(response.jsonPath().getLong("data.partialPaidCount")).isEqualTo(1L);
        assertThat(response.jsonPath().getLong("data.pendingCount")).isEqualTo(1L);
        assertThat(response.jsonPath().getLong("data.overdueCount")).isZero();
    }

    @Test
    @DisplayName("수납률은 나누어떨어지지 않을 때 소수점 1자리로 반올림되어 집계된다")
    void collectionRateRoundedToOneDecimal() {
        // 청구 30000 에 10000 납부 → 33.333...% → 33.3%
        FeeBill bill = saveBill(memberUserId, 30000L, FUTURE_PERIOD);
        recordPaymentId(bill.getId(), 10000L, "2026-06-10");

        Response response = getSummaryAs(leaderToken, "");
        response.then().statusCode(HttpStatus.OK.value());

        assertThat(response.jsonPath().getDouble("data.collectionRate")).isEqualTo(33.3, within(1e-9));
    }

    @Test
    @DisplayName("정정(VOID)된 납부는 총 납부액·수납률 집계에서 제외된다")
    void voidedPaymentExcludedFromTotalPaid() {
        FeeBill bill = saveBill(memberUserId, 40000L, FUTURE_PERIOD);
        // 활성 납부 10000 + VOID 될 납부 30000 을 기록한 뒤 30000 을 정정한다.
        recordPaymentId(bill.getId(), 10000L, "2026-06-10");
        Long voidTargetId = recordPaymentId(bill.getId(), 30000L, "2026-06-11");
        Map<String, Object> voidBody = new HashMap<>();
        voidBody.put("reason", "오입금 정정");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(voidBody)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + bill.getId()
                        + "/payments/" + voidTargetId + "/void")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        Response response = getSummaryAs(leaderToken, "");
        response.then().statusCode(HttpStatus.OK.value());

        // VOID 30000 제외 → totalPaid = 10000, 미수금 30000, 수납률 25.0%
        assertThat(response.jsonPath().getLong("data.totalBilled")).isEqualTo(40000L);
        assertThat(response.jsonPath().getLong("data.totalPaid")).isEqualTo(10000L);
        assertThat(response.jsonPath().getLong("data.outstanding")).isEqualTo(30000L);
        assertThat(response.jsonPath().getDouble("data.collectionRate")).isEqualTo(25.0);
    }

    @Test
    @DisplayName("취소(CANCELLED)된 청구는 총 청구액·건수·상태별 건수 등 모든 집계에서 제외된다")
    void cancelledBillExcludedFromAllAggregates() {
        saveBill(memberUserId, 20000L, FUTURE_PERIOD); // 유효 PENDING 1건
        FeeBill cancelledBill = saveBill(memberUserId, 70000L, "2026-08");
        FeeBill reloaded = feeBillRepository.findById(cancelledBill.getId()).orElseThrow();
        reloaded.cancel();
        feeBillRepository.saveAndFlush(reloaded);

        Response response = getSummaryAs(leaderToken, "");
        response.then().statusCode(HttpStatus.OK.value());

        // CANCELLED 70000 은 totalBilled·billCount 에서 모두 빠진다 → 20000, 1건
        assertThat(response.jsonPath().getLong("data.totalBilled")).isEqualTo(20000L);
        assertThat(response.jsonPath().getLong("data.billCount")).isEqualTo(1L);
        assertThat(response.jsonPath().getLong("data.pendingCount")).isEqualTo(1L);
    }

    @Test
    @DisplayName("billingPeriod 필터를 주면 해당 회차 청구만 집계되고 다른 회차는 제외된다")
    void billingPeriodFilterScopesAggregates() {
        saveBill(memberUserId, 20000L, FUTURE_PERIOD); // 2026-07
        saveBill(memberUserId, 90000L, "2026-08");     // 다른 회차

        Response response = getSummaryAs(leaderToken, "?billingPeriod=" + FUTURE_PERIOD);
        response.then().statusCode(HttpStatus.OK.value());

        // 2026-07 회차 1건(20000)만 집계, 2026-08 의 90000 은 제외
        assertThat(response.jsonPath().getLong("data.totalBilled")).isEqualTo(20000L);
        assertThat(response.jsonPath().getLong("data.billCount")).isEqualTo(1L);
    }

    @Test
    @DisplayName("policyId 필터를 주면 해당 정책 청구만 집계되고 다른 정책 청구는 제외된다")
    void policyIdFilterScopesAggregates() {
        saveBill(memberUserId, 20000L, FUTURE_PERIOD); // 기본 정책(policyId)

        // 같은 동아리의 다른 정책으로 청구를 추가한다(필터 없이는 함께 집계되어야 한다).
        FeePolicy otherPolicy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 80000L));
        LocalDate otherStart = LocalDate.parse(FUTURE_PERIOD + "-01");
        LocalDate otherEnd = otherStart.withDayOfMonth(otherStart.lengthOfMonth());
        feeBillRepository.save(FeeBill.issue(
                clubId, memberUserId, otherPolicy.getId(), 80000L, FUTURE_PERIOD, otherStart, otherEnd, otherEnd));

        // 필터 없이는 두 정책 모두 집계(20000 + 80000 = 100000).
        Response unfiltered = getSummaryAs(leaderToken, "");
        unfiltered.then().statusCode(HttpStatus.OK.value());
        assertThat(unfiltered.jsonPath().getLong("data.totalBilled")).isEqualTo(100000L);
        assertThat(unfiltered.jsonPath().getLong("data.billCount")).isEqualTo(2L);

        // policyId 필터로 기본 정책 청구(20000)만 남고 다른 정책의 80000 은 제외된다.
        Response filtered = getSummaryAs(leaderToken, "?policyId=" + policyId);
        filtered.then().statusCode(HttpStatus.OK.value());
        assertThat(filtered.jsonPath().getLong("data.totalBilled")).isEqualTo(20000L);
        assertThat(filtered.jsonPath().getLong("data.billCount")).isEqualTo(1L);
    }

    @Test
    @DisplayName("마감이 지난 미납 청구는 OVERDUE 로 집계되고 별도 회차 필터에서 제외할 수 있다")
    void overdueBillCountedAndFilterable() {
        // 과거 마감 청구에 부분 납부 → 마감 경과라 OVERDUE 로 재계산된다(LeaderPaymentControllerTest 와 동일 패턴).
        FeeBill overdueBill = saveBill(memberUserId, 30000L, PAST_PERIOD);
        recordPaymentId(overdueBill.getId(), 5000L, "2026-06-10");
        assertThat(feeBillRepository.findById(overdueBill.getId()).orElseThrow().getStatus())
                .isEqualTo(FeeStatus.OVERDUE);

        Response all = getSummaryAs(leaderToken, "");
        all.then().statusCode(HttpStatus.OK.value());
        assertThat(all.jsonPath().getLong("data.overdueCount")).isEqualTo(1L);
        assertThat(all.jsonPath().getLong("data.totalPaid")).isEqualTo(5000L);

        // 미래 회차로 필터하면 OVERDUE 청구는 제외된다.
        Response filtered = getSummaryAs(leaderToken, "?billingPeriod=" + FUTURE_PERIOD);
        filtered.then().statusCode(HttpStatus.OK.value());
        assertThat(filtered.jsonPath().getLong("data.billCount")).isZero();
        assertThat(filtered.jsonPath().getLong("data.overdueCount")).isZero();
    }

    @Test
    @DisplayName("운영진이 아닌 일반 멤버가 수납 현황을 조회하면 403 을 반환한다")
    void nonManagerForbidden() {
        saveBill(memberUserId, 10000L, FUTURE_PERIOD);

        getSummaryAs(memberToken, "")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("청구가 없으면 모든 집계값이 0으로 반환된다")
    void allZerosWhenNoActiveBills() {
        // 유일한 청구를 취소(CANCELLED)해 유효 청구가 0건이 되게 한다 → summarizeBills 의 null 프로젝션 coalesce 경로를 탄다.
        FeeBill onlyBill = saveBill(memberUserId, 50000L, FUTURE_PERIOD);
        FeeBill reloaded = feeBillRepository.findById(onlyBill.getId()).orElseThrow();
        reloaded.cancel();
        feeBillRepository.saveAndFlush(reloaded);

        Response response = getSummaryAs(leaderToken, "");
        response.then().statusCode(HttpStatus.OK.value());

        assertThat(response.jsonPath().getLong("data.totalBilled")).isZero();
        assertThat(response.jsonPath().getLong("data.totalPaid")).isZero();
        assertThat(response.jsonPath().getLong("data.outstanding")).isZero();
        assertThat(response.jsonPath().getDouble("data.collectionRate")).isEqualTo(0.0);
        assertThat(response.jsonPath().getLong("data.billCount")).isZero();
        assertThat(response.jsonPath().getLong("data.pendingCount")).isZero();
        assertThat(response.jsonPath().getLong("data.partialPaidCount")).isZero();
        assertThat(response.jsonPath().getLong("data.overdueCount")).isZero();
        assertThat(response.jsonPath().getLong("data.paidCount")).isZero();
    }

    @Test
    @DisplayName("인증 없이 수납 현황을 조회하면 401 을 반환한다")
    void unauthenticatedRejected() {
        RestAssured.given()
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills/summary")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}

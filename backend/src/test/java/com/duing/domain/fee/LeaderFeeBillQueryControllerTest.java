package com.duing.domain.fee;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeeBillFixture;
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
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderFeeBillQueryControllerTest extends IntegrationTestBase {

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
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private Long clubId;
    private Long policyId;
    private User memberUser;
    private String leaderToken;
    private String memberToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 청구 현황 조회(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);

        User leader = userRepository.save(UserFixture.unique());
        memberUser = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, memberUser, ClubMemberRole.MEMBER));

        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        policyId = policy.getId();

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
    }

    private Long saveUserId() {
        return userRepository.save(UserFixture.unique()).getId();
    }

    private FeeBill saveBill(Long clubIdValue, Long userId, String period, FeeStatus status) {
        return feeBillRepository.save(FeeBillFixture.withStatus(clubIdValue, userId, policyId, period, status));
    }

    /** billId 청구에 지정 상태의 납부 1건을 직접 적재한다(VOIDED 는 합계에서 제외돼야 한다). */
    private void recordPayment(Long billId, long amount, boolean voided) {
        Payment payment = Payment.record(
                billId, amount, PaymentMethod.CASH, LocalDateTime.of(2026, 6, 10, 0, 0),
                memberUser.getId(), null);
        if (voided) {
            payment.voidPayment(memberUser.getId(), "정정", LocalDateTime.of(2026, 6, 11, 0, 0));
        }
        paymentRepository.save(payment);
    }

    @Test
    @DisplayName("운영진은 동아리 청구 현황을 페이지로 조회한다")
    void managerListsBills() {
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(2))
                .body("data.totalElements", equalTo(2));
    }

    @Test
    @DisplayName("청구 현황은 status 필터로 좁혀진다")
    void filterByStatus() {
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.CANCELLED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("status", "PENDING")
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].status", equalTo("PENDING"));
    }

    @Test
    @DisplayName("청구 현황은 billingPeriod 필터로 좁혀진다")
    void filterByBillingPeriod() {
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, saveUserId(), "2026-08", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("billingPeriod", "2026-07")
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].billingPeriod", equalTo("2026-07"));
    }

    @Test
    @DisplayName("청구 현황은 userId 필터로 특정 회원만 조회한다")
    void filterByUserId() {
        saveBill(clubId, memberUser.getId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("userId", memberUser.getId())
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content.userId", everyItem(equalTo(memberUser.getId().intValue())));
    }

    @Test
    @DisplayName("청구 현황은 page/size 로 페이지네이션된다")
    void paginates() {
        for (int index = 0; index < 25; index++) {
            saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);
        }

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("page", 0)
                .queryParam("size", 10)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(10))
                .body("data.totalElements", equalTo(25))
                .body("data.totalPages", equalTo(3))
                .body("data.page", equalTo(0))
                .body("data.size", equalTo(10))
                .body("data.hasNext", equalTo(true));
    }

    @Test
    @DisplayName("청구 현황은 청구별 ACTIVE 납부 합계(paidAmount)와 남은 금액(remainingAmount)을 담고 VOIDED 납부는 제외한다")
    void carriesPaidAndRemainingAmountExcludingVoided() {
        // 청구액 10000 에 ACTIVE 4000 + VOIDED 3000 → paidAmount=4000(VOID 제외), remainingAmount=6000
        FeeBill partiallyPaid = saveBill(clubId, memberUser.getId(), "2026-07", FeeStatus.PENDING);
        recordPayment(partiallyPaid.getId(), 4000L, false);
        recordPayment(partiallyPaid.getId(), 3000L, true);
        // 납부가 없는 청구는 paidAmount=0, remainingAmount=청구액(10000)
        saveBill(clubId, saveUserId(), "2026-08", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(2))
                .body("data.content.find { it.billingPeriod == '2026-07' }.paidAmount", equalTo(4000))
                .body("data.content.find { it.billingPeriod == '2026-07' }.remainingAmount", equalTo(6000))
                .body("data.content.find { it.billingPeriod == '2026-08' }.paidAmount", equalTo(0))
                .body("data.content.find { it.billingPeriod == '2026-08' }.remainingAmount", equalTo(10000));
    }

    @Test
    @DisplayName("연체 전이 배치가 실행되지 않아 저장 상태가 납부대기여도, 마감이 지난 청구의 표기 상태는 연체다")
    void displayStatusIsOverdueForPastDueBillEvenBeforeBatchTransition() {
        // 픽스처가 회차 말일을 마감으로 파생하므로 마감은 2026-05-31 — 지나간 절대 날짜라 실행 시점과 무관하게 항상 경과다.
        // 연체 전이 배치는 돌지 않아 저장 status 는 PENDING 그대로 남는다.
        saveBill(clubId, memberUser.getId(), "2026-05", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                // 저장 축은 배치가 찍은 값 그대로, 표기 축만 조회 시점 기준으로 연체를 드러낸다.
                .body("data.content[0].status", equalTo("PENDING"))
                .body("data.content[0].displayStatus", equalTo("OVERDUE"));
    }

    @Test
    @DisplayName("일반 멤버가 청구 현황을 조회하면 403 을 반환한다")
    void memberForbidden() {
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 청구 현황을 조회하면 401 을 반환한다")
    void unauthenticatedRejected() {
        RestAssured.given()
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}

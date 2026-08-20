package com.duing.domain.fee;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeeBillFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
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
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
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

@Import({TestcontainersConfiguration.class, MyFeeControllerTest.FixedClockConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyFeeControllerTest extends IntegrationTestBase {

    // '오늘'을 2026-06-15(Asia/Seoul)로 고정해 표기 상태(displayStatus)의 마감 경과 판정을 결정적으로 만든다.
    static final LocalDate TODAY = LocalDate.of(2026, 6, 15);
    // 마감 2026-05-31 < 오늘 → 미납이면 표기는 OVERDUE(픽스처가 회차 말일을 마감으로 파생한다).
    static final String PAST_DUE_PERIOD = "2026-05";

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
    FeePolicyRepository feePolicyRepository;
    @Autowired
    FeeBillRepository feeBillRepository;
    @Autowired
    PaymentRepository paymentRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;

    private Long clubId;
    private Long otherClubId;
    private Long policyId;
    private Long otherPolicyId;
    private User userA;
    private User userB;
    private String tokenA;
    private String tokenB;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        Club otherClub = clubRepository.save(ClubFixture.academic("동아리B"));
        clubId = club.getId();
        otherClubId = otherClub.getId();

        userA = userRepository.save(UserFixture.unique());
        userB = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asMember(club, userA));
        clubMemberRepository.save(ClubMember.asMember(club, userB));

        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        FeePolicy otherPolicy = feePolicyRepository.save(
                FeePolicyFixture.of(otherClubId, BillingType.MONTHLY, 20000L));
        policyId = policy.getId();
        otherPolicyId = otherPolicy.getId();

        tokenA = jwtTokenProvider.createToken(userA.getId(), userA.getRole().name());
        tokenB = jwtTokenProvider.createToken(userB.getId(), userB.getRole().name());
    }

    private FeeBill saveBill(Long clubIdValue, Long policyIdValue, Long userId, String period, FeeStatus status) {
        return feeBillRepository.save(FeeBillFixture.withStatus(clubIdValue, userId, policyIdValue, period, status));
    }

    // 공유 픽스처(withStatus)는 CANCELLED 만 실제 전이하므로, 저장 status 를 목표 상태로 직접 전이해 만든다.
    private FeeBill saveBillWithStoredStatus(Long clubIdValue, Long policyIdValue, Long userId,
                                             String period, FeeStatus status) {
        FeeBill bill = saveBill(clubIdValue, policyIdValue, userId, period, FeeStatus.PENDING);
        bill.updateStatus(status);
        return feeBillRepository.save(bill);
    }

    /** billId 청구에 지정 상태의 납부 1건을 직접 적재한다(VOIDED 는 합계에서 제외돼야 한다). */
    private void recordPayment(Long billId, long amount, boolean voided) {
        Payment payment = Payment.record(
                billId, amount, PaymentMethod.CASH, LocalDateTime.of(2026, 6, 10, 0, 0),
                userA.getId(), null);
        if (voided) {
            payment.voidPayment(userA.getId(), "정정", LocalDateTime.of(2026, 6, 11, 0, 0));
        }
        paymentRepository.save(payment);
    }

    @Test
    @DisplayName("내 회비 조회는 본인 user_id 의 청구만 반환한다")
    void myFeesOnlyOwn() {
        // 회원별로 회차 라벨을 구분(A=07/08, B=09)해 응답에 타인 청구가 섞이지 않음을 라벨로 검증한다.
        saveBill(clubId, policyId, userA.getId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, policyId, userA.getId(), "2026-08", FeeStatus.PENDING);
        // 다른 회원(B) 청구는 A 조회에서 제외돼야 한다
        saveBill(clubId, policyId, userB.getId(), "2026-09", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                // A 의 회차만 보이고 B 의 "2026-09" 는 절대 포함되지 않는다
                .body("data.billingPeriod", everyItem(not(equalTo("2026-09"))))
                .body("data.billingPeriod", containsInAnyOrder("2026-07", "2026-08"));
    }

    @Test
    @DisplayName("다른 회원의 청구는 본인 조회에 절대 노출되지 않는다")
    void otherMembersBillsExcluded() {
        saveBill(clubId, policyId, userA.getId(), "2026-07", FeeStatus.PENDING);  // A 의 청구
        saveBill(clubId, policyId, userB.getId(), "2026-08", FeeStatus.PENDING);  // B 의 청구
        saveBill(clubId, policyId, userB.getId(), "2026-09", FeeStatus.PENDING);  // B 의 청구

        // B 토큰으로 조회하면 B 의 2건만, A 의 "2026-07" 은 보이지 않는다
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenB)
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data.billingPeriod", everyItem(not(equalTo("2026-07"))))
                .body("data.billingPeriod", containsInAnyOrder("2026-08", "2026-09"));
    }

    @Test
    @DisplayName("내 회비 조회는 clubId 옵션 필터로 해당 동아리 청구만 반환한다")
    void filterByClubId() {
        saveBill(clubId, policyId, userA.getId(), "2026-07", FeeStatus.PENDING);
        saveBill(otherClubId, otherPolicyId, userA.getId(), "2026-07", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .queryParam("clubId", clubId)
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].clubId", equalTo(clubId.intValue()));
    }

    @Test
    @DisplayName("내 회비 조회는 status 옵션 필터로 해당 상태 청구만 반환한다")
    void filterByStatus() {
        saveBill(clubId, policyId, userA.getId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, policyId, userA.getId(), "2026-08", FeeStatus.CANCELLED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .queryParam("status", "PENDING")
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].status", equalTo("PENDING"));
    }

    @Test
    @DisplayName("status 필터는 표기 축이라, 저장 상태가 납부대기여도 마감이 지난 청구는 OVERDUE 로 걸리고 PENDING 에서는 빠진다")
    void statusFilterFollowsDisplayAxis() {
        // 마감(2026-05-31)이 오늘(2026-06-15)보다 앞서지만 연체 전이 배치 전이라 저장 status 는 PENDING 인 청구
        saveBill(clubId, policyId, userA.getId(), PAST_DUE_PERIOD, FeeStatus.PENDING);
        // 마감(2026-07-31)이 남은 청구 — 저장·표기 모두 PENDING
        saveBill(clubId, policyId, userA.getId(), "2026-07", FeeStatus.PENDING);

        // OVERDUE 필터에는 마감이 지난 청구만 잡힌다(저장 status 는 여전히 PENDING).
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .queryParam("status", "OVERDUE")
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].billingPeriod", equalTo(PAST_DUE_PERIOD))
                .body("data[0].status", equalTo("PENDING"))
                .body("data[0].displayStatus", equalTo("OVERDUE"));

        // PENDING 필터에서는 마감이 지난 청구가 빠지고 마감 전 청구만 남는다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .queryParam("status", "PENDING")
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].billingPeriod", equalTo("2026-07"))
                .body("data[0].displayStatus", equalTo("PENDING"));
    }

    @Test
    @DisplayName("내 회비 응답은 청구별 납부 합계(paidAmount)와 남은 금액(remainingAmount)을 담고 VOIDED 납부는 제외한다")
    void carriesPaidAndRemainingAmount() {
        // 청구액 10000 에 ACTIVE 4000 + VOIDED 3000 → paidAmount=4000(VOID 제외), remainingAmount=6000
        FeeBill partiallyPaid = saveBill(clubId, policyId, userA.getId(), "2026-07", FeeStatus.PENDING);
        recordPayment(partiallyPaid.getId(), 4000L, false);
        recordPayment(partiallyPaid.getId(), 3000L, true);
        // 납부가 없는 청구는 paidAmount=0, remainingAmount=청구액(10000)
        saveBill(clubId, policyId, userA.getId(), "2026-08", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data.find { it.billingPeriod == '2026-07' }.paidAmount", equalTo(4000))
                .body("data.find { it.billingPeriod == '2026-07' }.remainingAmount", equalTo(6000))
                .body("data.find { it.billingPeriod == '2026-08' }.paidAmount", equalTo(0))
                .body("data.find { it.billingPeriod == '2026-08' }.remainingAmount", equalTo(10000));
    }

    @Test
    @DisplayName("연체 전이 배치가 실행되지 않아 저장 상태가 납부대기여도, 마감이 지났으면 표기 상태는 연체다")
    void displayStatusIsOverdueForPastDueBillEvenBeforeBatchTransition() {
        // 마감(2026-05-31)이 오늘(2026-06-15)보다 앞서지만 연체 전이 배치가 돌지 않아 저장 status 는 PENDING 그대로다.
        saveBill(clubId, policyId, userA.getId(), PAST_DUE_PERIOD, FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                // 저장 축은 배치가 찍은 값 그대로, 표기 축만 조회 시점 기준으로 연체를 드러낸다.
                .body("data[0].status", equalTo("PENDING"))
                .body("data[0].displayStatus", equalTo("OVERDUE"));
    }

    @Test
    @DisplayName("저장 상태가 연체여도 완납된 청구의 표기 상태는 납부완료다")
    void displayStatusIsPaidForFullyPaidBillEvenIfStoredOverdue() {
        // 연체로 전이된 뒤 전액(10000) 납부된 청구 — 재계산이 아직 반영되지 않아 저장 status 는 OVERDUE 다.
        FeeBill overdueBill = saveBillWithStoredStatus(
                clubId, policyId, userA.getId(), PAST_DUE_PERIOD, FeeStatus.OVERDUE);
        recordPayment(overdueBill.getId(), 10000L, false);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].status", equalTo("OVERDUE"))
                // 완납은 마감 경과보다 우선한다 — 표기는 PAID.
                .body("data[0].displayStatus", equalTo("PAID"));
    }

    @Test
    @DisplayName("인증 없이 내 회비를 조회하면 401 을 반환한다")
    void unauthenticatedRejected() {
        RestAssured.given()
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}

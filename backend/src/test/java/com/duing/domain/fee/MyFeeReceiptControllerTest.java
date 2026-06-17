package com.duing.domain.fee;

import static org.hamcrest.Matchers.equalTo;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyFeeReceiptControllerTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired PaymentRepository paymentRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private Long clubId;
    private Long policyId;
    private User userA;
    private User userB;
    private String tokenA;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        userA = userRepository.save(UserFixture.unique());
        userB = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asMember(club, userA));
        clubMemberRepository.save(ClubMember.asMember(club, userB));
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        policyId = policy.getId();
        tokenA = jwtTokenProvider.createToken(userA.getId(), userA.getRole().name());
    }

    private FeeBill saveBill(Long userId, String period, FeeStatus status) {
        return feeBillRepository.save(FeeBillFixture.withStatus(clubId, userId, policyId, period, status));
    }

    private void recordPayment(Long billId, long amount, boolean voided) {
        Payment payment = Payment.record(billId, amount, PaymentMethod.CASH,
                LocalDateTime.of(2026, 7, 10, 0, 0), userA.getId(), "현금 납부");
        if (voided) {
            payment.voidPayment(userA.getId(), "정정", LocalDateTime.of(2026, 7, 11, 0, 0));
        }
        paymentRepository.save(payment);
    }

    @Test
    @DisplayName("ACTIVE 납부가 있는 청구는 영수증 번호·납부합계·건수·내역을 정확히 반환한다")
    void receiptReturnsAccurateData() {
        FeeBill bill = saveBill(userA.getId(), "2026-07", FeeStatus.PARTIAL_PAID);
        recordPayment(bill.getId(), 4000L, false);
        recordPayment(bill.getId(), 3000L, false);
        recordPayment(bill.getId(), 9999L, true); // VOIDED — 제외돼야 한다

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.receiptNumber", equalTo("RCP-202607-" + bill.getId()))
                .body("data.amount", equalTo(10000))
                .body("data.paidTotal", equalTo(7000))
                .body("data.remaining", equalTo(3000))
                .body("data.paymentCount", equalTo(2))
                .body("data.payments", hasSize(2));
    }

    @Test
    @DisplayName("부분 납부가 있는 OVERDUE 청구도 영수증을 발급한다")
    void overdueWithPaymentIssuesReceipt() {
        FeeBill bill = saveBill(userA.getId(), "2026-07", FeeStatus.OVERDUE);
        recordPayment(bill.getId(), 5000L, false);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.paidTotal", equalTo(5000));
    }

    @Test
    @DisplayName("ACTIVE 납부가 0건인 청구는 404 를 반환한다")
    void noActivePaymentReturns404() {
        FeeBill bill = saveBill(userA.getId(), "2026-07", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("취소된 청구는 ACTIVE 납부가 있어도 404 를 반환한다")
    void cancelledWithPaymentReturns404() {
        FeeBill bill = saveBill(userA.getId(), "2026-07", FeeStatus.CANCELLED);
        recordPayment(bill.getId(), 5000L, false);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("타인 청구의 영수증은 404 를 반환한다(존재 비노출)")
    void otherUsersBillReturns404() {
        FeeBill billB = saveBill(userB.getId(), "2026-07", FeeStatus.PAID);
        recordPayment(billB.getId(), 10000L, false);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees/" + billB.getId() + "/receipt")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }
}

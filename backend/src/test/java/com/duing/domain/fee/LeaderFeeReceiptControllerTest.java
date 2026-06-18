package com.duing.domain.fee;

import static org.hamcrest.Matchers.equalTo;

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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderFeeReceiptControllerTest extends IntegrationTestBase {

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
    private Long otherClubId;
    private Long policyId;
    private Long otherPolicyId;
    private Long memberUserId;
    private String leaderToken;
    private String memberToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        Club otherClub = clubRepository.save(ClubFixture.academic("동아리B"));
        clubId = club.getId();
        otherClubId = otherClub.getId();

        User leader = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        memberUserId = member.getId();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        FeePolicy otherPolicy = feePolicyRepository.save(FeePolicyFixture.of(otherClubId, BillingType.MONTHLY, 10000L));
        policyId = policy.getId();
        otherPolicyId = otherPolicy.getId();

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
    }

    private FeeBill savePaidBill(Long clubIdValue, Long policyIdValue) {
        FeeBill bill = feeBillRepository.save(
                FeeBillFixture.withStatus(clubIdValue, memberUserId, policyIdValue, "2026-07", FeeStatus.PAID));
        paymentRepository.save(Payment.record(bill.getId(), 10000L, PaymentMethod.TRANSFER,
                LocalDateTime.of(2026, 7, 10, 0, 0), memberUserId, null));
        return bill;
    }

    @Test
    @DisplayName("총무는 동아리 청구의 영수증을 조회할 수 있다")
    void leaderReadsReceipt() {
        FeeBill bill = savePaidBill(clubId, policyId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.receiptNumber", equalTo("RCP-202607-" + bill.getId()))
                .body("data.paidTotal", equalTo(10000));
    }

    @Test
    @DisplayName("타 동아리 청구의 영수증은 404 를 반환한다")
    void otherClubBillReturns404() {
        FeeBill otherBill = savePaidBill(otherClubId, otherPolicyId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + otherBill.getId() + "/receipt")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("운영진이 아닌 회원이 총무 영수증 API 를 호출하면 403 을 반환한다")
    void nonManagerReturns403() {
        FeeBill bill = savePaidBill(clubId, policyId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }
}

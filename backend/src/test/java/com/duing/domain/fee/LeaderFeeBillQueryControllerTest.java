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
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
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
    JwtTokenProvider jwtTokenProvider;

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

    private void saveBill(Long clubIdValue, Long userId, String period, FeeStatus status) {
        feeBillRepository.save(FeeBillFixture.withStatus(clubIdValue, userId, policyId, period, status));
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

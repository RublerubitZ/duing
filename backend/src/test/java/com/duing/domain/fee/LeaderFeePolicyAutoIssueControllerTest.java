package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderFeePolicyAutoIssueControllerTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private Long clubId;
    private String leaderToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
    }

    @Test
    @DisplayName("MONTHLY 정책을 자동발행 켜서 생성하면 발행일·마감일이 저장된다")
    void createMonthlyWithAutoIssue() {
        Integer id = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("name", "월 회비", "amount", 10000, "billingType", "MONTHLY",
                        "targetType", "ALL_MEMBERS",
                        "autoIssue", true, "issueDay", 5, "dueDay", 20))
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data");

        FeePolicy saved = feePolicyRepository.findById(id.longValue()).orElseThrow();
        assertThat(saved.isAutoIssue()).isTrue();
        assertThat(saved.getIssueDay()).isEqualTo(5);
        assertThat(saved.getDueDay()).isEqualTo(20);
    }

    @Test
    @DisplayName("비-MONTHLY 정책을 자동발행 켜서 생성하면 400 을 반환한다")
    void createNonMonthlyAutoIssueRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("name", "학기 회비", "amount", 50000, "billingType", "SEMESTER",
                        "targetType", "ALL_MEMBERS",
                        "autoIssue", true, "issueDay", 5, "dueDay", 20))
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("마감일이 발행일보다 앞서면 400 을 반환한다")
    void dueBeforeIssueRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("name", "월 회비", "amount", 10000, "billingType", "MONTHLY",
                        "targetType", "ALL_MEMBERS",
                        "autoIssue", true, "issueDay", 20, "dueDay", 5))
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("기존 MONTHLY 정책을 수정으로 자동발행 켤 수 있다")
    void updateEnablesAutoIssue() {
        FeePolicy policy = feePolicyRepository.save(
                com.duing.common.fixture.FeePolicyFixture.monthly(clubId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("autoIssue", true, "issueDay", 3, "dueDay", 25))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policy.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        FeePolicy updated = feePolicyRepository.findById(policy.getId()).orElseThrow();
        assertThat(updated.isAutoIssue()).isTrue();
        assertThat(updated.getIssueDay()).isEqualTo(3);
        assertThat(updated.getDueDay()).isEqualTo(25);
    }

    @Test
    @DisplayName("자동발행 켜진 정책의 회비 유형을 MONTHLY 가 아닌 값으로 바꾸면 400 을 반환한다")
    void changeBillingTypeWhileAutoIssueEnabledRejected() {
        FeePolicy policy = feePolicyRepository.save(
                com.duing.common.fixture.FeePolicyFixture.autoIssue(clubId, 5, 20));

        // autoIssue 는 미전송(null)인데 billingType 만 SEMESTER 로 바꾸려는 요청 — DB CHECK 위반 전에 400 으로 막아야 한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("billingType", "SEMESTER"))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policy.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        FeePolicy unchanged = feePolicyRepository.findById(policy.getId()).orElseThrow();
        assertThat(unchanged.isAutoIssue()).isTrue();
        assertThat(unchanged.getIssueDay()).isEqualTo(5);
    }

    @Test
    @DisplayName("자동발행 켜진 정책에 autoIssue=false 를 전송하면 발행일·마감일이 null 로 초기화된다")
    void disableAutoIssueClearsSchedule() {
        FeePolicy policy = feePolicyRepository.save(
                com.duing.common.fixture.FeePolicyFixture.autoIssue(clubId, 5, 20));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("autoIssue", false))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policy.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        FeePolicy updated = feePolicyRepository.findById(policy.getId()).orElseThrow();
        assertThat(updated.isAutoIssue()).isFalse();
        assertThat(updated.getIssueDay()).isNull();
        assertThat(updated.getDueDay()).isNull();
    }

    @Test
    @DisplayName("자동발행을 켜면서 마감일을 누락하면 400 을 반환한다")
    void autoIssueWithMissingDueDayRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("name", "월 회비", "amount", 10000, "billingType", "MONTHLY",
                        "targetType", "ALL_MEMBERS",
                        "autoIssue", true, "issueDay", 5))
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }
}

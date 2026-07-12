package com.duing.domain.fee;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.notNullValue;

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
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.util.HashMap;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderFeePolicyControllerTest extends IntegrationTestBase {

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
    JdbcTemplate jdbcTemplate;

    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private Long clubId;
    private Long memberUserId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 회비 정책 관리(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);

        User leader = userRepository.save(UserFixture.unique());
        User officer = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        memberUserId = member.getId();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        officerToken = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
    }

    private Long createPolicyAs(String token, Map<String, Object> body) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");
    }

    private static Map<String, Object> monthlyBody() {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "월 회비");
        body.put("amount", 10000);
        body.put("billingType", "MONTHLY");
        body.put("targetType", "ALL_MEMBERS");
        return body;
    }

    private FeeBill saveCancelledBill(Long policyId) {
        // 취소 상태여도 existsByFeePolicyId(네이티브)는 발행 이력으로 본다
        return feeBillRepository.save(FeeBillFixture.cancelled(clubId, memberUserId, policyId, "2026-06"));
    }

    @Test
    @DisplayName("운영진(OFFICER)이 회비 정책을 생성하면 201 을 반환한다")
    void officerCreatesPolicy() {
        Long policyId = createPolicyAs(officerToken, monthlyBody());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.size()", greaterThanOrEqualTo(1))
                .body("data[0].id", equalTo(policyId.intValue()))
                .body("data[0].name", equalTo("월 회비"))
                .body("data[0].amount", equalTo(10000))
                .body("data[0].billingType", equalTo("MONTHLY"))
                .body("data[0].active", equalTo(true));
    }

    @Test
    @DisplayName("일반 멤버가 회비 정책을 생성하면 403 을 반환한다")
    void memberForbidden() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .contentType(ContentType.JSON)
                .body(monthlyBody())
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("운영 중단된 동아리에서는 회비 정책을 생성할 수 없다")
    void inactiveClubCannotCreateFeePolicy() {
        // 셋업은 ACTIVE — 운영 중단(INACTIVE) 상태로 직접 전환해 운영 행위 게이트(Part C)를 검증한다.
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(monthlyBody())
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("운영 종료된 동아리입니다."));
    }

    @Test
    @DisplayName("회비 정책 이름과 금액을 수정하면 204 를 반환하고 변경이 반영된다")
    void updateNameAndAmount() {
        Long policyId = createPolicyAs(leaderToken, monthlyBody());

        Map<String, Object> updateBody = new HashMap<>();
        updateBody.put("name", "분기 회비");
        updateBody.put("amount", 30000);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(updateBody)
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policyId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.OK.value())
                .body("data[0].name", equalTo("분기 회비"))
                .body("data[0].amount", equalTo(30000));
    }

    @Test
    @DisplayName("회비 정책을 비활성화(active=false)하면 204 를 반환하고 active 가 false 로 반영된다")
    void deactivatePolicy() {
        Long policyId = createPolicyAs(leaderToken, monthlyBody());

        Map<String, Object> deactivate = new HashMap<>();
        deactivate.put("active", false);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(deactivate)
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policyId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.OK.value())
                .body("data[0].active", equalTo(false));
    }

    @Test
    @DisplayName("공백 이름으로 회비 정책을 수정하면 400 을 반환한다")
    void updateBlankNameRejected() {
        Long policyId = createPolicyAs(leaderToken, monthlyBody());

        Map<String, Object> blankName = new HashMap<>();
        blankName.put("name", "   ");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(blankName)
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policyId)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 회비 정책을 수정하면 404 를 반환한다")
    void updateNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("name", "없는 정책"))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("다른 동아리의 회비 정책을 자신의 동아리 경로로 수정하면 404 를 반환한다")
    void crossClubPolicyNotFound() {
        // 동아리 B 와 그에 속한 정책을 생성한다 — 동아리 A 의 운영진은 이 정책을 볼 수 없어야 한다.
        Club otherClub = clubRepository.save(ClubFixture.academic("동아리B"));
        FeePolicy otherClubPolicy = feePolicyRepository.save(FeePolicyFixture.monthly(otherClub.getId()));

        // 동아리 A 운영진이 동아리 A 경로로 동아리 B 정책 id 를 수정 시도 → clubId 스코프에 걸려 404
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("name", "탈취 시도"))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + otherClubPolicy.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("청구 이력이 없는 정책을 삭제하면 204 를 반환한다")
    void deleteWithoutBills() {
        Long policyId = createPolicyAs(leaderToken, monthlyBody());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policyId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.size()", equalTo(0));
    }

    @Test
    @DisplayName("청구 이력이 있는 정책을 삭제하면 409 를 반환한다")
    void deleteWithBillsConflict() {
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.monthly(clubId));
        saveCancelledBill(policy.getId()); // 취소 상태 청구라도 발행 이력으로 삭제 차단

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policy.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("청구 이력이 있는 정책의 billing_type 을 변경하면 409 를 반환한다")
    void billingTypeImmutableConflict() {
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.monthly(clubId));
        saveCancelledBill(policy.getId()); // 취소 상태 청구라도 발행 이력으로 유형 변경 차단

        // billingType 만 다른 값으로 PATCH → 409 BillingTypeImmutable
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("billingType", "YEARLY"))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policy.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());

        // 같은 정책에 name/amount 만 변경하면 billingType 미변경이므로 204 로 통과
        Map<String, Object> nameAmountOnly = new HashMap<>();
        nameAmountOnly.put("name", "변경된 이름");
        nameAmountOnly.put("amount", 20000);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(nameAmountOnly)
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policy.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("청구 이력이 있어도 동일한 billing_type 으로 PATCH 하면 204 를 반환한다")
    void sameBillingTypePatchPasses() {
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.monthly(clubId));
        saveCancelledBill(policy.getId());

        // 현재 유형(MONTHLY)과 동일한 값을 보내면 변경이 아니므로 통과한다
        Map<String, Object> sameType = new HashMap<>();
        sameType.put("billingType", "MONTHLY");
        sameType.put("amount", 15000);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(sameType)
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policy.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("청구 대상을 SELECTED_MEMBERS 로 지정해 정책을 생성하면 응답에 targetType 이 담긴다")
    void createSelectedMembersPolicy() {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "MT 참가비");
        body.put("amount", 50000);
        body.put("billingType", "ONE_TIME");
        body.put("targetType", "SELECTED_MEMBERS");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.find { it.name == 'MT 참가비' }.targetType", equalTo("SELECTED_MEMBERS"));
    }

    @Test
    @DisplayName("targetType 을 생략하면 400 을 반환한다")
    void targetTypeRequired() {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "회비");
        body.put("amount", 10000);
        body.put("billingType", "MONTHLY");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("SELECTED_MEMBERS 정책에 자동발행을 켜면 400 을 반환한다")
    void autoIssueRequiresAllMembers() {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "자동 참가비");
        body.put("amount", 10000);
        body.put("billingType", "MONTHLY");
        body.put("targetType", "SELECTED_MEMBERS");
        body.put("autoIssue", true);
        body.put("issueDay", 5);
        body.put("dueDay", 20);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }
}

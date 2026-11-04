package com.duing.domain.clubmember;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
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
class LeaderSuccessionAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String officerToken;
    private Long clubId;
    private Long officerUserId;
    private Long leaderUserId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        officerToken = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());
        leaderUserId = leader.getId();
        officerUserId = officer.getId();
        Club club = clubRepository.save(Club.create("타깃동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 승계 요청 제출은 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq, "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    @Test
    @DisplayName("OFFICER 가 승계 요청을 제출하면 201 이 반환된다")
    void createRequestSucceeds() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "잠수 3개월"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("ok", equalTo(true))
                .body("data", notNullValue());
    }

    @Test
    @DisplayName("운영 중단된 동아리에서는 회장 승계를 요청할 수 없다")
    void inactiveClubCannotCreateSuccessionRequest() {
        // 셋업은 ACTIVE — 운영 중단(INACTIVE) 상태로 직접 전환해 운영 행위 게이트(Part C)를 검증한다.
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "잠수 3개월"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("운영 종료된 동아리입니다."));
    }

    @Test
    @DisplayName("동아리 비멤버는 회장 승계를 요청할 수 없다")
    void nonMemberCannotCreateSuccessionRequest() {
        // 운영 행위 게이트(requireOfficer) 도입으로 비멤버는 도메인 400 이 아닌 403 으로 차단된다 — 계약 고정.
        User stranger = saveUser(UserRole.STUDENT);
        String strangerToken = jwtTokenProvider.createToken(stranger.getId(), stranger.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "외부인 시도"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("미인증 요청은 401")
    void unauthenticatedRejected() {
        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "테스트"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("STUDENT 가 /admin/leader-succession-requests 호출 시 403")
    void studentForbiddenFromAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().get("/api/v1/admin/leader-succession-requests")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("ADMIN 이 승계 요청을 APPROVED 로 처리하면 204 + 역할이 교환된다")
    void adminApprovesSwapsRoles() {
        Long requestId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "잠수"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("status", "APPROVED", "actionNote", "확인"))
                .when().patch("/api/v1/admin/leader-succession-requests/" + requestId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        ClubMember leaderRow = clubMemberRepository.findByClubIdAndUserId(clubId, leaderUserId).orElseThrow();
        ClubMember officerRow = clubMemberRepository.findByClubIdAndUserId(clubId, officerUserId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(leaderRow.getRole()).isEqualTo(ClubMemberRole.MEMBER);
        org.assertj.core.api.Assertions.assertThat(officerRow.getRole()).isEqualTo(ClubMemberRole.LEADER);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/leader-succession-requests/" + requestId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo(SuccessionStatus.APPROVED.name()));
    }

    @Test
    @DisplayName("승계 요청 처리 시 status 가 누락되면 400 을 반환한다")
    void processSuccessionRequestWithMissingStatusReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("actionNote", "메모"))
                .when().patch("/api/v1/admin/leader-succession-requests/999999999")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("동일 동아리 PENDING 승계 중복은 409")
    void duplicatePendingConflict() {
        Map<String, Object> body = Map.of("reason", "잠수");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("승계 요청을 한 적 없는 운영진의 내 최근 요청 조회는 200 + data null 이다")
    void myLatestRequestIsNullWhenNoneSubmitted() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().get(myLatestRequestPath(clubId))
                .then().statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                .body("$", hasKey("data"))
                .body("data", nullValue());
    }

    @Test
    @DisplayName("내 요청이 여러 건이면 가장 최근 요청 1건만 보이고, 아직 처리 전이면 메모·처리 시각이 비어 있다")
    void myLatestRequestReturnsMostRecentOne() {
        // 동아리당 PENDING 은 1건뿐이라 첫 요청을 처리해야 두 번째를 낼 수 있다.
        Long firstRequestId = submitRequest(officerToken, clubId, "첫 요청");
        processRequest(firstRequestId, "REJECTED", "첫 요청 거절");
        Long secondRequestId = submitRequest(officerToken, clubId, "두 번째 요청");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().get(myLatestRequestPath(clubId))
                .then().statusCode(HttpStatus.OK.value())
                .body("data.requestId", equalTo(secondRequestId.intValue()))
                .body("data.reason", equalTo("두 번째 요청"))
                .body("data.status", equalTo("PENDING"))
                .body("data.createdAt", endsWith("Z"))
                .body("data.actionNote", nullValue())
                .body("data.handledAt", nullValue());
    }

    @Test
    @DisplayName("총동연이 거절한 내 요청은 결과·처리 메모·처리 시각이 보이고 처리자·현 회장은 내보내지 않는다")
    void myLatestRequestShowsRejectedResultWithoutHandlerOrLeader() {
        Long requestId = submitRequest(officerToken, clubId, "잠수 3개월");
        processRequest(requestId, "REJECTED", "회장과 연락이 닿았습니다.");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().get(myLatestRequestPath(clubId))
                .then().statusCode(HttpStatus.OK.value())
                .body("data.requestId", equalTo(requestId.intValue()))
                .body("data.reason", equalTo("잠수 3개월"))
                .body("data.status", equalTo("REJECTED"))
                .body("data.actionNote", equalTo("회장과 연락이 닿았습니다."))
                .body("data.createdAt", endsWith("Z"))
                .body("data.handledAt", endsWith("Z"))
                .body("data.keySet()", containsInAnyOrder(
                        "requestId", "status", "reason", "actionNote", "createdAt", "handledAt"));
    }

    @Test
    @DisplayName("승인돼 회장(LEADER)이 된 요청자도 내 최근 요청에서 승인 결과를 본다")
    void myLatestRequestVisibleAfterRequesterBecomesLeader() {
        Long requestId = submitRequest(officerToken, clubId, "잠수");
        processRequest(requestId, "APPROVED", "승계 확인");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().get(myLatestRequestPath(clubId))
                .then().statusCode(HttpStatus.OK.value())
                .body("data.requestId", equalTo(requestId.intValue()))
                .body("data.status", equalTo("APPROVED"))
                .body("data.actionNote", equalTo("승계 확인"))
                .body("data.handledAt", endsWith("Z"));
    }

    @Test
    @DisplayName("다른 임원의 요청은 나(임원)와 현 회장 모두의 최근 요청 조회에 보이지 않는다")
    void otherManagersRequestIsNotMine() {
        User otherOfficer = saveUser(UserRole.STUDENT);
        clubMemberRepository.save(ClubMember.of(
                clubRepository.findById(clubId).orElseThrow(), otherOfficer, ClubMemberRole.OFFICER));
        String otherOfficerToken = jwtTokenProvider.createToken(otherOfficer.getId(), otherOfficer.getRole().name());
        String leaderToken = jwtTokenProvider.createToken(leaderUserId, UserRole.STUDENT.name());
        submitRequest(otherOfficerToken, clubId, "다른 임원의 요청");

        for (String managerToken : new String[] {officerToken, leaderToken}) {
            RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + managerToken)
                    .when().get(myLatestRequestPath(clubId))
                    .then().statusCode(HttpStatus.OK.value())
                    .body("data", nullValue());
        }
    }

    @Test
    @DisplayName("다른 동아리에서 한 내 요청은 이 동아리의 내 최근 요청에 섞이지 않는다")
    void myRequestInAnotherClubDoesNotLeak() {
        Club otherClub = clubRepository.save(Club.create("다른동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubMemberRepository.save(ClubMember.of(
                otherClub, userRepository.findById(officerUserId).orElseThrow(), ClubMemberRole.OFFICER));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", otherClub.getId());
        // 이 동아리 요청을 먼저 내고, id 가 더 큰 다른 동아리 요청을 뒤에 낸다 — 동아리 조건이 빠지면 뒤의 것이 잡힌다.
        Long thisClubRequestId = submitRequest(officerToken, clubId, "이 동아리 요청");
        Long otherClubRequestId = submitRequest(officerToken, otherClub.getId(), "다른 동아리 요청");
        org.assertj.core.api.Assertions.assertThat(otherClubRequestId).isGreaterThan(thisClubRequestId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().get(myLatestRequestPath(clubId))
                .then().statusCode(HttpStatus.OK.value())
                .body("data.requestId", equalTo(thisClubRequestId.intValue()))
                .body("data.reason", equalTo("이 동아리 요청"));
    }

    @Test
    @DisplayName("같은 동아리 일반 부원(MEMBER)이 내 최근 승계 요청을 조회하면 403")
    void myLatestRequestForbiddenForSameClubMember() {
        User member = saveUser(UserRole.STUDENT);
        clubMemberRepository.save(ClubMember.asMember(clubRepository.findById(clubId).orElseThrow(), member));
        String memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get(myLatestRequestPath(clubId))
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("동아리에 속하지 않은 사용자가 내 최근 승계 요청을 조회하면 403")
    void myLatestRequestForbiddenForNonMember() {
        User stranger = saveUser(UserRole.STUDENT);
        String strangerToken = jwtTokenProvider.createToken(stranger.getId(), stranger.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .when().get(myLatestRequestPath(clubId))
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("운영 중(ACTIVE)이 아닌 동아리의 운영진이 내 최근 승계 요청을 조회하면 403")
    void myLatestRequestForbiddenForInactiveClub() {
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().get(myLatestRequestPath(clubId))
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("message", equalTo("운영 종료된 동아리입니다."));
    }

    @Test
    @DisplayName("익명 사용자의 내 최근 승계 요청 조회는 401 이다 — 프론트가 토큰 갱신으로 이어 가는 신호")
    void myLatestRequestUnauthenticatedRejected() {
        RestAssured.given()
                .when().get(myLatestRequestPath(clubId))
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private String myLatestRequestPath(Long targetClubId) {
        return "/api/v1/clubs/" + targetClubId + "/leader-succession-requests/me/latest";
    }

    private Long submitRequest(String requesterToken, Long targetClubId, String reason) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + requesterToken)
                .contentType(ContentType.JSON)
                .body(Map.of("reason", reason))
                .when().post("/api/v1/clubs/" + targetClubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");
    }

    private void processRequest(Long requestId, String status, String actionNote) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("status", status, "actionNote", actionNote))
                .when().patch("/api/v1/admin/leader-succession-requests/" + requestId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }
}

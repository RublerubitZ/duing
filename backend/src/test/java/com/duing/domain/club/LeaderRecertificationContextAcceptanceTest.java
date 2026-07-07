package com.duing.domain.club;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
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
class LeaderRecertificationContextAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String leaderToken;
    private Long centralClubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = clubRepository.save(Club.create("중앙동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        club.changeCentralClub(true);
        clubRepository.save(club);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        centralClubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 재인증 컨텍스트 조회·신청은 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", centralClubId);
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private void openRound(int year, String label) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("year", year, "label", label))
                .when().post("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("LEADER 가 중앙동아리에서 OPEN 라운드 존재 시 신청 가능 컨텍스트를 반환한다")
    void contextWithOpenRoundAndNoPending() {
        openRound(2026, "2026 정기 재인증");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.centralClub", equalTo(true))
                .body("data.openRound.year", equalTo(2026))
                .body("data.openRound.label", equalTo("2026 정기 재인증"))
                .body("data.openRound.id", notNullValue())
                .body("data.pendingRequest", nullValue());
    }

    @Test
    @DisplayName("OPEN 라운드가 없으면 openRound 와 pendingRequest 가 모두 null 이다")
    void contextWithoutOpenRound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.centralClub", equalTo(true))
                .body("data.openRound", nullValue())
                .body("data.pendingRequest", nullValue());
    }

    @Test
    @DisplayName("이미 PENDING 신청이 있으면 pendingRequest 필드가 채워진다")
    void contextWithPendingRequest() {
        openRound(2026, "2026 정기 재인증");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "contactEmail", "leader@example.com",
                        "contactPhone", "010-1234-5678",
                        "operatingYear", 2026,
                        "notes", "메모"))
                .when().post("/api/v1/clubs/" + centralClubId + "/recertification-requests")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.pendingRequest", notNullValue())
                .body("data.pendingRequest.operatingYear", equalTo(2026))
                .body("data.pendingRequest.contactEmail", equalTo("leader@example.com"))
                .body("data.pendingRequest.contactPhone", equalTo("010-1234-5678"));
    }

    @Test
    @DisplayName("비-중앙동아리이면 centralClub=false 로 응답한다")
    void contextWithNonCentralClub() {
        Club nonCentral = clubRepository.save(Club.create("일반동아리",
                ClubCategory.HOBBY, null, "설명", null));
        // 운영 행위 게이트(Part C)로 ACTIVE 동아리만 컨텍스트 조회가 가능하므로 승격한다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", nonCentral.getId());
        User leader2 = saveUser(UserRole.STUDENT);
        clubMemberRepository.save(ClubMember.asLeader(nonCentral, leader2));
        String token = jwtTokenProvider.createToken(leader2.getId(), leader2.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/clubs/" + nonCentral.getId() + "/recertification-context")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.centralClub", equalTo(false));
    }

    @Test
    @DisplayName("OFFICER 가 호출하면 403 을 반환한다")
    void contextWithOfficerForbidden() {
        User officer = saveUser(UserRole.STUDENT);
        Club club = clubRepository.findById(centralClubId).orElseThrow();
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        String token = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비-멤버가 호출하면 403 을 반환한다")
    void contextWithNonMemberForbidden() {
        User outsider = saveUser(UserRole.STUDENT);
        String token = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("미인증 사용자가 호출하면 403 을 반환한다")
    void contextWithoutAuth() {
        // GET /api/v1/clubs/** 는 SecurityConfig 에서 permitAll() 이므로 필터 수준의 401 이
        // 발생하지 않는다. 대신 컨트롤러의 @PreAuthorize("isAuthenticated()") 가 동작하여
        // AccessDeniedException → GlobalExceptionHandler → 403 을 반환한다.
        RestAssured.given()
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }
}

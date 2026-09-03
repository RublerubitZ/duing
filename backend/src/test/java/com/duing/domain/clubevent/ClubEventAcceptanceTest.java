package com.duing.domain.clubevent;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;

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
import java.time.LocalDate;
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
class ClubEventAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(Club.create("동아리E",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 멤버용 일정 조회는 ACTIVE 동아리만 허용되므로,
        // 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);

        User leader = saveUser();
        User officer = saveUser();
        User member = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        officerToken = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq, "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Long createEventAs(String token, LocalDateTime start, LocalDateTime end) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "정기 모임", "startAt", start.toString(),
                        "endAt", end.toString(), "location", "동아리방"))
                .when().post("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");
    }

    @Test
    @DisplayName("LEADER 가 일정을 생성하고 회원이 조회한다")
    void createAndList() {
        LocalDateTime start = LocalDateTime.now().plusDays(3).withNano(0);
        Long eventId = createEventAs(leaderToken, start, start.plusHours(2));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].id", equalTo(eventId.intValue()));
    }

    @Test
    @DisplayName("운영 중단된 동아리에서는 일정을 생성할 수 없다")
    void inactiveClubCannotCreateEvent() {
        // 셋업은 ACTIVE — 운영 중단(INACTIVE) 상태로 직접 전환해 운영 행위 게이트(Part C)를 검증한다.
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubId);
        LocalDateTime start = LocalDateTime.now().plusDays(3).withNano(0);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "정기 모임", "startAt", start.toString(),
                        "endAt", start.plusHours(2).toString(), "location", "동아리방"))
                .when().post("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("운영 종료된 동아리입니다."));
    }

    @Test
    @DisplayName("OFFICER 가 삭제하면 회원 조회 결과에서 사라진다")
    void officerCanDelete() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Long eventId = createEventAs(leaderToken, start, start.plusHours(1));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().delete("/api/v1/clubs/" + clubId + "/events/" + eventId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("MEMBER 의 삭제 시도는 403 을 반환한다")
    void memberCannotDelete() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Long eventId = createEventAs(leaderToken, start, start.plusHours(1));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().delete("/api/v1/clubs/" + clubId + "/events/" + eventId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("endAt < startAt 이면 400 을 반환한다")
    void invalidPeriod() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "이상한 일정",
                        "startAt", start.toString(),
                        "endAt", start.minusHours(1).toString()))
                .when().post("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("윈도우가 400 일 초과면 400 을 반환한다")
    void windowCap() {
        LocalDate from = LocalDate.now().minusDays(1);
        LocalDate to = LocalDate.now().plusDays(500);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/events?from=" + from + "&to=" + to)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("비-멤버가 조회하면 403 을 반환한다")
    void nonMemberForbidden() {
        User outsider = saveUser();
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("운영 중단된 동아리의 멤버는 일정 목록을 조회할 수 없다")
    void inactiveClubMemberCannotListEvents() {
        LocalDateTime start = LocalDateTime.now().plusDays(3).withNano(0);
        createEventAs(leaderToken, start, start.plusHours(2));
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("운영 종료된 동아리입니다."));
    }

    @Test
    @DisplayName("운영 중단된 동아리의 멤버는 일정 상세를 조회할 수 없다")
    void inactiveClubMemberCannotGetEventDetail() {
        LocalDateTime start = LocalDateTime.now().plusDays(3).withNano(0);
        Long eventId = createEventAs(leaderToken, start, start.plusHours(2));
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/events/" + eventId)
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("운영 종료된 동아리입니다."));
    }

    @Test
    @DisplayName("동아리 일정 목록·단건은 익명 접근 시 401 로 차단된다 — clubs/** GET permitAll 보다 앞선 URL 레이어 잠금")
    void anonymousEventReadIsUnauthorized() {
        RestAssured.given()
                .when().get("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
        RestAssured.given()
                .when().get("/api/v1/clubs/" + clubId + "/events/1")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("LEADER 가 삭제하면 회원 조회 결과에서 사라진다 (soft delete)")
    void leaderDelete() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Long eventId = createEventAs(leaderToken, start, start.plusHours(1));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/clubs/" + clubId + "/events/" + eventId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }
}

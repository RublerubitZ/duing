package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.entity.ContactVisibility;
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
import java.lang.reflect.Field;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubDetailContactVisibilityTest extends IntegrationTestBase {

    private static final String LEADER_PHONE = "010-1234-5678";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User officerUser;
    private User studentUser;
    private User adminUser;
    private Club club;
    private String officerToken;
    private String studentToken;
    private String adminToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("회장", UserRole.STUDENT, LEADER_PHONE);
        officerUser = saveUser("임원", UserRole.STUDENT, "010-2222-2222");
        studentUser = saveUser("일반학생", UserRole.STUDENT, "010-3333-3333");
        adminUser = saveUser("총동연", UserRole.ADMIN, "010-9999-9999");

        club = saveActiveClub("공개게이트");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));

        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
    }

    @Test
    @DisplayName("PUBLIC 이면 비로그인 사용자도 회장 전화번호 원본을 본다")
    void publicVisibleToAnonymous() {
        setVisibility(club, ContactVisibility.PUBLIC);

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.contactPhone", equalTo(LEADER_PHONE))
                    .body("data.contactVisibility", equalTo("PUBLIC"));
    }

    @Test
    @DisplayName("LOGGED_IN_ONLY 면 비로그인에게는 null, 로그인 사용자에게는 원본이 보인다")
    void loggedInOnlyGate() {
        setVisibility(club, ContactVisibility.LOGGED_IN_ONLY);

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.contactPhone", nullValue());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.contactPhone", equalTo(LEADER_PHONE));
    }

    @Test
    @DisplayName("PRIVATE 이면 일반 로그인 사용자에게도 null 이다")
    void privateHiddenFromMembers() {
        setVisibility(club, ContactVisibility.PRIVATE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.contactPhone", nullValue())
                    .body("data.contactVisibility", equalTo("PRIVATE"));
    }

    @Test
    @DisplayName("PRIVATE 이어도 해당 동아리 임원(OFFICER)에게는 원본이 보인다")
    void privateVisibleToOfficer() {
        setVisibility(club, ContactVisibility.PRIVATE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.contactPhone", equalTo(LEADER_PHONE));
    }

    @Test
    @DisplayName("PRIVATE 이어도 총동연(ADMIN)은 어드민 조회로 원본을 본다")
    void privateVisibleToAdmin() {
        setVisibility(club, ContactVisibility.PRIVATE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.contactPhone", equalTo(LEADER_PHONE));
    }

    @Test
    @DisplayName("회장이 없는 동아리는 공개 범위와 무관하게 contactPhone 이 null 이다")
    void leaderlessClubHasNoPhone() throws Exception {
        Club leaderless = saveActiveClub("회장공석");
        setVisibility(leaderless, ContactVisibility.PUBLIC);

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}", leaderless.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.contactPhone", nullValue());
    }

    @Test
    @DisplayName("공개 범위가 비공개여도 contactVisibility 값 자체는 응답에 항상 포함된다")
    void visibilityAlwaysSerialized() {
        setVisibility(club, ContactVisibility.PRIVATE);

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.contactVisibility", equalTo("PRIVATE"));
    }

    private void setVisibility(Club target, ContactVisibility visibility) {
        Club loaded = clubRepository.findById(target.getId()).orElseThrow();
        loaded.update(new Club.UpdatePayload(
                null, null, null, null, null, null, null, null, null,   // A(1~9)
                null, null, null, null, null, null, null,               // B(10~16)
                visibility, null, null, null,                           // C(17~20) contactVisibility 만 채움
                null, null, null, null, null));                         // D(21~25) college~useGeneration
        clubRepository.saveAndFlush(loaded);
    }

    private User saveUser(String name, UserRole role, String phone) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                phone,
                java.time.LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", "https://logo");
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}

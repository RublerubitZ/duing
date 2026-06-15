package com.duing.domain.clubmember.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubMemberControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User officerUser;
    private User memberUser;
    private User strangerUser;
    private Club club;
    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private String strangerToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("운영진리더");
        officerUser = saveUser("운영진오피서");
        memberUser = saveUser("일반회원");
        strangerUser = saveUser("비멤버");
        club = saveActiveClub("두잉멤버컨트롤러");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
        strangerToken = jwtTokenProvider.createToken(strangerUser.getId(), strangerUser.getRole().name());
    }

    @Test
    @DisplayName("LEADER 가 호출하면 200 과 역할 정렬된 멤버 목록을 반환한다")
    void leaderGetsOrderedList() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data", hasSize(3))
                    .body("data.role", contains("LEADER", "OFFICER", "MEMBER"))
                    .body("data.name", contains("운영진리더", "운영진오피서", "일반회원"));
    }

    @Test
    @DisplayName("OFFICER 도 200 을 받는다")
    void officerCanList() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("MEMBER 는 403 을 받는다")
    void memberIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비멤버는 403 을 받는다")
    void strangerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 호출하면 4xx 인증 오류를 반환한다")
    void anonymousIsRejected() {
        int status = RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}

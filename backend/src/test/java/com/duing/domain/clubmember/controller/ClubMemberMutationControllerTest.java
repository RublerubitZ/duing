package com.duing.domain.clubmember.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ClubMemberMutationControllerTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User officerUser;
    private User memberUser;
    private Club club;
    private ClubMember memberMembership;
    private ClubMember officerMembership;
    private String leaderToken;
    private String officerToken;
    private String memberToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("리더C");
        officerUser = saveUser("운영C");
        memberUser = saveUser("일반C");
        club = saveActiveClub("두잉멤버변경");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        officerMembership = clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        memberMembership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
    }

    // ── 3.4 PATCH role ───────────────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 MEMBER 를 OFFICER 로 승급하면 204 를 반환한다")
    void patchRoleAsLeader() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("role", "OFFICER"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/role",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubMemberRepository.findById(memberMembership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.OFFICER);
    }

    @Test
    @DisplayName("OFFICER 가 PATCH 를 시도하면 403 을 반환한다")
    void patchRoleAsOfficerForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("role", "OFFICER"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/role",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("role 에 LEADER 를 보내면 400 을 반환한다")
    void patchRoleLeaderRejected() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("role", "LEADER"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/role",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    // ── 3.5 DELETE member ────────────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 멤버를 강퇴하면 204 를 반환하고 멤버십이 사라진다")
    void removeMemberAsLeader() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/members/{memberId}",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubMemberRepository.findById(memberMembership.getId())).isEmpty();
    }

    @Test
    @DisplayName("MEMBER 가 다른 멤버 강퇴를 시도하면 403 을 반환한다")
    void removeMemberAsMemberForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/members/{memberId}",
                            club.getId(), officerMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── 3.6 DELETE me ────────────────────────────────────────────────────

    @Test
    @DisplayName("MEMBER 가 본인 탈퇴를 호출하면 204 를 반환한다")
    void leaveAsMember() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/members/me", club.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubMemberRepository.findById(memberMembership.getId())).isEmpty();
    }

    @Test
    @DisplayName("LEADER 가 본인 탈퇴를 호출하면 409 를 반환한다")
    void leaveAsLeaderConflict() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/members/me", club.getId())
                .then()
                    .statusCode(HttpStatus.CONFLICT.value());
    }

    // ── 3.7 POST transfer-leader ────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 OFFICER 에게 회장을 인계하면 200 과 두 행의 새 역할을 반환한다")
    void transferLeader() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .post("/api/v1/clubs/{clubId}/members/{memberId}/transfer-leader",
                            club.getId(), officerMembership.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.formerLeader.role", equalTo("OFFICER"))
                    .body("data.newLeader.role", equalTo("LEADER"));

        assertThat(clubMemberRepository.findById(officerMembership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.LEADER);
    }

    @Test
    @DisplayName("OFFICER 가 회장 인계를 시도하면 403 을 반환한다")
    void transferLeaderAsOfficerForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when()
                    .post("/api/v1/clubs/{clubId}/members/{memberId}/transfer-leader",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 변경 호출하면 4xx 인증 오류를 반환한다")
    void anonymousRejected() {
        int status = RestAssured
                .given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("role", "OFFICER"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/role",
                            club.getId(), memberMembership.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    // ── fixtures ────────────────────────────────────────────────────────

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
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

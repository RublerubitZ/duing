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
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
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
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubMemberMutationControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

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

    @Test
    @DisplayName("운영 중단된 동아리에서는 멤버 역할을 변경할 수 없다")
    void inactiveClubCannotChangeMemberRole() {
        // 셋업은 ACTIVE — 운영 중단(INACTIVE) 상태로 직접 전환해 운영 행위 게이트(Part C)를 검증한다.
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", club.getId());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("role", "OFFICER"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/role",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value())
                    .body("ok", equalTo(false))
                    .body("message", equalTo("운영 종료된 동아리입니다."));

        assertThat(clubMemberRepository.findById(memberMembership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.MEMBER);
    }

    // ── 3.4b PATCH generation ───────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 멤버 기수를 지정하면 204 를 반환하고 기수가 저장된다")
    void patchGenerationAsLeader() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("generation", 9))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/generation",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubMemberRepository.findById(memberMembership.getId()).orElseThrow().getGeneration())
                .isEqualTo(9);
    }

    @Test
    @DisplayName("generation 에 null 을 보내면 기존 기수가 비워진다")
    void patchGenerationClearWithNull() {
        jdbcTemplate.update("UPDATE club_member SET generation = 5 WHERE id = ?",
                memberMembership.getId());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body("{\"generation\":null}")
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/generation",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubMemberRepository.findById(memberMembership.getId()).orElseThrow().getGeneration())
                .isNull();
    }

    @Test
    @DisplayName("generation 에 0 을 보내면 400 과 안내 메시지를 반환한다")
    void patchGenerationZeroRejected() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body("{\"generation\":0}")
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/generation",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", equalTo("기수는 1 이상의 정수여야 합니다."));

        assertThat(clubMemberRepository.findById(memberMembership.getId()).orElseThrow().getGeneration())
                .isNull();
    }

    @Test
    @DisplayName("generation 에 음수를 보내면 400 을 반환한다")
    void patchGenerationNegativeRejected() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body("{\"generation\":-1}")
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/generation",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("use_generation 이 꺼져 있어도 기수는 저장된다 — useGeneration 은 표시 제어 전용")
    void patchGenerationSavedEvenWhenUseGenerationOff() {
        // 셋업 동아리는 use_generation 기본값(false) — 저장 게이트가 아님을 검증한다.
        assertThat(clubRepository.findById(club.getId()).orElseThrow().isUseGeneration()).isFalse();

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("generation", 3))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/generation",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubMemberRepository.findById(memberMembership.getId()).orElseThrow().getGeneration())
                .isEqualTo(3);
    }

    @Test
    @DisplayName("다른 동아리 멤버의 기수를 이 동아리 경로로 변경하면 404 를 반환한다")
    void patchGenerationOtherClubMemberNotFound() throws Exception {
        Club otherClub = saveActiveClub("다른동아리");
        User otherUser = saveUser("타클럽원");
        ClubMember otherMembership =
                clubMemberRepository.save(ClubMember.asMember(otherClub, otherUser));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("generation", 2))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/generation",
                            club.getId(), otherMembership.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("MEMBER 가 기수 변경을 시도하면 403 을 반환한다")
    void patchGenerationAsMemberForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("generation", 2))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/generation",
                            club.getId(), officerMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("OFFICER 가 기수 변경을 시도하면 403 을 반환한다")
    void patchGenerationAsOfficerForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("generation", 2))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/generation",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
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

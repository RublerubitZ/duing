package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubStatusAndCentralClubControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private User studentUser;
    private User leaderUser;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        studentUser = saveUser("학생사용자", UserRole.STUDENT);
        leaderUser = saveUser("동아리장후보", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PATCH /api/v1/admin/clubs/{id}/status — 상태 변경
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("ADMIN 이 PENDING 동아리를 REJECTED 로 전이하면 204 가 반환되고 목록 조회 시 rejectionReason 과 statusChangedByName 이 노출된다")
    void adminRejectsClubSuccessfully() throws Exception {
        Club pendingClub = saveClubWithLeader("거절테스트클럽", ClubStatus.PENDING_APPROVAL);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("status", "REJECTED", "rejectionReason", "활동 계획서 미흡"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}/status", pendingClub.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs?size=100&keyword=거절테스트클럽")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content[0].status", equalTo("REJECTED"))
                    .body("data.content[0].rejectionReason", equalTo("활동 계획서 미흡"))
                    .body("data.content[0].statusChangedByName", notNullValue());
    }

    @Test
    @DisplayName("REJECTED 전이 시 rejectionReason 이 없으면 400 이 반환된다")
    void rejectWithoutReasonReturns400() throws Exception {
        Club pendingClub = saveClubWithLeader("사유없거절클럽", ClubStatus.PENDING_APPROVAL);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("status", "REJECTED"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}/status", pendingClub.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("ACTIVE 동아리를 REJECTED 로 전이하면 허용되지 않아 400 이 반환된다")
    void activeClubRejectionIsInvalidTransition() throws Exception {
        Club activeClub = saveClubWithLeader("활성거절시도클럽", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("status", "REJECTED", "rejectionReason", "사유"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}/status", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("ok", equalTo(false));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PATCH /api/v1/admin/clubs/{id}/central-club — 중앙동아리 토글
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("ADMIN 이 중앙동아리 여부를 true 로 변경하면 204 가 반환되고 목록 조회 시 centralClub=true 로 노출된다")
    void adminSetsCentralClubTrue() throws Exception {
        Club club = saveClubWithLeader("중앙동아리설정클럽", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("centralClub", true))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}/central-club", club.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs?size=100&keyword=중앙동아리설정클럽")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content[0].centralClub", equalTo(true));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 권한 — STUDENT 접근 거부
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("STUDENT 가 상태 변경 엔드포인트를 호출하면 403 이 반환된다")
    void studentCannotChangeStatus() throws Exception {
        Club pendingClub = saveClubWithLeader("학생접근거부상태클럽", ClubStatus.PENDING_APPROVAL);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("status", "ACTIVE"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}/status", pendingClub.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("STUDENT 가 중앙동아리 변경 엔드포인트를 호출하면 403 이 반환된다")
    void studentCannotChangeCentralClub() throws Exception {
        Club club = saveClubWithLeader("학생접근거부중앙클럽", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("centralClub", true))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}/central-club", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 헬퍼
    // ──────────────────────────────────────────────────────────────────────────

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveClubWithLeader(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        Club saved = clubRepository.save(created);
        clubMemberRepository.save(ClubMember.asLeader(saved, leaderUser));
        return saved;
    }
}

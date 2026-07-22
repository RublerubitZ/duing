package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
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
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
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
class AdminClubUpdateControllerTest extends IntegrationTestBase {

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

    @Test
    @DisplayName("총동연 관리자는 자신이 멤버가 아닌 동아리의 기본 정보를 수정할 수 있고 변경된 상세가 반환된다")
    void adminUpdatesClubProfileSuccessfully() throws Exception {
        Club club = saveClubWithLeader("수정대상동아리", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("description", "관리자가 수정한 설명"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.description", equalTo("관리자가 수정한 설명"));
    }

    @Test
    @DisplayName("일반 학생이 관리자 수정 엔드포인트를 호출하면 403 이 반환된다")
    void studentCannotUpdateClub() throws Exception {
        Club club = saveClubWithLeader("학생접근거부동아리", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "학생이바꾼이름"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 동아리를 수정하면 404 가 반환된다")
    void updatingMissingClubReturnsNotFound() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "없는동아리"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", 999_999L)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @Disabled("Task 3 어드민 전용 요청(AdminUpdateClubRequest)에서 이름 수정 복원 후 활성화")
    @DisplayName("다른 동아리와 중복되는 이름으로 수정하면 409 가 반환된다")
    void updatingToDuplicateNameReturnsConflict() throws Exception {
        Club existing = saveClubWithLeader("이미있는동아리", ClubStatus.ACTIVE);
        Club target = saveClubWithLeader("수정할동아리", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", existing.getName()))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", target.getId())
                .then()
                    .statusCode(HttpStatus.CONFLICT.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("운영 중단(INACTIVE) 동아리도 관리자는 수정할 수 있다")
    void adminCanUpdateInactiveClub() throws Exception {
        Club inactiveClub = saveClubWithLeader("운영중단동아리", ClubStatus.INACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("description", "중단 상태에서도 수정"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", inactiveClub.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.description", equalTo("중단 상태에서도 수정"));
    }

    @Test
    @DisplayName("일부 필드만 보내면 나머지 필드는 변경되지 않는다")
    void partialUpdateLeavesOtherFieldsUnchanged() throws Exception {
        Club club = saveClubWithLeader("부분수정동아리", ClubStatus.ACTIVE);
        String originalName = club.getName();

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("description", "설명만 변경"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.name", equalTo(originalName))
                    .body("data.description", equalTo("설명만 변경"));
    }

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

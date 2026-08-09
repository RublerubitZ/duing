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
import io.restassured.response.ValidatableResponse;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 동아리 이름 중복 정책 — 활성 동아리끼리만 유일하고, 폐쇄(soft-delete)된 동아리의 이름은 재사용할 수 있다.
 *
 * <p>서비스의 {@code existsByName} 은 파생 쿼리라 {@code @SQLRestriction("deleted_at IS NULL")} 이 걸려
 * 폐쇄된 동아리를 애초에 보지 못한다. 따라서 DB 제약이 활성 행만 대상으로 하지 않으면 애플리케이션은
 * "중복 없음" 으로 통과시킨 뒤 INSERT 단계에서 제약 충돌로 409 를 내뱉는다(V109 가 고친 지점).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubDuplicateNameTest extends IntegrationTestBase {

    private static final String CLUB_NAME = "날개";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private String adminToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        leaderUser = saveUser("동아리장후보", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
    }

    @Test
    @DisplayName("같은 이름의 활성 동아리가 있으면 생성 요청은 409 로 거절된다")
    void creatingDuplicateNameOfActiveClubIsRejected() throws Exception {
        saveClubWithLeader(CLUB_NAME, ClubStatus.ACTIVE);

        createClub(CLUB_NAME)
                .statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo("이미 존재하는 동아리 이름입니다."));
    }

    @Test
    @DisplayName("폐쇄된 동아리와 같은 이름으로 다시 생성하면 201 로 성공한다")
    void nameOfClosedClubCanBeReused() throws Exception {
        Club closedClub = saveClubWithLeader(CLUB_NAME, ClubStatus.INACTIVE);
        closeClub(closedClub.getId());

        createClub(CLUB_NAME).statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("폐쇄 후 재생성된 동아리가 있으면 같은 이름의 세 번째 생성은 다시 409 로 거절된다")
    void recreatedClubBlocksAnotherDuplicate() throws Exception {
        Club closedClub = saveClubWithLeader(CLUB_NAME, ClubStatus.INACTIVE);
        closeClub(closedClub.getId());

        createClub(CLUB_NAME).statusCode(HttpStatus.CREATED.value());

        createClub(CLUB_NAME)
                .statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo("이미 존재하는 동아리 이름입니다."));
    }

    @Test
    @DisplayName("같은 이름으로 폐쇄된 동아리가 여러 개 쌓여 있어도 신규 생성은 성공한다")
    void multipleClosedClubsWithSameNameDoNotBlockCreation() throws Exception {
        for (int round = 0; round < 3; round++) {
            Club club = saveClubWithLeader(CLUB_NAME, ClubStatus.INACTIVE);
            closeClub(club.getId());
        }

        Integer closedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM club WHERE name = ? AND deleted_at IS NOT NULL", Integer.class, CLUB_NAME);
        Assertions.assertEquals(3, closedCount);

        createClub(CLUB_NAME).statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("같은 이름의 활성 동아리를 DB 에 직접 넣으면 부분 유니크 인덱스가 막는다")
    void activeNamesStayUniqueAtDatabaseLevel() throws Exception {
        saveClubWithLeader(CLUB_NAME, ClubStatus.ACTIVE);

        // 애플리케이션 가드(existsByName) 를 건너뛴 경로 — 동시 생성이 검사-삽입 사이를 파고들 때
        // 마지막 방어선이 인덱스다. 이 단언이 없으면 마이그레이션에서 UNIQUE 를 떨어뜨려도 수트가 초록이다.
        Assertions.assertThrows(DataIntegrityViolationException.class,
                () -> saveClubWithLeader(CLUB_NAME, ClubStatus.ACTIVE));
    }

    @Test
    @DisplayName("폐쇄된 동아리의 이름으로 다른 동아리를 개명하면 200 으로 성공한다")
    void closedClubNameCanBeTakenByRename() throws Exception {
        Club closedClub = saveClubWithLeader(CLUB_NAME, ClubStatus.INACTIVE);
        closeClub(closedClub.getId());
        Club survivingClub = saveClubWithLeader("개명대상클럽", ClubStatus.ACTIVE);

        // 생성과 같은 existsByName 가드를 쓰므로 이름 변경도 같은 원인으로 막혀 있었다.
        renameClub(survivingClub.getId(), CLUB_NAME).statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("활성 동아리의 이름으로 다른 동아리를 개명하면 409 로 거절된다")
    void activeClubNameCannotBeTakenByRename() throws Exception {
        saveClubWithLeader(CLUB_NAME, ClubStatus.ACTIVE);
        Club survivingClub = saveClubWithLeader("개명거부대상클럽", ClubStatus.ACTIVE);

        renameClub(survivingClub.getId(), CLUB_NAME)
                .statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo("이미 존재하는 동아리 이름입니다."));
    }

    @Test
    @DisplayName("이름이 겹치지 않는 동아리 생성은 201 로 성공하고 회장이 LEADER 로 등록된다")
    void creatingClubWithFreeNameSucceeds() {
        Long createdClubId = createClub("겹치지않는이름")
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        Assertions.assertTrue(
                clubMemberRepository.findByClubIdAndUserId(createdClubId, leaderUser.getId()).isPresent());
    }

    private ValidatableResponse createClub(String name) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", ClubCategory.ACADEMIC.name());
        body.put("division", "분과");
        body.put("description", "설명");
        body.put("leaderId", leaderUser.getId());
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(body)
                .when()
                    .post("/api/v1/admin/clubs")
                .then();
    }

    private ValidatableResponse renameClub(Long clubId, String newName) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", newName))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", clubId)
                .then();
    }

    private void closeClub(Long clubId) {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", clubId)
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
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
        Club created = Club.create(name, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        Club saved = clubRepository.save(created);
        clubMemberRepository.save(ClubMember.asLeader(saved, leaderUser));
        return saved;
    }
}

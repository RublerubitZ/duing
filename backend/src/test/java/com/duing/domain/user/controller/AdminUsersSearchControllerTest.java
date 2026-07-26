package com.duing.domain.user.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminUsersSearchControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = saveUser("2026010001", "총동연관리자", UserRole.ADMIN);
        User studentUser = saveUser("2026010002", "학생사용자", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
    }

    @Test
    @DisplayName("학번 prefix 로 검색하면 해당 학번 사용자가 반환된다")
    void searchByStudentIdPrefix() {
        User target = saveUser("2024030001", "김학번", UserRole.STUDENT);
        saveUser("2025040002", "박다름", UserRole.STUDENT);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=202403")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.content.studentId", hasItem(target.getStudentId()))
                    .body("data.content.studentId", not(hasItem("2025040002")));
    }

    @Test
    @DisplayName("이름 부분일치(대소문자 무시) 로 검색된다")
    void searchByNameContains() {
        User target = saveUser("2024030010", "이름검색대상", UserRole.STUDENT);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=검색대상")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.id", hasItem(target.getId().intValue()));
    }

    @Test
    @DisplayName("응답에 passwordHash 등 민감 필드는 노출되지 않는다")
    void responseDoesNotLeakSensitiveFields() {
        saveUser("2024030030", "필드검사", UserRole.STUDENT);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=2024030030")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content[0].studentId", equalTo("2024030030"))
                    .body("data.content[0]", not(hasItem("passwordHash")))
                    .body("data.content[0]", not(hasItem("phone")))
                    .body("data.content[0]", not(hasKey("email")));
    }

    @Test
    @DisplayName("검색 결과에 동명이인 식별용 학년·단과대·전공이 원값으로 포함된다")
    void responseIncludesIdentityFields() {
        saveUser("2024030040", "식별대상", UserRole.STUDENT, Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터공학");

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=2024030040")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content[0].grade", equalTo("JUNIOR"))
                    .body("data.content[0].college", equalTo("IT_ENGINEERING"))
                    .body("data.content[0].major", equalTo("컴퓨터공학"));
    }

    @Test
    @DisplayName("STUDENT 가 호출하면 403 을 반환한다")
    void studentGetsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/admin/users?q=anyone")
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("검색어를 빈 문자열로 보내면 검색 조건 없이 전체 목록을 반환한다")
    void blankQueryReturnsFullList() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", greaterThanOrEqualTo(2));
    }

    @Test
    @DisplayName("검색어 없이 조회하면 전체 회원이 반환된다")
    void searchWithoutQueryReturnsAllUsers() {
        saveUser("2024030050", "가나다", UserRole.STUDENT);
        saveUser("2024030051", "라마바", UserRole.STUDENT);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", greaterThanOrEqualTo(2));
    }

    @Test
    @DisplayName("status=SUSPENDED 로 조회하면 정지된 회원만 반환된다")
    void searchFiltersBySuspendedStatus() {
        saveUser("2024030060", "정상회원", UserRole.STUDENT);
        User suspendedUser = saveUser("2024030061", "정지회원", UserRole.STUDENT);
        suspendedUser.suspend();
        userRepository.saveAndFlush(suspendedUser);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("status", "SUSPENDED")
                .when()
                    .get("/api/v1/admin/users")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", equalTo(1))
                    .body("data.content[0].name", equalTo("정지회원"))
                    .body("data.content[0].status", equalTo("SUSPENDED"));
    }

    @Test
    @DisplayName("검색 결과 행에 계정 상태가 포함된다")
    void searchResultIncludesStatus() {
        User target = saveUser("2024030070", "상태확인", UserRole.STUDENT);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("q", target.getStudentId())
                .when()
                    .get("/api/v1/admin/users")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content[0].status", equalTo("ACTIVE"));
    }

    @Test
    @DisplayName("가입 시각이 같은 회원들도 페이지 사이에서 겹치거나 누락되지 않는다")
    void pagingIsStableWhenCreatedAtTies() {
        for (int index = 0; index < 5; index++) {
            saveUser("202405000" + index, "동시가입" + index, UserRole.STUDENT);
        }
        // 가입 시각을 강제로 동일하게 맞춘다 — createdAt 만으로 정렬하면 동률 행의 순서가 쿼리마다 달라져
        // 페이지 경계에서 행이 중복되거나 누락된다. id 를 덧붙인 tie-breaker 가 이를 막는지 확인한다.
        jdbcTemplate.update("UPDATE users SET created_at = ?", Timestamp.valueOf(LocalDateTime.now()));

        List<Integer> pagedIds = new ArrayList<>(requestPageIds(0));
        pagedIds.addAll(requestPageIds(1));

        // setUp 의 관리자·학생 2명 + 방금 만든 5명 = 7명이 중복 없이 한 번씩만 나와야 한다.
        assertThat(pagedIds).hasSize(7).doesNotHaveDuplicates();
        assertThat(pagedIds).isSortedAccordingTo(Comparator.reverseOrder());
    }

    @Test
    @DisplayName("허용 목록에 없는 정렬 속성을 요청하면 400 을 반환한다")
    void unknownSortPropertyReturns400() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?sort=passwordHash,desc")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    private List<Integer> requestPageIds(int page) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("page", page)
                    .queryParam("size", 4)
                .when()
                    .get("/api/v1/admin/users")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .extract().jsonPath().getList("data.content.id", Integer.class);
    }

    private User saveUser(String studentId, String name, UserRole role) {
        return saveUser(studentId, name, role, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정");
    }

    private User saveUser(String studentId, String name, UserRole role,
                          Grade grade, College college, String major) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                studentId,
                name,
                "hashed",
                role,
                grade,
                college,
                major,
                "010-" + String.format("%04d", unique % 10000) + "-0000",
                LocalDateTime.now()
        ));
    }
}

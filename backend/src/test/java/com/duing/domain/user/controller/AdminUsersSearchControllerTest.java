package com.duing.domain.user.controller;

import static org.hamcrest.Matchers.equalTo;
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
import java.time.LocalDateTime;
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
class AdminUsersSearchControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

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
    @DisplayName("검색어가 비어있으면 400 을 반환한다")
    void emptyQueryReturns400() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
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

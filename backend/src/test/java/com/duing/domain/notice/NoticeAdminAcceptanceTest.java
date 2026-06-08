package com.duing.domain.notice;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

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
class NoticeAdminAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User student = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("ADMIN 은 PUBLIC 공지를 작성하면 201 과 id 를 받는다")
    void adminCreatesPublicNotice() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "축제 안내",
                      "summary": "이번 주말 축제 안내드립니다",
                      "content": "본문 내용입니다",
                      "coverImageUrl": "https://example.com/cover.png",
                      "category": "FESTIVAL",
                      "visibility": "PUBLIC",
                      "pinned": false,
                      "notifyOnPublish": false
                    }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .body("ok", equalTo(true))
                .body("data", notNullValue());
    }

    @Test
    @DisplayName("STUDENT 가 admin 공지 생성을 시도하면 403 을 받는다")
    void studentCannotCreateNotice() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "x",
                      "summary": "x",
                      "content": "x",
                      "coverImageUrl": "https://example.com/x.png",
                      "category": "GENERAL",
                      "visibility": "PUBLIC",
                      "pinned": false,
                      "notifyOnPublish": false
                    }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("공지 작성 시 title 이 비어 있으면 400 을 반환한다")
    void createNoticeWithBlankTitleReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "",
                      "summary": "요약입니다",
                      "content": "본문 내용입니다",
                      "coverImageUrl": "https://example.com/cover.png",
                      "category": "GENERAL",
                      "visibility": "PUBLIC",
                      "pinned": false,
                      "notifyOnPublish": false
                    }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}

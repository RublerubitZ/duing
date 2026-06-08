package com.duing.domain.notice;

import static org.hamcrest.Matchers.equalTo;

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
class NoticePublicAcceptanceTest extends IntegrationTestBase {

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
    @DisplayName("비로그인 사용자도 PUBLIC 공지 피드를 200 으로 조회할 수 있다")
    void anonymousCanFetchPublicFeed() {
        seedPublicNotice("Public 1");
        seedPublicNotice("Public 2");

        RestAssured.given()
            .when()
                .get("/api/v1/notices")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true));
    }

    @Test
    @DisplayName("OFFICERS_ALL 공지에 일반 STUDENT 가 직접 진입하면 403 을 받는다")
    void studentForbiddenOnOfficersOnlyDetail() {
        Long noticeId = seedOfficersAllNotice();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/notices/" + noticeId)
            .then()
                .statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ---- seeders via admin POST ----

    private void seedPublicNotice(String title) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title":"%s", "summary":"요약", "content":"본문",
                      "coverImageUrl":"https://example.com/c.png",
                      "category":"GENERAL", "visibility":"PUBLIC",
                      "pinned":false, "notifyOnPublish":false }
                    """.formatted(title))
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value());
    }

    private Long seedOfficersAllNotice() {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title":"운영진 공지", "summary":"요약", "content":"본문",
                      "coverImageUrl":"https://example.com/c.png",
                      "category":"GENERAL", "visibility":"OFFICERS_ALL",
                      "pinned":false, "notifyOnPublish":true }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}

package com.duing.domain.notice;

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
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "duing.notice.cover-image-url-prefix=https://storage.duing.test/")
class NoticeBodyImageUrlValidationTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
    }

    @Test
    @DisplayName("허용 prefix 밖의 본문 이미지 URL 이 포함되면 400 을 반환한다")
    void bodyImageUrlOutsideAllowedPrefixReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "행사", "summary": "요약", "content": "본문",
                      "coverImageUrl": "https://storage.duing.test/notice/cover/c.png",
                      "category": "FAIR", "visibility": "PUBLIC",
                      "pinned": false, "notifyOnPublish": false,
                      "bodyImageUrls": ["https://evil.example.com/track.png"]
                    }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("허용 prefix 의 본문 이미지 URL 만 있으면 201 로 생성된다")
    void bodyImageUrlsWithinAllowedPrefixAreAccepted() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "행사", "summary": "요약", "content": "본문",
                      "coverImageUrl": "https://storage.duing.test/notice/cover/c.png",
                      "category": "FAIR", "visibility": "PUBLIC",
                      "pinned": false, "notifyOnPublish": false,
                      "bodyImageUrls": ["https://storage.duing.test/notice/body/b1.png"]
                    }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value());
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}

package com.duing.domain.file;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.file.FileUploadPolicy;
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
class FileApiTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String token;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        long unique = sequence.getAndIncrement();
        User user = userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                "파일테스터",
                "file-test-" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.JUNIOR,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
        token = jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private byte[] bytesOfSize(int size) {
        return new byte[size];
    }

    @Test
    @DisplayName("정상 JPG 가 5MB 미만이면 201 과 URL 을 반환한다")
    void uploadsValidJpeg() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "sample.jpg", bytesOfSize(1024), "image/jpeg")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("data.url", org.hamcrest.Matchers.notNullValue());
    }

    @Test
    @DisplayName("정확히 5MB 인 JPG 는 통과한다")
    void uploadsAtMaxBoundary() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "max.jpg", bytesOfSize((int) FileUploadPolicy.MAX_BYTES), "image/jpeg")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("data.url", org.hamcrest.Matchers.notNullValue());
    }

    @Test
    @DisplayName("5MB + 1 byte 를 넘으면 400 과 한국어 메시지를 반환한다")
    void rejectsOversizedFile() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "oversize.jpg", bytesOfSize((int) FileUploadPolicy.MAX_BYTES + 1), "image/jpeg")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", org.hamcrest.Matchers.containsString("5MB"));
    }

    @Test
    @DisplayName("image/gif 는 400 으로 거부된다")
    void rejectsGif() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "sample.gif", bytesOfSize(1024), "image/gif")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", org.hamcrest.Matchers.containsString("지원하지 않는"));
    }

    @Test
    @DisplayName("image/bmp 는 400 으로 거부된다")
    void rejectsBmp() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "sample.bmp", bytesOfSize(1024), "image/bmp")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", org.hamcrest.Matchers.containsString("지원하지 않는"));
    }

    @Test
    @DisplayName("Content-Type 헤더가 application/octet-stream 이면 400 으로 거부된다")
    void rejectsUnknownContentType() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "blob", bytesOfSize(1024), "application/octet-stream")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", org.hamcrest.Matchers.containsString("지원하지 않는"));
    }

    @Test
    @DisplayName("Content-Type 이 누락된 multipart 파트는 400 으로 거부된다")
    void rejectsMissingContentType() {
        // 비정상 API 호출 (curl / 외부 클라이언트) 방어. RestAssured 의 multiPart 오버로드는
        // contentType 인자 없이 호출하면 서버에 application/octet-stream 또는 빈 값으로 전달된다.
        // 둘 다 ALLOWED_MIME_TYPES 에 포함되지 않으므로 400 이 정상 응답.
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "no-content-type", bytesOfSize(1024))
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", org.hamcrest.Matchers.containsString("지원하지 않는"));
    }

    @Test
    @DisplayName("PROMOTION_REQUEST_BANNER purpose 로 정상 JPG 를 업로드하면 promotion-request/banner directory 의 URL 을 반환한다")
    void uploadsPromotionRequestBanner() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "banner.jpg", bytesOfSize(1024), "image/jpeg")
                    .queryParam("purpose", "PROMOTION_REQUEST_BANNER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("data.url", org.hamcrest.Matchers.containsString("promotion-request/banner"));
    }
}

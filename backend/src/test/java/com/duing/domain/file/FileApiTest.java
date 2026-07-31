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

    // 유효한 JPEG 매직 바이트(FF D8 FF)로 시작하는 더미 이미지 — 매직 바이트 검증을 통과한다.
    private byte[] jpegBytesOfSize(int size) {
        byte[] bytes = new byte[size];
        bytes[0] = (byte) 0xFF;
        bytes[1] = (byte) 0xD8;
        bytes[2] = (byte) 0xFF;
        return bytes;
    }

    // 유효한 PNG 매직 바이트(89 50 4E 47 0D 0A 1A 0A)로 시작하는 더미 이미지.
    private byte[] pngBytesOfSize(int size) {
        byte[] bytes = new byte[size];
        byte[] signature = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
        System.arraycopy(signature, 0, bytes, 0, signature.length);
        return bytes;
    }

    // 유효한 WEBP 컨테이너 시그니처("RIFF" + 크기 4바이트 + "WEBP")로 시작하는 더미 이미지.
    private byte[] webpBytesOfSize(int size) {
        byte[] bytes = new byte[size];
        byte[] signature = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'};
        System.arraycopy(signature, 0, bytes, 0, signature.length);
        return bytes;
    }

    @Test
    @DisplayName("정상 JPG 가 5MB 미만이면 201 과 URL 을 반환한다")
    void uploadsValidJpeg() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "sample.jpg", jpegBytesOfSize(1024), "image/jpeg")
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
                    .multiPart("file", "max.jpg", jpegBytesOfSize((int) FileUploadPolicy.MAX_BYTES), "image/jpeg")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("data.url", org.hamcrest.Matchers.notNullValue());
    }

    @Test
    @DisplayName("5MB + 1 byte 를 넘으면 413 과 한국어 메시지를 반환한다")
    void rejectsOversizedFile() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "oversize.jpg", bytesOfSize((int) FileUploadPolicy.MAX_BYTES + 1), "image/jpeg")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.PAYLOAD_TOO_LARGE.value())
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
                    .multiPart("file", "banner.jpg", jpegBytesOfSize(1024), "image/jpeg")
                    .queryParam("purpose", "PROMOTION_REQUEST_BANNER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("data.url", org.hamcrest.Matchers.containsString("promotion-request/banner"));
    }

    @Test
    @DisplayName("Content-Type 이 image/png 라도 실제 바이트가 이미지가 아니면 매직 바이트 검증으로 400 거부된다")
    void rejectsSpoofedImageBytes() {
        byte[] htmlBytes = "<html><script>alert(1)</script></html>".getBytes();
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "evil.png", htmlBytes, "image/png")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", org.hamcrest.Matchers.containsString("지원하지 않는"));
    }

    @Test
    @DisplayName("매직 바이트가 유효한 PNG 를 업로드하면 201 과 png 확장자 URL 을 반환한다")
    void uploadsValidPng() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "sample.png", pngBytesOfSize(1024), "image/png")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("data.url", org.hamcrest.Matchers.endsWith(".png"));
    }

    @Test
    @DisplayName("매직 바이트가 유효한 WEBP 를 업로드하면 201 과 webp 확장자 URL 을 반환한다")
    void uploadsValidWebp() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "sample.webp", webpBytesOfSize(1024), "image/webp")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("data.url", org.hamcrest.Matchers.endsWith(".webp"));
    }

    @Test
    @DisplayName("스크립트가 담긴 SVG 는 Content-Type 이 image/svg+xml 이어도 400 으로 거부된다")
    void rejectsSvgUpload() {
        byte[] svgBytes =
                "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".getBytes();
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "evil.svg", svgBytes, "image/svg+xml")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", org.hamcrest.Matchers.containsString("지원하지 않는"));
    }

    @Test
    @DisplayName("확장자와 Content-Type 을 함께 이미지로 위조한 HTML 파일도 매직 바이트 검증으로 400 거부된다")
    void rejectsHtmlDisguisedAsJpeg() {
        byte[] htmlBytes = "<html><script>alert(1)</script></html>".getBytes();
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "photo.jpg", htmlBytes, "image/jpeg")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", org.hamcrest.Matchers.containsString("지원하지 않는"));
    }

    @Test
    @DisplayName("서블릿 멀티파트 한도를 넘는 파일은 컨트롤러에 닿기 전 413 으로 거부된다")
    void rejectsBeyondServletMultipartLimit() {
        // 멀티파트 파서는 본문을 읽기 전에 Content-Length 를 한도와 먼저 대조해 거부하므로 컨트롤러까지
        // 오지 않고 GlobalExceptionHandler 가 413 으로 변환한다. 한도는 운영 10MB / 테스트 프로파일 6MB 라
        // 이 크기는 양쪽 모두를 넘는다.
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "huge.jpg", jpegBytesOfSize(10 * 1024 * 1024 + 1), "image/jpeg")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.PAYLOAD_TOO_LARGE.value());
    }
}

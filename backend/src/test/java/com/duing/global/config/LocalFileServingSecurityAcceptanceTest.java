package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * 비밀문의 첨부(federation/inquiry)가 로컬 정적 서빙(GET /files/**)으로 익명 노출되지 않는지 검증한다
 * (codex adversarial review 반영).
 *
 * <p>test 프로파일 기본 스토리지는 stub(no-op) 이라 실제 정적 리소스 핸들러(LocalFileServingConfig)가
 * 비활성이다 — {@code @DynamicPropertySource} 로 {@code file.storage.provider} 를 stub 에서 local 로
 * 덮어써(S3FileStorageIntegrationTest 전례) 실제 디스크에 파일을 쓰고 실제 서빙 경로를 태운다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LocalFileServingSecurityAcceptanceTest extends IntegrationTestBase {

    // static @TempDir 는 JUnit 이 @DynamicPropertySource(컨텍스트 로드)보다 먼저 주입하고 클래스 종료 후
    // 자동 삭제한다 — 수동 createTempDirectory 는 정리가 안 돼 잔여물이 쌓인다(LocalFileStorageServiceTest 전례).
    @TempDir
    static Path uploadDir;

    @DynamicPropertySource
    static void overrideProps(DynamicPropertyRegistry registry) {
        registry.add("file.storage.provider", () -> "local");
        registry.add("file.upload-dir", () -> uploadDir.toString());
    }

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User student = userRepository.save(UserFixture.unique());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("업로드된 federation/inquiry 첨부의 공개 URL을 익명으로 직접 GET하면 401로 차단된다")
    void anonymousDirectGetOnInquiryAttachmentIsBlocked() {
        String attachmentUrl = uploadFile("FEDERATION_INQUIRY");

        Response response = RestAssured.given().when().get(attachmentUrl);

        // denyAll() 은 익명 사용자에겐 ExceptionTranslationFilter 가 인증 시작(401)으로 처리한다 —
        // permitAll 로 열려 있던 이전 동작(200)과의 회귀를 실제 값으로 고정한다.
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("업로드된 federation/inquiry 첨부의 공개 URL은 로그인한 사용자라도 직접 GET하면 차단된다(200이 아니다)")
    void authenticatedDirectGetOnInquiryAttachmentIsBlocked() {
        String attachmentUrl = uploadFile("FEDERATION_INQUIRY");

        Response response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(attachmentUrl);

        // denyAll() 은 인증 여부와 무관하게 항상 거부한다 — "로그인만 하면 우회 가능"이 아니라 이 경로
        // 자체가 항상 막혀 있음을 고정한다. AuthorizationFilter 단계의 거부는 AccessDeniedHandler(403)로
        // 가지만, sendError 이후 컨테이너의 /error 재디스패치에서 OncePerRequestFilter 규약상
        // JwtAuthenticationFilter 가 ERROR dispatch 를 건너뛰어 익명으로 재평가되며 실제로는 401 로 수렴한다
        // (별개의 기존 이슈). 이 테스트가 고정해야 할 불변식은 그 정확한 상태 코드가 아니라 "어느 경로든
        // 200 이 아니다" 이므로, 그 재디스패치 동작이 나중에 바뀌어 403 이 되더라도 깨지지 않게 값 자체가
        // 아닌 "200 아님"만 단언한다.
        assertThat(response.statusCode()).isNotEqualTo(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("대조군 — club/logo 등 다른 purpose 로 업로드된 파일의 공개 URL은 익명으로도 그대로 접근 가능하다")
    void anonymousCanStillAccessOtherPurposePublicUrl() {
        String logoUrl = uploadFile("LOGO");

        Response response = RestAssured.given().when().get(logoUrl);

        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.contentType()).isEqualTo("image/jpeg");
    }

    // 유효한 JPEG 매직 바이트(FF D8 FF)로 시작하는 더미 이미지 — 매직 바이트 검증을 통과한다.
    private byte[] jpegBytesOfSize(int size) {
        byte[] bytes = new byte[size];
        bytes[0] = (byte) 0xFF;
        bytes[1] = (byte) 0xD8;
        bytes[2] = (byte) 0xFF;
        return bytes;
    }

    private String uploadFile(String purpose) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .multiPart("file", "photo.jpg", jpegBytesOfSize(1024), "image/jpeg")
                .queryParam("purpose", purpose)
            .when()
                .post("/api/v1/files")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getString("data.url");
    }
}

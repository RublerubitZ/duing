package com.duing.global.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RequestBodySizeLimitIntegrationTest extends IntegrationTestBase {

    // duing.request.max-body-bytes 기본값 — 테스트 application.yml 은 이 값을 바꾸지 않는다.
    private static final long MAX_BODY_BYTES = 2_097_152L;

    @LocalServerPort int port;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("chunked 로 보낸 2MB 초과 JSON 은 413 이다")
    void chunkedJsonOverLimitIsRejected() throws Exception {
        HttpResponse<String> response = postChunkedJson(MAX_BODY_BYTES + 1);

        assertThat(response.statusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE.value());
        assertThat(response.body()).contains(RequestBodyTooLargeException.MESSAGE);
    }

    @Test
    @DisplayName("chunked 로 정확히 2MB 인 JSON 은 크기 상한에 걸리지 않는다")
    void chunkedJsonAtLimitPassesSizeGate() throws Exception {
        HttpResponse<String> response = postChunkedJson(MAX_BODY_BYTES);

        // 학번 형식 검증(400)까지 갔다 = 크기 상한(413)을 통과했다.
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("업로드 외 경로에 3MB 멀티파트를 보내면 413 이다")
    void multipartToNonUploadPathIsRejected() {
        RestAssured.given()
                .multiPart("file", "big.bin", new byte[3 * 1024 * 1024], "application/octet-stream")
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.PAYLOAD_TOO_LARGE.value());
    }

    // 정확히 totalBytes 바이트인 유효 JSON — 쓰레기 바이트는 Jackson 이 첫 토큰에서 400 을 내 크기 판정에 닿지 않는다.
    private HttpResponse<String> postChunkedJson(long totalBytes) throws Exception {
        String prefix = "{\"studentId\":\"";
        String suffix = "\",\"password\":\"x\"}";
        String json = prefix + "1".repeat((int) totalBytes - prefix.length() - suffix.length()) + suffix;
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/auth/login"))
                .header("Content-Type", "application/json")
                // 길이를 모르는 InputStream 공급자 → HTTP/1.1 chunked 전송
                .POST(HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body)))
                .build();
        // 기본 HTTP_2 는 h2c Upgrade 헤더를 붙인다 — HTTP/1.1 로 고정해 chunked 전송을 결정적으로 만든다.
        try (HttpClient httpClient = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build()) {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}

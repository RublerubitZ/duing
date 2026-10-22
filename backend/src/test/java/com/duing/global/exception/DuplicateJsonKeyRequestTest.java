package com.duing.global.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

/**
 * 요청 본문 JSON 에 같은 키가 두 번 오면 500 이 아니라 400 으로 거절하는지(#1488) — 실제 Boot ObjectMapper 설정을 타야 해서
 * standalone MockMvc 가 아니라 서버를 띄워 공개 POST(로그인, 5필드 레코드)로 확인한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DuplicateJsonKeyRequestTest extends IntegrationTestBase {

    private static final String UNREADABLE_BODY = "요청 본문을 해석할 수 없습니다.";

    @LocalServerPort int port;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("같은 키가 두 번 오면 위치와 상관없이 400 '요청 본문을 해석할 수 없습니다.' 이고, 정상 본문은 해석된다")
    void duplicateKeysAreRejectedAs400() {
        // 레코드 생성자 인자를 다 채운 뒤 반복 — Jackson 이 InvalidDefinitionException 을 내 500 으로 새던 경우
        Response trailingDuplicate = login("""
                {"studentId":"20991234","password":"x","deviceLabel":null,"platform":"WEB","rememberMe":false,"password":"y"}""");
        // 앞쪽 반복 — 지금까지는 조용히 뒤 값으로 처리되던 경우
        Response leadingDuplicate = login("""
                {"studentId":"20991234","studentId":"20991235","password":"x"}""");
        // 대조 — 중복 없는 본문은 해석돼 검증 단계까지 간다(학번 형식 오류라 로그인 처리·잠금에는 닿지 않는다)
        Response wellFormed = login("""
                {"studentId":"abc","password":"x"}""");

        assertThat(List.of(describe(trailingDuplicate), describe(leadingDuplicate), describe(wellFormed)))
                .containsExactly(
                        "400 " + UNREADABLE_BODY,
                        "400 " + UNREADABLE_BODY,
                        "400 studentId: 학번은 8자리 숫자여야 합니다.");
    }

    private Response login(String body) {
        return RestAssured.given()
                .contentType(ContentType.JSON)
                .body(body)
                .when()
                .post("/api/v1/auth/login");
    }

    private static String describe(Response response) {
        return response.statusCode() + " " + response.jsonPath().getString("message");
    }
}

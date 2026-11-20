package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.LoggerFactory;
import org.slf4j.bridge.SLF4JBridgeHandler;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RejectedAccessTokenAcceptanceTest extends IntegrationTestBase {

    private static final String PUBLIC_GET_PATH = "/api/v1/notices";
    private static final String PROTECTED_GET_PATH = "/api/v1/users/me";
    // RANDOM_PORT 라 포트 번호 대신 Tomcat 요청 스레드 이름 앞부분으로 요청 처리 중 남은 로그만 고른다.
    // 가상 스레드를 켜면 요청 스레드 이름이 바뀌므로 이 값도 함께 바꾼다 — 그대로 두면 'ERROR 없음' 단언이 늘 통과한다.
    private static final String REQUEST_THREAD_PREFIX = "http-nio-";
    private static final String TOMCAT_CONTAINER_LOGGER = "org.apache.catalina.core.ContainerBase";
    private static final String TOKEN_SIGNED_WITH_ANOTHER_SECRET = JWT.create().withSubject("1")
            .sign(Algorithm.HMAC256("another-jwt-secret-that-is-at-least-thirty-two-bytes"));

    @LocalServerPort int port;

    @Autowired JwtTokenProvider jwtTokenProvider;

    private final Logger rootLogger = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
    private final ListAppender<ILoggingEvent> logAppender = new ListAppender<>();
    private Object originalVerifier;
    private String captureCheckMarker;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        originalVerifier = ReflectionTestUtils.getField(jwtTokenProvider, "verifier");
        // 다른 테스트 컨텍스트가 닫히면 Spring Boot 가 JVM 전역 JUL→SLF4J 다리를 걷어 낸다 — 컨텍스트가 하나뿐인 운영처럼 다리를 둔다.
        if (!SLF4JBridgeHandler.isInstalled()) {
            SLF4JBridgeHandler.removeHandlersForRootLogger();
            SLF4JBridgeHandler.install();
        }
        logAppender.start();
        rootLogger.addAppender(logAppender);
        // Tomcat 은 JUL 로 로그를 남긴다 — 같은 길로 표지를 남겨 이 appender 가 Tomcat 의 ERROR 를 받을 수 있는지 먼저 본다.
        captureCheckMarker = "log-capture-check-" + UUID.randomUUID();
        java.util.logging.Logger.getLogger(TOMCAT_CONTAINER_LOGGER).severe(captureCheckMarker);
    }

    @AfterEach
    void tearDown() {
        // 컨텍스트 캐시를 다른 테스트와 나눠 쓰므로 바꾼 검증기를 원래 것으로 되돌린다 — setUp 전에 실패했으면 건드리지 않는다.
        if (originalVerifier != null) {
            ReflectionTestUtils.setField(jwtTokenProvider, "verifier", originalVerifier);
        }
        rootLogger.detachAppender(logAppender);
    }

    static Stream<Arguments> rejectionCases() {
        return Stream.of(
                Arguments.of(Named.of("검증기가 검증 예외가 아닌 런타임 예외를 던지는 경우", true)),
                Arguments.of(Named.of("다른 키로 서명한 토큰", false)));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rejectionCases")
    @DisplayName("거부되는 Bearer 토큰으로 공개 GET 을 부르면 ERROR 로그 없이 익명으로 200 을 받는다")
    void publicGetWithRejectedBearerTokenPassesAsAnonymous(boolean verifierThrowsRuntimeException) {
        Response response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + rejectedToken(verifierThrowsRuntimeException))
                .when().get(PUBLIC_GET_PATH);

        assertNoErrorLoggedWhileServingRequest();
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rejectionCases")
    @DisplayName("거부되는 access 쿠키로 공개 GET 을 부르면 ERROR 로그 없이 익명으로 200 을 받는다")
    void publicGetWithRejectedAccessCookiePassesAsAnonymous(boolean verifierThrowsRuntimeException) {
        Response response = RestAssured.given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, rejectedToken(verifierThrowsRuntimeException))
                .when().get(PUBLIC_GET_PATH);

        assertNoErrorLoggedWhileServingRequest();
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rejectionCases")
    @DisplayName("거부되는 Bearer 토큰으로 보호 GET 을 부르면 ERROR 로그 없이 인증 필요 401 을 받는다")
    void protectedGetWithRejectedBearerTokenIsUnauthorized(boolean verifierThrowsRuntimeException) {
        Response response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + rejectedToken(verifierThrowsRuntimeException))
                .when().get(PROTECTED_GET_PATH);

        assertNoErrorLoggedWhileServingRequest();
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("message"))
                .isEqualTo(JwtAuthenticationEntryPoint.UNAUTHENTICATED_MESSAGE);
    }

    private String rejectedToken(boolean verifierThrowsRuntimeException) {
        if (verifierThrowsRuntimeException) {
            JWTVerifier throwingVerifier = mock(JWTVerifier.class);
            when(throwingVerifier.verify(anyString())).thenThrow(new IllegalStateException("verifier failure"));
            ReflectionTestUtils.setField(jwtTokenProvider, "verifier", throwingVerifier);
        }
        return TOKEN_SIGNED_WITH_ANOTHER_SECRET;
    }

    private void assertNoErrorLoggedWhileServingRequest() {
        // 요청 스레드가 같은 appender 에 쓰는 중일 수 있어 appender 잠금 안에서 복사본을 뜬다.
        List<ILoggingEvent> capturedEvents;
        synchronized (logAppender) {
            capturedEvents = List.copyOf(logAppender.list);
        }
        // 표지가 잡혀야 아래 'ERROR 없음' 이 빈 목록으로 늘 통과하지 않는다.
        assertThat(capturedEvents)
                .anyMatch(logEvent -> logEvent.getLevel() == Level.ERROR
                        && captureCheckMarker.equals(logEvent.getFormattedMessage()))
                .noneMatch(logEvent -> logEvent.getLevel() == Level.ERROR
                        && logEvent.getThreadName().startsWith(REQUEST_THREAD_PREFIX));
    }
}

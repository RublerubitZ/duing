package com.duing.global;

import static io.restassured.RestAssured.given;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.service.PhoneVerificationRateLimiter;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

/**
 * 프록시 체인에서 클라이언트 IP 가 어떻게 결정되는지 고정한다 — 모든 IP 레이트리밋의 전제다.
 *
 * <p>운영 체인은 Cloudflare → Caddy → Tomcat 이고, {@code application-prod.yml} 의
 * {@code forward-headers-strategy: native} 가 톰캣 {@code RemoteIpValve} 를 켠다. 이 밸브는 TCP 피어가
 * 신뢰 프록시({@code internalProxies} 기본값 = 사설 대역)일 때만 {@code X-Forwarded-For} 를 반영하고,
 * <b>오른쪽 끝부터</b> 신뢰 대역이 아닌 첫 값을 {@code getRemoteAddr()} 로 삼는다.
 *
 * <p>그래서 <b>Caddy 가 XFF 에 무엇을 넣느냐가 클라이언트 IP 를 결정한다.</b> Caddy 는 신뢰 프록시로
 * 선언되지 않은 피어가 보낸 XFF 를 폐기하고 피어 IP 로 갈아끼우므로, {@code trusted_proxies} 에
 * Cloudflare 대역이 없으면 XFF 에 <b>Cloudflare 엣지 IP</b> 가 실려 전 사용자가 한 버킷을 공유한다
 * (2026-08-30 발견 — {@code deploy/Caddyfile} 참조).
 *
 * <p>테스트는 RestAssured 가 127.0.0.1(사설 대역 = 신뢰 프록시)에서 붙으므로 운영의 Caddy 자리를
 * 그대로 재현한다. 레이트리밋 버킷을 오라클로 써서 "무엇이 클라이언트 IP 가 됐는지"를 관측한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.forward-headers-strategy=native")
class ForwardedClientIpTest extends IntegrationTestBase {

    private static final String REAL_CLIENT_IP = "203.0.113.7";
    private static final String OTHER_CLIENT_IP = "198.51.100.9";

    @LocalServerPort
    private int port;

    @Autowired
    private PhoneVerificationRateLimiter rateLimiter;

    private final AtomicLong sequence = new AtomicLong(0);

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        rateLimiter.reset();
    }

    @Test
    @DisplayName("신뢰 프록시가 넣은 X-Forwarded-For 가 클라이언트 IP 가 된다 — 값이 다르면 IP 리밋 버킷도 분리된다")
    void forwardedForBecomesClientIp() {
        fillIssueWindow(REAL_CLIENT_IP);

        issue(REAL_CLIENT_IP)
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value());
        // XFF 가 무시된다면 모든 요청이 127.0.0.1 한 버킷을 쓰므로 여기서도 429 가 난다.
        issue(OTHER_CLIENT_IP)
                .then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("X-Forwarded-For 가 여러 값이면 맨 오른쪽이 클라이언트 IP 가 된다 — Caddy 가 실사용자 IP 하나만 넣어야 하는 이유")
    void rightmostForwardedForEntryWins() {
        // 운영에서 Cloudflare 가 "실사용자, CF엣지" 를 보내면 오른쪽(CF 엣지)이 클라이언트 IP 가 됐다.
        fillIssueWindow(OTHER_CLIENT_IP + ", " + REAL_CLIENT_IP);

        // 오른쪽 값만으로 보낸 요청이 429 라면, 앞의 60건이 그 값으로 집계됐다는 뜻이다.
        issue(REAL_CLIENT_IP)
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value());
    }

    private void fillIssueWindow(String forwardedFor) {
        // 발급 IP 분당 한도(60)는 다른 패키지의 package-private 상수라 형제 테스트처럼 리터럴로 맞춘다.
        for (int attempt = 0; attempt < 60; attempt++) {
            issue(forwardedFor)
                    .then().statusCode(HttpStatus.CREATED.value());
        }
    }

    private Response issue(String forwardedFor) {
        return given().contentType(ContentType.JSON)
                .header("X-Forwarded-For", forwardedFor)
                .body(Map.of("phone", uniquePhone()))
                .when().post("/api/v1/auth/phone-verifications");
    }

    /** 번호별 60초 쿨다운·(번호,IP) 시간당 5회에 걸리지 않도록 매번 다른 번호를 쓴다. */
    private String uniquePhone() {
        long serial = sequence.incrementAndGet();
        return "010-%04d-%04d".formatted(serial / 10000 % 10000, serial % 10000);
    }
}

package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.exception.PhoneVerificationException;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.MoPollThrottle;
import com.duing.domain.user.service.PhoneVerificationRateLimiter;
import com.duing.global.mo.StubMoVerificationClient;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthPhoneVerificationTest extends IntegrationTestBase {

    private static final String PHONE = "010-1234-5678";
    private static final int SESSION_VALIDITY_SECONDS = (int) PhoneVerification.VALIDITY.getSeconds();

    @LocalServerPort
    private int port;

    @Autowired
    private StubMoVerificationClient stubMoClient;

    @Autowired
    private PhoneVerificationRateLimiter rateLimiter;

    @Autowired
    private MoPollThrottle moPollThrottle;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PhoneVerificationRepository phoneVerificationRepository;

    @Autowired
    private PhoneVerificationEventRepository phoneVerificationEventRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private Clock clock;

    // 가입 사용자·발급 번호 유일성 보장용 시퀀스.
    private final AtomicLong sequence = new AtomicLong(0);

    private record IssuedSession(String token, String code) {}

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // @SpringBootTest 컨텍스트 공유로 in-memory 상태가 누적되므로 테스트마다 초기화한다.
        rateLimiter.reset();
        moPollThrottle.reset();
        stubMoClient.clear();
    }

    private IssuedSession issue(String phone) {
        JsonPath issueBody = given().contentType(ContentType.JSON).body(Map.of("phone", phone))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath();
        return new IssuedSession(
                issueBody.getString("data.verificationToken"), issueBody.getString("data.code"));
    }

    /** 수신 시뮬레이션 — 서비스가 하이픈을 제거해 조회하므로 스텁에도 숫자만으로 등록한다. */
    private void registerInbound(String phone, String code) {
        stubMoClient.registerInboundMessage(phone.replace("-", ""), code);
    }

    /** 상태 조회는 토큰이 URL 에 남지 않도록 POST body 로 보낸다(#626). */
    private Response requestStatus(String token) {
        return given().contentType(ContentType.JSON).body(Map.of("verificationToken", token))
                .when().post("/api/v1/auth/phone-verifications/status");
    }

    private String getStatus(String token) {
        return requestStatus(token)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath().getString("data.status");
    }

    /** 스로틀(2.5초) 대기 없이 다음 폴링이 Octomo 를 조회하게 한다. */
    private String getStatusAfterThrottleReset(String token) {
        moPollThrottle.reset();
        return getStatus(token);
    }

    private void bypassCooldown(String phone) {
        jdbcTemplate.update("UPDATE phone_verifications SET last_issued_at = ? WHERE phone = ?",
                LocalDateTime.now().minusMinutes(2), phone);
    }

    private void saveRegisteredUser(String phone) {
        long seq = sequence.incrementAndGet();
        userRepository.save(User.create(
                String.valueOf(20250000 + seq), "가입자" + seq, "h",
                UserRole.STUDENT, Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터정보공학부",
                phone, LocalDateTime.now()));
    }

    private String uniquePhone() {
        return String.format("010-9%03d-0000", sequence.incrementAndGet());
    }

    @Test
    @DisplayName("발급 응답에는 토큰·8자 코드·수신 대표번호·만료 정보가 담기고 QR 미요청 시 qrCode 는 null 이다")
    void issueReturnsSessionPayload() {
        JsonPath issueBody = given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.moNumber", equalTo("16663538"))
                .body("data.expiresInSeconds", equalTo(SESSION_VALIDITY_SECONDS))
                .extract().jsonPath();

        assertThat(issueBody.getString("data.verificationToken")).hasSize(36);
        assertThat(issueBody.getString("data.code")).matches("^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$");
        assertThat(issueBody.getString("data.qrCode")).isNull();
    }

    @Test
    @DisplayName("qr=true 로 발급하면 QR data URL 이 함께 반환된다")
    void issueWithQrReturnsDataUrl() {
        given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                .when().post("/api/v1/auth/phone-verifications?qr=true")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.qrCode", equalTo(StubMoVerificationClient.STUB_QR_DATA_URL));
    }

    @Test
    @DisplayName("전화번호 형식이 올바르지 않으면 400 을 반환한다")
    void invalidPhoneFormatReturnsBadRequest() {
        given().contentType(ContentType.JSON).body(Map.of("phone", "01012345678"))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("이미 가입된 번호로 발급을 요청하면 409 와 PHONE_ALREADY_REGISTERED 를 반환한다")
    void registeredPhoneReturnsConflict() {
        String registeredPhone = uniquePhone();
        saveRegisteredUser(registeredPhone);

        given().contentType(ContentType.JSON).body(Map.of("phone", registeredPhone))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("PHONE_ALREADY_REGISTERED"));
    }

    @Test
    @DisplayName("문자가 아직 수신되지 않았으면 PENDING 과 마스킹 번호·남은 시간이 반환된다")
    void statusStaysPendingWithoutInbound() {
        IssuedSession session = issue(PHONE);

        requestStatus(session.token())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("PENDING"))
                .body("data.maskedPhone", equalTo("010-****-5678"))
                .body("data.expiresInSeconds", lessThanOrEqualTo(SESSION_VALIDITY_SECONDS));
    }

    @Test
    @DisplayName("발급 코드가 선언 번호에서 수신되면 VERIFIED 로 바뀌고 재조회해도 VERIFIED 다 (멱등)")
    void statusBecomesVerifiedAfterInbound() {
        IssuedSession session = issue(PHONE);
        registerInbound(PHONE, session.code());

        assertThat(getStatus(session.token())).isEqualTo("VERIFIED");
        assertThat(getStatus(session.token())).isEqualTo("VERIFIED");
    }

    @Test
    @DisplayName("다른 코드가 수신돼도 PENDING 을 유지한다")
    void wrongCodeStaysPending() {
        IssuedSession session = issue(PHONE);
        registerInbound(PHONE, "AAAAAAAA");

        assertThat(getStatus(session.token())).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("같은 코드라도 다른 번호에서 수신되면 PENDING 을 유지한다 — 번호 대조는 Octomo(exists 쌍 확인) 소관")
    void inboundFromDifferentPhoneStaysPending() {
        IssuedSession session = issue(PHONE);
        registerInbound("010-9999-9999", session.code());

        assertThat(getStatus(session.token())).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("세션 만료 후에는 문자가 수신돼 있어도 EXPIRED 이며 남은 시간은 0 이다")
    void expiredSessionReturnsExpired() {
        IssuedSession session = issue(PHONE);
        registerInbound(PHONE, session.code());
        jdbcTemplate.update("UPDATE phone_verifications SET expires_at = ? WHERE token = ?",
                LocalDateTime.now().minusMinutes(1), session.token());

        requestStatus(session.token())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("EXPIRED"))
                .body("data.expiresInSeconds", equalTo(0));
    }

    @Test
    @DisplayName("인증 후 완료 창(SIGNUP 30분)이 지나면 EXPIRED 로 판정된다 — 재인증 유도")
    void verifiedSessionExpiresAfterCompletionWindow() {
        IssuedSession session = issue(PHONE);
        registerInbound(PHONE, session.code());
        assertThat(getStatus(session.token())).isEqualTo("VERIFIED");

        jdbcTemplate.update("UPDATE phone_verifications SET verified_at = ? WHERE token = ?",
                LocalDateTime.now().minusMinutes(31), session.token());

        assertThat(getStatus(session.token())).isEqualTo("EXPIRED");
    }

    @Test
    @DisplayName("존재하지 않는 토큰 조회는 404 와 PHONE_VERIFICATION_NOT_FOUND 를 반환한다")
    void unknownTokenReturnsNotFound() {
        requestStatus("no-such-token")
                .then().statusCode(HttpStatus.NOT_FOUND.value())
                .body("code", equalTo("PHONE_VERIFICATION_NOT_FOUND"));
    }

    @Test
    @DisplayName("빈 토큰으로 상태 조회를 요청하면 400 과 인증 토큰 필수 안내를 반환한다")
    void blankTokenReturnsBadRequest() {
        given().contentType(ContentType.JSON).body(Map.of("verificationToken", ""))
                .when().post("/api/v1/auth/phone-verifications/status")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                // 검증 실패 메시지는 "{필드}: {메시지}" 로 조립되므로 containsString 으로 대조한다.
                .body("message", org.hamcrest.Matchers.containsString("인증 토큰은 필수 입력값입니다."));
    }

    @Test
    @DisplayName("같은 번호의 성공 발급이 시간당 5회에 이르면 6번째는 쿨다운과 구분되는 429 코드로 거절된다")
    void issuePhoneHourlyLimitBlocksSixthIssue() {
        for (int issued = 0; issued < 5; issued++) {
            issue(PHONE);
            bypassCooldown(PHONE);
        }
        given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("PHONE_ISSUE_LIMIT_EXCEEDED"));
    }

    @Test
    @DisplayName("60초 쿨다운 내 재발급은 429, 쿨다운 후 재발급은 새 토큰·새 코드를 발급하고 구 토큰·구 코드를 무효화한다")
    void reissueInvalidatesOldSession() {
        IssuedSession firstSession = issue(PHONE);

        given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("PHONE_VERIFICATION_COOLDOWN"));

        bypassCooldown(PHONE);
        IssuedSession secondSession = issue(PHONE);
        assertThat(secondSession.token()).isNotEqualTo(firstSession.token());
        assertThat(secondSession.code()).isNotEqualTo(firstSession.code());

        // 구 토큰은 즉시 무효(404), 구 코드가 수신돼도 새 세션은 PENDING 을 유지한다.
        requestStatus(firstSession.token())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        registerInbound(PHONE, firstSession.code());
        assertThat(getStatus(secondSession.token())).isEqualTo("PENDING");

        // 새 코드가 수신되면 인증된다.
        registerInbound(PHONE, secondSession.code());
        assertThat(getStatusAfterThrottleReset(secondSession.token())).isEqualTo("VERIFIED");
    }

    @Test
    @DisplayName("세션당 2.5초 스로틀 — 직전 폴링 직후의 재조회는 Octomo 를 건너뛰어 PENDING 을 유지한다")
    void throttleSkipsImmediateSecondPoll() {
        IssuedSession session = issue(PHONE);
        assertThat(getStatus(session.token())).isEqualTo("PENDING"); // 스로틀 슬롯 소비

        registerInbound(PHONE, session.code());
        assertThat(getStatus(session.token())).isEqualTo("PENDING"); // 스로틀에 막혀 미조회

        assertThat(getStatusAfterThrottleReset(session.token())).isEqualTo("VERIFIED");
    }

    @Test
    @DisplayName("같은 IP 의 발급 요청이 분당 한도(10회)를 넘으면 429 와 VERIFICATION_RATE_LIMITED 를 반환한다")
    void issueIpRateLimitReturnsTooManyRequests() {
        for (int attempt = 0; attempt < 10; attempt++) {
            issue(uniquePhone());
        }
        given().contentType(ContentType.JSON).body(Map.of("phone", uniquePhone()))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
    }

    @Test
    @DisplayName("같은 IP 의 상태 조회가 백스톱 한도를 넘으면 429 와 VERIFICATION_RATE_LIMITED 를 반환한다 — 존재하지 않는 토큰이어도 IP 리밋이 404 조회보다 먼저 걸린다")
    void statusIpRateLimitReturnsTooManyRequests() {
        // 상태조회는 IP 리밋 기록이 토큰 조회(404)보다 먼저라, 미존재 토큰도 창을 소비한다.
        // (토큰 창은 404 뒤라 설치되지 않는다 — 랜덤 토큰이 맵을 증식시키지 못하게 하는 순서다.)
        for (int attempt = 0; attempt < 500; attempt++) {
            requestStatus("no-such-token")
                    .then().statusCode(HttpStatus.NOT_FOUND.value());
        }
        requestStatus("no-such-token")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
    }

    @Test
    @DisplayName("한 세션의 상태 조회가 분당 한도(30회)를 넘으면 429 와 VERIFICATION_RATE_LIMITED 를 반환한다")
    void statusTokenRateLimitReturnsTooManyRequests() {
        IssuedSession session = issue(PHONE);

        for (int attempt = 0; attempt < 30; attempt++) {
            requestStatus(session.token())
                    .then().statusCode(HttpStatus.OK.value());
        }
        requestStatus(session.token())
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
    }

    @Test
    @DisplayName("Octomo 일일 호출 상한을 소진하면 상태 조회가 503 과 SMS_POLL_QUOTA_EXCEEDED 를 반환한다")
    void dailyQuotaExhaustedReturnsServiceUnavailable() {
        IssuedSession session = issue(PHONE);
        exhaustDailyQuota();

        requestStatus(session.token())
                .then().statusCode(HttpStatus.SERVICE_UNAVAILABLE.value())
                .body("code", equalTo("SMS_POLL_QUOTA_EXCEEDED"));
    }

    private void exhaustDailyQuota() {
        LocalDateTime now = LocalDateTime.now(clock);
        try {
            while (true) {
                moPollThrottle.reserveDailyQuota(now);
            }
        } catch (PhoneVerificationException.SmsPollQuotaExceededException quotaExhausted) {
            // 한도 도달 — 의도된 종료.
        }
    }

    @Test
    @DisplayName("인증 성공 시 VERIFIED 감사 이벤트가 번호·용도와 함께 기록된다")
    void verifiedEventIsRecorded() {
        IssuedSession session = issue(PHONE);
        registerInbound(PHONE, session.code());
        assertThat(getStatus(session.token())).isEqualTo("VERIFIED");

        Integer verifiedEventCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM phone_verification_events "
                        + "WHERE phone = ? AND purpose = 'SIGNUP' AND event_type = 'VERIFIED'",
                Integer.class, PHONE);
        assertThat(verifiedEventCount).isEqualTo(1);
    }

    @Test
    @DisplayName("qr=true 발급은 실제 옥토모 콜이므로 일일 쿼터를 1건 소비한다 — 무계상 우회 방지")
    void qrIssuanceConsumesDailyQuota() {
        given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                .when().post("/api/v1/auth/phone-verifications?qr=true")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.qrCode", equalTo(StubMoVerificationClient.STUB_QR_DATA_URL));

        assertThat(moPollThrottle.consumedDailyCalls()).isEqualTo(1);
    }

    @Test
    @DisplayName("일일 쿼터 소진 시 qr=true 발급은 실패하지 않고 qrCode=null 텍스트 폴백으로 강등된다")
    void qrIssuanceDegradesGracefullyWhenQuotaExhausted() {
        exhaustDailyQuota();

        given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                .when().post("/api/v1/auth/phone-verifications?qr=true")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.qrCode", equalTo(null))
                .body("data.code", org.hamcrest.Matchers.notNullValue());
    }

    @Test
    @DisplayName("옥토모 장애 중의 폴링은 PENDING 을 유지하고 일일 쿼터를 소진하지 않는다 — 복구 후 정상 인증")
    void providerOutageDoesNotDrainDailyQuota() {
        IssuedSession session = issue(PHONE);
        stubMoClient.failExists(true);

        assertThat(getStatus(session.token())).isEqualTo("PENDING");
        // 예약했던 쿼터가 실패 경로에서 반환됐다 — 장애가 하루 예산을 태우지 않는다.
        assertThat(moPollThrottle.consumedDailyCalls()).isZero();

        stubMoClient.failExists(false);
        registerInbound(PHONE, session.code());
        assertThat(getStatusAfterThrottleReset(session.token())).isEqualTo("VERIFIED");
        assertThat(moPollThrottle.consumedDailyCalls()).isEqualTo(1); // 성공 콜만 소비된다.
    }

    @Test
    @DisplayName("같은 번호의 동시 발급 요청은 한 건만 성공하고 나머지는 쿨다운(429)으로 수렴한다 — 세션 행 1개 보장")
    void concurrentIssueCreatesSingleSession() throws InterruptedException {
        int threadCount = 5;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch readyLatch = new CountDownLatch(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        List<Integer> statusCodes = Collections.synchronizedList(new ArrayList<>());
        for (int thread = 0; thread < threadCount; thread++) {
            executor.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    statusCodes.add(given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                            .when().post("/api/v1/auth/phone-verifications").getStatusCode());
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            });
        }
        readyLatch.await();
        startLatch.countDown();
        executor.shutdown();
        assertThat(executor.awaitTermination(30, TimeUnit.SECONDS)).isTrue();

        // insert race 패자는 unique 위반 → 429, 잠금 대기자는 쿨다운 재평가 → 429 (spec §9.5).
        assertThat(statusCodes).hasSize(threadCount);
        assertThat(statusCodes.stream().filter(statusCode -> statusCode == 201).count()).isEqualTo(1);
        assertThat(statusCodes.stream().filter(statusCode -> statusCode == 429).count())
                .isEqualTo(threadCount - 1L);
        Integer sessionCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM phone_verifications WHERE phone = ?", Integer.class, PHONE);
        assertThat(sessionCount).isEqualTo(1);
    }

    @Test
    @Transactional // @Modifying 네이티브 삭제 쿼리는 트랜잭션이 필요하다 (운영은 PiiRetentionJob 의 @Transactional).
    @DisplayName("만료 후 24시간 지난 인증 세션만 물리 삭제된다 — PII 파기")
    void purgeDeletesOnlyStaleSessions() {
        LocalDateTime now = LocalDateTime.now();
        insertSessionRow("010-9801-0000", "stale-token", now.minusDays(2));
        insertSessionRow("010-9802-0000", "fresh-token", now.plusMinutes(5));

        int deletedCount = phoneVerificationRepository.deleteExpiredVerifications(now.minusDays(1));

        assertThat(deletedCount).isEqualTo(1);
        assertThat(phoneVerificationRepository.findByToken("fresh-token")).isPresent();
        assertThat(phoneVerificationRepository.findByToken("stale-token")).isEmpty();
    }

    @Test
    @Transactional
    @DisplayName("45일 지난 감사 이벤트만 물리 삭제된다 — PII 파기")
    void purgeDeletesOnlyStaleEvents() {
        LocalDateTime now = LocalDateTime.now();
        insertEventRow("010-9803-0000", now.minusDays(46));
        insertEventRow("010-9804-0000", now.minusDays(1));

        int deletedCount = phoneVerificationEventRepository.deleteExpiredEvents(now.minusDays(45));

        assertThat(deletedCount).isEqualTo(1);
        Integer remainingCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM phone_verification_events", Integer.class);
        assertThat(remainingCount).isEqualTo(1);
    }

    private void insertSessionRow(String phone, String token, LocalDateTime expiresAt) {
        jdbcTemplate.update(
                "INSERT INTO phone_verifications "
                        + "(phone, token, purpose, expires_at, last_issued_at, created_at, updated_at) "
                        + "VALUES (?, ?, 'SIGNUP', ?, NOW(), NOW(), NOW())",
                phone, token, expiresAt);
    }

    private void insertEventRow(String phone, LocalDateTime createdAt) {
        jdbcTemplate.update(
                "INSERT INTO phone_verification_events (phone, purpose, event_type, created_at) "
                        + "VALUES (?, 'SIGNUP', 'VERIFIED', ?)",
                phone, createdAt);
    }
}

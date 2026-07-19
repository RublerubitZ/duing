package com.duing.domain.user.service;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.RefreshTokenStatus;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthRefreshConcurrencyTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";
    private static final String ALLOWED_ORIGIN = "http://localhost:3000";

    @LocalServerPort int port;
    @Autowired AuthSessionService authSessionService;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired AuthRefreshTokenRepository authRefreshTokenRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired LoginAttemptRateLimiter loginAttemptRateLimiter;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        loginAttemptRateLimiter.reset();
    }

    private User saveUser() {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%08d", unique % 100_000_000L), "동시성테스터",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT, Grade.JUNIOR,
                College.IT_ENGINEERING, "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    private IssuedSession issueFor(Long userId) {
        return authSessionService.issue(new IssueSessionCommand(
                userId, SessionPlatform.WEB, null, null, "127.0.0.1", false));
    }

    /** 스레드 전원을 latch 로 정렬해 같은 순간에 작업을 실행시키고 예외를 수집한다. */
    private List<Throwable> runConcurrently(int threadCount, Runnable action) throws InterruptedException {
        ExecutorService executorService = Executors.newFixedThreadPool(threadCount);
        CountDownLatch readyLatch = new CountDownLatch(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        for (int i = 0; i < threadCount; i++) {
            executorService.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    action.run();
                } catch (Throwable throwable) {
                    failures.add(throwable);
                } finally {
                    doneLatch.countDown();
                }
            });
        }
        assertThat(readyLatch.await(10, TimeUnit.SECONDS)).isTrue();
        startLatch.countDown();
        assertThat(doneLatch.await(30, TimeUnit.SECONDS)).as("동시 작업이 제한시간 안에 끝나야 한다(데드락 의심)").isTrue();
        executorService.shutdownNow();
        return List.copyOf(failures);
    }

    @Test
    @DisplayName("같은 리프레시 토큰의 동시 갱신 2건은 모두 성공하고 세션은 살아있으며 ACTIVE 토큰은 정확히 1개다")
    void twoConcurrentRotationsOfSameTokenBothSucceed() throws InterruptedException {
        Long userId = saveUser().getId();
        IssuedSession issuedSession = issueFor(userId);

        List<Throwable> failures = runConcurrently(2,
                () -> authSessionService.rotate(issuedSession.refreshToken()));

        assertThat(failures).as("동시 탭 경합은 grace latest-wins 로 흡수되어야 한다(오탐 금지)").isEmpty();
        assertThat(authSessionRepository.findById(issuedSession.sessionId()).orElseThrow().getRevokedAt()).isNull();
        assertThat(authRefreshTokenRepository.findBySessionIdOrderByIdAsc(issuedSession.sessionId())
                .stream().filter(token -> token.getStatus() == RefreshTokenStatus.ACTIVE)).hasSize(1);
    }

    @Test
    @DisplayName("같은 리프레시 토큰의 동시 갱신 8건에서도 세션 생존·ACTIVE 1개 불변식이 유지된다")
    void eightConcurrentRotationsKeepInvariants() throws InterruptedException {
        Long userId = saveUser().getId();
        IssuedSession issuedSession = issueFor(userId);

        List<Throwable> failures = runConcurrently(8,
                () -> authSessionService.rotate(issuedSession.refreshToken()));

        assertThat(failures).isEmpty();
        assertThat(authSessionRepository.findById(issuedSession.sessionId()).orElseThrow().getRevokedAt()).isNull();
        long activeCount = authRefreshTokenRepository.findBySessionIdOrderByIdAsc(issuedSession.sessionId())
                .stream().filter(token -> token.getStatus() == RefreshTokenStatus.ACTIVE).count();
        assertThat(activeCount).isEqualTo(1);
    }

    @Test
    @DisplayName("세션 4개 상태의 동시 로그인 2건 후에도 활성 세션은 상한 5를 넘지 않는다")
    void concurrentLoginsNeverExceedSessionLimit() throws InterruptedException {
        User user = saveUser();
        for (int i = 0; i < 4; i++) {
            issueFor(user.getId());
        }

        List<Throwable> failures = runConcurrently(2, () ->
                given().contentType(ContentType.JSON)
                        .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                        .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                        .when().post("/api/v1/auth/web/login")
                        .then().statusCode(HttpStatus.OK.value()));

        assertThat(failures).isEmpty();
        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .as("user 행잠금이 동시 로그인을 직렬화해 상한 5를 보장해야 한다")
                .hasSize(5);
    }
}

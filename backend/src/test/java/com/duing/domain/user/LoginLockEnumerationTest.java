package com.duing.domain.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.LoginAttemptRateLimiter;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * 로그인 응답(상태 코드·문구)만으로 학번의 가입 여부를 가릴 수 없는지 검증한다(#1321 L-4) — 실계정은 5회 실패 뒤
 * 잠겨 429 를 받으므로, 미가입 학번도 같은 순서·같은 분포로 응답해야 한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LoginLockEnumerationTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Password123!";
    private static final String UNKNOWN_STUDENT_ID = "20991234"; // TRUNCATE 뒤라 존재하지 않는 학번

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired LoginAttemptRateLimiter loginAttemptRateLimiter;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        loginAttemptRateLimiter.reset();
    }

    // IP 실패 창은 IntegrationTestBase 가 비우지 않는다 — 여기서 쌓은 실패(최대 10건)가 1분 안에 도는 다른 클래스의
    // 정상 로그인을 429 로 떨어뜨리지 않게 끝나면 비운다.
    @AfterEach
    void clearLoginFailureWindow() {
        loginAttemptRateLimiter.reset();
    }

    @Test
    @DisplayName("가입되지 않은 학번도 실존 계정과 같은 순서로 401 다섯 번 뒤 429 를 받는다")
    void unknownStudentIdGetsSameSequentialLockoutAsRealAccount() {
        List<String> realAccountResponses = failLoginSequentially(saveUserWithPassword(), 6);
        loginAttemptRateLimiter.reset();
        List<String> unknownStudentResponses = failLoginSequentially(UNKNOWN_STUDENT_ID, 6);

        assertThat(realAccountResponses.subList(0, 5)).allMatch(response -> response.startsWith("401 "));
        assertThat(realAccountResponses.get(5)).startsWith("429 ");
        assertThat(unknownStudentResponses).containsExactlyElementsOf(realAccountResponses);
    }

    @Test
    @DisplayName("같은 학번으로 동시에 10번 틀려도 실계정과 미가입 학번의 응답 분포가 같다")
    void concurrentFailuresProduceSameDistributionForRealAndUnknown() throws Exception {
        List<String> realAccountResponses = failLoginConcurrently(saveUserWithPassword(), 10);
        loginAttemptRateLimiter.reset();
        List<String> unknownStudentResponses = failLoginConcurrently(UNKNOWN_STUDENT_ID, 10);

        assertThat(realAccountResponses).filteredOn(response -> response.startsWith("401 ")).hasSize(5);
        assertThat(realAccountResponses).filteredOn(response -> response.startsWith("429 ")).hasSize(5);
        assertThat(unknownStudentResponses).containsExactlyInAnyOrderElementsOf(realAccountResponses);
    }

    private List<String> failLoginSequentially(String studentId, int attempts) {
        List<String> responses = new ArrayList<>();
        for (int attempt = 0; attempt < attempts; attempt++) {
            responses.add(failLogin(studentId));
        }
        return responses;
    }

    private List<String> failLoginConcurrently(String studentId, int attempts) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(attempts);
        CountDownLatch ready = new CountDownLatch(attempts);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<String>> futures = new ArrayList<>();
        try {
            for (int attempt = 0; attempt < attempts; attempt++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    start.await();
                    return failLogin(studentId);
                }));
            }
            ready.await();
            start.countDown(); // 모든 스레드를 동시에 발사한다
            List<String> responses = new ArrayList<>();
            for (Future<String> future : futures) {
                responses.add(future.get());
            }
            return responses;
        } finally {
            pool.shutdown();
            pool.awaitTermination(30, TimeUnit.SECONDS);
        }
    }

    // 상태 코드와 응답 문구 — 열거 판별에 쓰일 수 있는 두 값을 한 문자열로 비교한다.
    private String failLogin(String studentId) {
        Response response = RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId, "password", "wrong-password-1!"))
                .when().post("/api/v1/auth/login");
        return response.statusCode() + " " + response.jsonPath().getString("message");
    }

    private String saveUserWithPassword() {
        long seq = sequence.incrementAndGet();
        String studentId = String.format("%08d", seq % 100_000_000L);
        userRepository.save(User.create(
                studentId, "U" + seq,
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
        return studentId;
    }
}

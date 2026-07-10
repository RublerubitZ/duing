package com.duing.domain.user;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import static org.assertj.core.api.Assertions.assertThat;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * 로그인 레이트리밋이 실패만 카운트해, 같은 IP 를 공유하는 정상 사용자의 반복 로그인(성공)은 막지 않고
 * 스프레잉(다수 실패)만 차단하는지 검증한다. RestAssured 요청은 모두 로컬 IP 하나를 공유하므로, 교내
 * NAT 처럼 한 IP 뒤에서 다수가 로그인하는 상황을 재현한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LoginRateLimitAcceptanceTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Password123!";
    // 리미터의 분당 실패 한도(LoginAttemptRateLimiter.PER_MINUTE_LIMIT = 10, package-private 라 직접
    // 참조 불가)를 확실히 넘기는 고정 횟수. 정확한 경계값은 LoginAttemptRateLimiterTest 가 검증한다.
    private static final int ATTEMPTS_OVER_LIMIT = 12;

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired LoginAttemptRateLimiter loginAttemptRateLimiter;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // 리미터는 in-memory 싱글턴이라 테스트 간 카운터가 누수된다 — DB TRUNCATE 와 별개로 초기화한다.
        loginAttemptRateLimiter.reset();
    }

    @Test
    @DisplayName("같은 IP 에서 성공 로그인을 분당 한도보다 많이 반복해도 429로 막히지 않는다")
    void repeatedSuccessfulLoginsFromSameIpAreNotRateLimited() {
        String studentId = saveUserWithPassword();

        for (int attempt = 0; attempt < ATTEMPTS_OVER_LIMIT; attempt++) {
            RestAssured.given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("studentId", studentId, "password", RAW_PASSWORD))
                    .when().post("/api/v1/auth/login")
                    .then().statusCode(HttpStatus.OK.value());
        }
    }

    @Test
    @DisplayName("같은 IP 에서 실패 로그인이 누적되면 이후 시도는 429로 차단된다")
    void repeatedFailedLoginsFromSameIpAreRateLimited() {
        // 존재하지 않는 계정으로 스프레잉 — 계정 잠금과 무관하게 IP 실패만 누적시킨다. 첫 시도는 자격 증명
        // 실패(401)로 시작하고, 한도 누적 후에는 429 로 차단되어야 한다(정확한 전환 지점은 단위 테스트 담당).
        int firstStatus = -1;
        int lastStatus = -1;
        for (int attempt = 0; attempt < ATTEMPTS_OVER_LIMIT; attempt++) {
            Response response = RestAssured.given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("studentId", String.format("%08d", 90_000_000L + attempt), "password", "wrong-password"))
                    .when().post("/api/v1/auth/login");
            if (attempt == 0) {
                firstStatus = response.statusCode();
            }
            lastStatus = response.statusCode();
        }

        assertThat(firstStatus).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(lastStatus).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
    }

    @Test
    @DisplayName("같은 IP 에서 서로 다른 사용자가 동시에 성공 로그인해도(공유 IP 피크) 아무도 429로 막히지 않는다")
    void concurrentSuccessfulLoginsFromSharedIpAreNotRateLimited() throws Exception {
        // 분당 한도(10)보다 많은 사용자가 한 IP 에서 동시에 성공 로그인한다. 성공을 카운트하는 구현
        // (구 코드나 예약-복원 방식)이었다면 일부가 429 가 됐을 시나리오다 — 검사·기록 분리(성공 미기록)로
        // 동시성에서도 성공이 막히지 않음을 실스레드로 검증한다.
        int userCount = 20; // 분당 실패 한도(10)를 확실히 넘기는 동시 사용자 수
        List<String> studentIds = new ArrayList<>();
        for (int index = 0; index < userCount; index++) {
            studentIds.add(saveUserWithPassword());
        }

        ExecutorService pool = Executors.newFixedThreadPool(userCount);
        CountDownLatch ready = new CountDownLatch(userCount);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> statuses = new ArrayList<>();
        try {
            for (String studentId : studentIds) {
                statuses.add(pool.submit(() -> {
                    ready.countDown();
                    start.await();
                    return RestAssured.given()
                            .contentType(ContentType.JSON)
                            .body(Map.of("studentId", studentId, "password", RAW_PASSWORD))
                            .when().post("/api/v1/auth/login")
                            .statusCode();
                }));
            }
            ready.await();
            start.countDown(); // 모든 스레드를 동시에 발사한다

            for (Future<Integer> status : statuses) {
                assertThat(status.get()).isEqualTo(HttpStatus.OK.value());
            }
        } finally {
            pool.shutdown();
            pool.awaitTermination(30, TimeUnit.SECONDS);
        }
    }

    @Test
    @DisplayName("같은 IP 에서 실패 로그인이 동시에 몰려도 정확히 한도만큼만 허용되고 초과분은 429로 차단된다")
    void concurrentFailedLoginsFromSameIpAreCappedAtTheLimit() throws Exception {
        // 분당 실패 한도(LoginAttemptRateLimiter.PER_MINUTE_LIMIT = 10). 초과분이 동시에 몰려도, 원자적
        // 검사·기록(recordFailureOrThrow)이 윈도우를 한도로 고정하므로 정확히 한도만큼만 401(자격 증명
        // 실패)로 기록되고 나머지는 429 가 된다. 이른 검사만 있던 구현이라면 동시 요청이 모두 401 로
        // 빠져나가 한도를 동시성 수준만큼 초과했을 시나리오다.
        int expectedRecorded = 10;
        int totalRequests = expectedRecorded * 2;

        ExecutorService pool = Executors.newFixedThreadPool(totalRequests);
        CountDownLatch ready = new CountDownLatch(totalRequests);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> statuses = new ArrayList<>();
        try {
            for (int index = 0; index < totalRequests; index++) {
                String studentId = String.format("%08d", 90_000_000L + index); // 존재하지 않는 계정 — 계정 잠금과 무관
                statuses.add(pool.submit(() -> {
                    ready.countDown();
                    start.await();
                    return RestAssured.given()
                            .contentType(ContentType.JSON)
                            .body(Map.of("studentId", studentId, "password", "wrong-password"))
                            .when().post("/api/v1/auth/login")
                            .statusCode();
                }));
            }
            ready.await();
            start.countDown();

            long recorded = 0;
            long blocked = 0;
            for (Future<Integer> status : statuses) {
                int code = status.get();
                if (code == HttpStatus.UNAUTHORIZED.value()) {
                    recorded++;
                } else if (code == HttpStatus.TOO_MANY_REQUESTS.value()) {
                    blocked++;
                }
            }
            assertThat(recorded).isEqualTo(expectedRecorded);
            assertThat(blocked).isEqualTo(totalRequests - expectedRecorded);
        } finally {
            pool.shutdown();
            pool.awaitTermination(30, TimeUnit.SECONDS);
        }
    }

    private String saveUserWithPassword() {
        long seq = sequence.incrementAndGet();
        String studentId = String.format("%08d", seq % 100_000_000L);
        userRepository.save(User.create(
                studentId, "U" + seq, "u" + seq + "@daegu.ac.kr",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
        return studentId;
    }
}

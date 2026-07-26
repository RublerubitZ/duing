package com.duing.domain.user.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.AuthSessionService;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminUserStatusControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired AdminUserActionLogRepository actionLogRepository;
    @Autowired AuthSessionService authSessionService;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private String adminToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        adminToken = tokenFor(adminUser);
    }

    @Test
    @DisplayName("계정을 정지하면 204 가 반환되고 대상의 기존 토큰이 무효화되며 감사 로그가 1건 남는다")
    void suspendRevokesTokenAndWritesLog() {
        User target = saveUser("정지대상", UserRole.STUDENT);
        String targetToken = tokenFor(target);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"SUSPENDED","reason":"커뮤니티 신고 3건 누적"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + targetToken)
                .when().get("/api/v1/users/me")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        List<AdminUserActionLog> logs = actionLogRepository.findAll();
        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).getAction()).isEqualTo(AdminUserAction.ACCOUNT_SUSPENDED);
        assertThat(logs.get(0).getReason()).isEqualTo("커뮤니티 신고 3건 누적");
        assertThat(logs.get(0).getActorUserId()).isEqualTo(adminUser.getId());
    }

    @Test
    @DisplayName("정지는 즉시 집행된다 — token_version 이 올라가고 기존 리프레시 토큰의 갱신도 401 로 막힌다")
    void suspendBumpsTokenVersionAndRevokesRefreshSession() {
        User target = saveUser("즉시집행대상", UserRole.STUDENT);
        int tokenVersionBeforeSuspend = target.getTokenVersion();
        IssuedSession issuedSession = authSessionService.issue(new IssueSessionCommand(
                target.getId(), SessionPlatform.WEB, null, null, "127.0.0.1", false));

        suspendVia(target, "즉시 집행 확인");

        // 인증 필터의 정지 계정 차단과 무관하게, token_version 자체가 올라가야 정지 이전 액세스 토큰이 죽는다.
        assertThat(userRepository.findById(target.getId()).orElseThrow().getTokenVersion())
                .isEqualTo(tokenVersionBeforeSuspend + 1);

        // 세션을 폐기하지 않으면 리프레시 회전이 TTL 을 계속 연장해 정지 계정 세션이 영원히 살아남는다.
        RestAssured.given()
                .contentType("application/json")
                .body("{\"refreshToken\":\"%s\"}".formatted(issuedSession.refreshToken()))
                .when().post("/api/v1/auth/refresh")
                .then()
                .statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("code", Matchers.equalTo("AUTH_SESSION_EXPIRED"));
    }

    @Test
    @DisplayName("이미 정지된 계정을 다시 정지하면 204 를 반환하되 감사 로그를 남기지 않는다")
    void repeatedSuspendIsNoOp() {
        User target = saveUser("중복정지", UserRole.STUDENT);
        suspendVia(target, "1차 사유");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"SUSPENDED","reason":"2차 사유"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(actionLogRepository.findAll()).hasSize(1);
    }

    @Test
    @DisplayName("같은 계정에 정지 요청 2건이 동시에 들어와도 감사 로그는 1건만 남는다")
    void concurrentSuspendWritesSingleLog() throws InterruptedException {
        User target = saveUser("동시정지", UserRole.STUDENT);

        List<Throwable> failures = runConcurrently(2, () ->
                RestAssured.given()
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                        .contentType("application/json")
                        .body("""
                                {"status":"SUSPENDED","reason":"동시 요청"}
                                """)
                        .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                        .then().statusCode(HttpStatus.NO_CONTENT.value()));

        assertThat(failures).isEmpty();
        assertThat(actionLogRepository.findAll())
                .as("행잠금이 없으면 두 요청이 모두 ACTIVE 를 읽어 조치 이력이 2건으로 부풀어 오른다")
                .hasSize(1);
    }

    @Test
    @DisplayName("정지를 해제하면 상태가 정상으로 돌아가고 해제 사유가 감사 로그에 남는다")
    void unsuspendWritesLog() {
        User target = saveUser("해제대상", UserRole.STUDENT);
        suspendVia(target, "정지 사유");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"ACTIVE","reason":"이의 제기 수용"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(userRepository.findById(target.getId()).orElseThrow().isActive()).isTrue();
        assertThat(actionLogRepository.findAll())
                .extracting(AdminUserActionLog::getAction)
                .containsExactly(AdminUserAction.ACCOUNT_SUSPENDED, AdminUserAction.ACCOUNT_UNSUSPENDED);
    }

    @Test
    @DisplayName("잘못 정지된 ADMIN 계정도 해제할 수 있다")
    void suspendedAdminCanBeUnsuspended() {
        User suspendedAdmin = saveUser("정지된관리자", UserRole.ADMIN);
        suspendedAdmin.suspend();
        userRepository.saveAndFlush(suspendedAdmin);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"ACTIVE","reason":"오조치 정정"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", suspendedAdmin.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 보호 정책을 해제 경로에까지 걸면 잘못 정지된 관리자를 아무도 풀어줄 수 없게 된다.
        assertThat(userRepository.findById(suspendedAdmin.getId()).orElseThrow().isActive()).isTrue();
        assertThat(actionLogRepository.findAll())
                .extracting(AdminUserActionLog::getAction)
                .containsExactly(AdminUserAction.ACCOUNT_UNSUSPENDED);
    }

    @Test
    @DisplayName("사유 없이 상태를 변경하면 400 을 반환한다")
    void blankReasonRejected() {
        User target = saveUser("사유누락", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"SUSPENDED","reason":"  "}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("사유가 200자를 넘으면 400 을 반환한다")
    void tooLongReasonRejected() {
        User target = saveUser("사유초과", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("{\"status\":\"SUSPENDED\",\"reason\":\"%s\"}".formatted("가".repeat(201)))
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("관리자가 자기 자신을 정지하려 하면 400 을 반환한다")
    void selfSuspendRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"SUSPENDED","reason":"실수"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", adminUser.getId())
                .then()
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", Matchers.equalTo("SELF_SUSPEND_NOT_ALLOWED"));
    }

    @Test
    @DisplayName("다른 ADMIN 계정을 정지하려 하면 400 을 반환한다")
    void adminSuspendRejected() {
        User otherAdmin = saveUser("다른관리자", UserRole.ADMIN);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"SUSPENDED","reason":"권한 회수"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", otherAdmin.getId())
                .then()
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", Matchers.equalTo("ADMIN_SUSPEND_NOT_ALLOWED"));
    }

    private void suspendVia(User target, String reason) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("{\"status\":\"SUSPENDED\",\"reason\":\"%s\"}".formatted(reason))
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    /** 스레드 전원을 latch 로 정렬해 같은 순간에 요청을 보내고 예외를 수집한다(AuthRefreshConcurrencyTest 전례). */
    private List<Throwable> runConcurrently(int threadCount, Runnable action) throws InterruptedException {
        ExecutorService executorService = Executors.newFixedThreadPool(threadCount);
        CountDownLatch readyLatch = new CountDownLatch(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        for (int index = 0; index < threadCount; index++) {
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
        assertThat(doneLatch.await(30, TimeUnit.SECONDS))
                .as("동시 요청이 제한시간 안에 끝나야 한다(데드락 의심)").isTrue();
        executorService.shutdownNow();
        return List.copyOf(failures);
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name(), user.getTokenVersion());
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.saveAndFlush(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name, "hashed", role, Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터공학",
                "010-" + String.format("%04d", unique % 10000) + "-0000",
                LocalDateTime.now()));
    }
}

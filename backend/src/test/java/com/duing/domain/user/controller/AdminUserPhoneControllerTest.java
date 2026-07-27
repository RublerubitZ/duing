package com.duing.domain.user.controller;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.GeneralAdminUserCommandService;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminUserPhoneControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired AdminUserActionLogRepository actionLogRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        adminToken = tokenFor(adminUser);
        studentToken = tokenFor(saveUser("일반학생", UserRole.STUDENT));
    }

    @Test
    @DisplayName("ADMIN 이 원본 번호를 조회하면 마스킹되지 않은 값이 반환되고 열람 기록이 남는다")
    void revealPhoneWritesAuditLog() {
        User target = saveUser("번호대상", UserRole.STUDENT);

        // 캐시 헤더는 부분 일치가 아니라 값 전체로 본다 — Spring Security 가 인증 응답에 기본으로 붙이는
        // no-cache, no-store, max-age=0, must-revalidate 에도 no-store 가 들어 있어서, 부분 일치로 두면
        // 컨트롤러가 캐시 금지를 지정하지 않아도 초록불이 뜬다. 지키려는 것은 컨트롤러의 지정이다.
        String phone = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}/phone", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .extract().path("data.phone");

        assertThat(phone).isEqualTo(target.getPhone()).doesNotContain("*");
        assertThat(actionLogRepository.findAll())
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getAction()).isEqualTo(AdminUserAction.PHONE_VIEW);
                    assertThat(log.getActorUserId()).isEqualTo(adminUser.getId());
                    assertThat(log.getTargetUserId()).isEqualTo(target.getId());
                    // 번호 값 자체는 어디에도 남기지 않는다.
                    assertThat(log.getReason()).isNull();
                });
    }

    @Test
    @DisplayName("원본 번호 열람은 회원 상세의 최근 운영 기록에 나타나지 않는다")
    void phoneViewHiddenFromOperationTimeline() {
        User target = saveUser("열람숨김", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}/phone", target.getId())
                .then().statusCode(HttpStatus.OK.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then().body("data.recentActions.size()", Matchers.equalTo(0));
    }

    @Test
    @DisplayName("원본 조회 시 누가·누구를 봤는지 구조화 로그로 남긴다 (번호 값은 로그에 없다)")
    void phoneViewWritesStructuredLog() {
        User target = saveUser("로그검증", UserRole.STUDENT);
        Logger serviceLogger = (Logger) LoggerFactory.getLogger(GeneralAdminUserCommandService.class);
        ListAppender<ILoggingEvent> logAppender = new ListAppender<>();
        logAppender.start();
        serviceLogger.addAppender(logAppender);

        try {
            RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .when().get("/api/v1/admin/users/{userId}/phone", target.getId())
                    .then().statusCode(HttpStatus.OK.value());

            // 운영 로그는 감사 테이블보다 접근 통제가 느슨하다 — 열람 사실은 남기되 번호 값은 남기지 않는다.
            assertThat(logAppender.list)
                    .anySatisfy(loggingEvent -> {
                        String message = loggingEvent.getFormattedMessage();
                        assertThat(message).contains("member phone view");
                        assertThat(message).contains("action=PHONE_VIEW");
                        assertThat(message).contains("actorUserId=" + adminUser.getId());
                        assertThat(message).contains("targetUserId=" + target.getId());
                        assertThat(message).doesNotContain(target.getPhone());
                    });
        } finally {
            serviceLogger.detachAppender(logAppender);
        }
    }

    @Test
    @DisplayName("STUDENT 가 원본 번호를 조회하면 403 을 반환한다")
    void studentGetsForbidden() {
        User target = saveUser("권한확인", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/users/{userId}/phone", target.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 회원의 번호를 조회하면 404 를 반환한다")
    void unknownUserReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}/phone", 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
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

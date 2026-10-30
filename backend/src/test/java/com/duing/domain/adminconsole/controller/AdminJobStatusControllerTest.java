package com.duing.domain.adminconsole.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.jobrun.JobRunOutcome;
import com.duing.global.jobrun.JobRunRecorder;
import com.duing.global.jobrun.MonitoredJob;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/** 테스트 설정은 다섯 잡의 플래그가 모두 꺼져 있어(또는 없음) 모든 줄이 DISABLED 다 — 판정 자체는 서비스 단위 테스트가 본다. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminJobStatusControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JobRunRecorder jobRunRecorder;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
    }

    @Test
    @DisplayName("작업 다섯 개를 순서대로 주고, 기록 없는 작업도 값 키를 null 로 남긴다")
    void returnsFiveJobsInOrderWithNullKeysForMissingRuns() {
        jobRunRecorder.record(MonitoredJob.RECRUITMENT_AUTO_CLOSE, Instant.now(clock), JobRunOutcome.SUCCESS, 2, 0);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/job-statuses")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.jobs", hasSize(5))
                    .body("data.jobs.health", everyItem(equalTo("DISABLED")))
                    .body("data.jobs[0].job", equalTo("RECRUITMENT_AUTO_CLOSE"))
                    .body("data.jobs[0].lastFinishedAt", notNullValue())
                    .body("data.jobs[0].lastSucceededAt", notNullValue())
                    .body("data.jobs[0].lastOutcome", equalTo("SUCCESS"))
                    .body("data.jobs[0].resultCount", equalTo(2))
                    .body("data.jobs[0].failedCount", equalTo(0))
                    .body("data.jobs[1].job", equalTo("APPLICATION_PENDING_REMINDER"))
                    .body("data.jobs[1]", hasKey("lastFinishedAt"))
                    .body("data.jobs[1].lastFinishedAt", nullValue())
                    .body("data.jobs[1]", hasKey("lastOutcome"))
                    .body("data.jobs[1].lastOutcome", nullValue())
                    .body("data.jobs[1]", hasKey("resultCount"))
                    .body("data.jobs[1].resultCount", nullValue())
                    .body("data.jobs[2].job", equalTo("FACILITY_RESERVATION_CRAWL"))
                    .body("data.jobs[3].job", equalTo("FACILITY_BOOKING_MATCHING"))
                    .body("data.jobs[4].job", equalTo("FEDERATION_INQUIRY_PURGE"));
    }

    @Test
    @DisplayName("DB 에 지금 모르는 작업 키 줄이 있어도 200 과 다섯 줄을 준다 — 키를 더한 이미지에서 롤백해도 깨지지 않는다")
    void ignoresUnknownJobKeyRows() {
        jdbcTemplate.update("""
                INSERT INTO scheduled_job_run (job_key, last_started_at, last_finished_at, last_outcome,
                        last_result_count, last_failed_count, last_succeeded_at, consecutive_unhealthy_runs)
                VALUES ('RETIRED_JOB', now(), now(), 'SUCCESS', 0, 0, now(), 0)
                """);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/job-statuses")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.jobs", hasSize(5));
    }

    @Test
    @DisplayName("ADMIN 이 아닌 사용자는 자동 작업 상태를 조회할 수 없다")
    void rejectsNonAdminUser() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/admin/job-statuses")
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("로그인하지 않으면 401 이다")
    void rejectsAnonymousUser() {
        RestAssured
                .when()
                    .get("/api/v1/admin/job-statuses")
                .then()
                    .statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}

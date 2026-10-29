package com.duing.domain.adminconsole.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.adminconsole.service.AdminPendingSnapshotRecorder;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.LocalDate;
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
class AdminPendingTrendControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired AdminPendingSnapshotRecorder adminPendingSnapshotRecorder;
    @Autowired JwtTokenProvider jwtTokenProvider;
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
    @DisplayName("지난 13일을 어제까지 오래된 순으로 주고, 기록이 없는 날도 totalPendingCount 키를 null 로 남긴다")
    void returnsThirteenDaysWithNullForMissingDays() {
        LocalDate yesterday = LocalDate.now(clock).minusDays(1);
        adminPendingSnapshotRecorder.record(yesterday, AdminPendingCountsQuery.of(1, 2, 0, 0, 0, 0, 0));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/pending-trend")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.days", hasSize(13))
                    .body("data.days[0].date", equalTo(yesterday.minusDays(12).toString()))
                    .body("data.days[0]", hasKey("totalPendingCount"))
                    .body("data.days[0].totalPendingCount", nullValue())
                    .body("data.days[12].date", equalTo(yesterday.toString()))
                    .body("data.days[12].totalPendingCount", equalTo(3))
                    .body("data.recentFlow.days", equalTo(7))
                    .body("data.recentFlow.receivedCount", equalTo(0))
                    .body("data.recentFlow.handledCount", equalTo(0));
    }

    @Test
    @DisplayName("ADMIN 이 아닌 사용자는 처리 대기 추이를 조회할 수 없다")
    void rejectsNonAdminUser() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/admin/pending-trend")
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }
}

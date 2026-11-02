package com.duing.domain.adminconsole.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
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
class AdminClosingRecruitmentsControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired Clock clock;

    private String adminToken;
    private String studentToken;
    private LocalDate currentMonday;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
        currentMonday = LocalDate.now(clock).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    @Test
    @DisplayName("서버가 정한 이번 주 월요일과 모집 줄을 주고, 외부 폼 모집은 결과 안 정한 지원 수를 null 로 둔다")
    void returnsServerWeekAndRows() {
        recruitmentRepository.save(Recruitment.createWithOptions(clubRepository.save(ClubFixture.academic("외부폼동아리")),
                "외부 폼 모집", null, currentMonday.minusDays(10), currentMonday.plusDays(6), 10, ApplicationMode.EXTERNAL,
                "https://forms.gle/example", false, TargetRole.MEMBER, null, null, false));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/weekly-briefing/closing-recruitments")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.weekStart", equalTo(currentMonday.toString()))
                    .body("data.recruitments", hasSize(1))
                    .body("data.recruitments[0].title", equalTo("외부 폼 모집"))
                    .body("data.recruitments[0].clubName", equalTo("외부폼동아리"))
                    .body("data.recruitments[0].endDate", equalTo(currentMonday.plusDays(6).toString()))
                    .body("data.recruitments[0].applicationMode", equalTo("EXTERNAL"))
                    .body("data.recruitments[0].undecidedApplicationCount", nullValue());
    }

    @Test
    @DisplayName("ADMIN 이 아닌 사용자는 403, 로그인하지 않으면 401 이다")
    void rejectsNonAdminAndAnonymous() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/weekly-briefing/closing-recruitments")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        RestAssured.given()
                .when().get("/api/v1/admin/weekly-briefing/closing-recruitments")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}

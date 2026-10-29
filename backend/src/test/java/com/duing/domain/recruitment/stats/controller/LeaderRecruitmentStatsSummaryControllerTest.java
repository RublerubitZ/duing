package com.duing.domain.recruitment.stats.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.time.TimeMapper;
import io.restassured.RestAssured;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
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
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderRecruitmentStatsSummaryControllerTest extends IntegrationTestBase {

    private static final String SUMMARY_PATH = "/api/v1/leader/recruitments/{recruitmentId}/stats/summary";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Recruitment recruitment;
    private String leaderToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User leaderUser = userRepository.save(UserFixture.unique());
        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());

        // 통계는 운영 행위라 ACTIVE 동아리의 운영진만 본다(ClubAuthService#requireManager).
        Club club = ClubFixture.academic("통계요약동아리-" + sequence.incrementAndGet());
        club.changeStatus(ClubStatus.ACTIVE, null, null);
        Club savedClub = clubRepository.save(club);
        clubMemberRepository.save(ClubMember.asLeader(savedClub, leaderUser));

        recruitment = recruitmentRepository.save(Recruitment.createWithOptions(savedClub, "신입 모집", "내용",
                LocalDate.now(clock).minusDays(30), LocalDate.now(clock).plusDays(7), 10, ApplicationMode.SELF, null,
                false, TargetRole.MEMBER, null, null, false));
    }

    @Test
    @DisplayName("미처리 지원서가 있으면 가장 오래된 미처리 제출 시각을 절대시각으로 돌려준다")
    void returnsOldestPendingSubmittedAt() {
        // 나중에 저장한 지원서가 더 오래됐다 — 저장 순서가 아니라 제출 시각으로 고르는지 본다.
        submittedAgo(saveApplication(), Duration.ofDays(2));
        LocalDateTime oldestSubmittedAt = submittedAgo(saveApplication(), Duration.ofDays(9));

        String oldestPendingSubmittedAt = RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get(SUMMARY_PATH, recruitment.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.submitted", equalTo(2))
                    .extract().path("data.oldestPendingSubmittedAt");

        assertThat(oldestPendingSubmittedAt).as("응답 시각은 …Z 절대시각으로 직렬화한다").endsWith("Z");
        assertThat(Instant.parse(oldestPendingSubmittedAt))
                .as("제출 시각은 감사 필드(system regime)를 절대시각으로 바꾼 값이다")
                .isEqualTo(TimeMapper.systemWallClockToInstant(oldestSubmittedAt));
    }

    @Test
    @DisplayName("미처리 지원서가 없으면 가장 오래된 미처리 제출 시각은 비어 있다")
    void returnsNullWithoutPendingApplications() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get(SUMMARY_PATH, recruitment.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.submitted", equalTo(0))
                    // 키 부재도 JsonPath 로는 null 이라, 필드가 있고 값이 null 인지 따로 본다.
                    .body("data", hasKey("oldestPendingSubmittedAt"))
                    .body("data.oldestPendingSubmittedAt", nullValue());
    }

    private Application saveApplication() {
        return applicationRepository.save(
                Application.submit(recruitment, userRepository.save(UserFixture.unique()), List.of()));
    }

    /** 제출 시각을 과거로 옮기고 그 벽시계를 돌려준다(created_at 은 INSERT 때 @CreatedDate 가 덮어써 JDBC 로 바꾼다). */
    private LocalDateTime submittedAgo(Application application, Duration age) {
        LocalDateTime submittedAt = TimeMapper.systemNow(clock).minus(age).truncatedTo(ChronoUnit.SECONDS);
        jdbcTemplate.update("UPDATE application SET created_at = ? WHERE id = ?",
                Timestamp.valueOf(submittedAt), application.getId());
        return submittedAt;
    }
}

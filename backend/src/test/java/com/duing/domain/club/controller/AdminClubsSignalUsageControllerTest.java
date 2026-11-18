package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubSignalFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.metric.repository.ClubMetricRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.AdminClubSignal;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.time.TimeMapper;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
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

/**
 * 두잉 사용 현황(참고) 신호 — 두잉 기록 없음·운영진 30일 넘게 미접속(스펙 §4-3·§4-4·§10-1).
 * 접속 경계 여유는 ±3시간(< 9시간)이다 — 세션은 seoul 벽시계, 로그인은 system 벽시계로 각각 찍어, 한쪽 regime 을 잘못 쓰면
 * JVM=UTC(CI)에서 9시간 어긋나 경계 동아리가 뒤집힌다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubsSignalUsageControllerTest extends IntegrationTestBase {

    private static final String ADMIN_CLUBS_PATH = "/api/v1/admin/clubs";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired ClubMetricRepository clubMetricRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private String adminToken;
    private LocalDateTime seoulNow;
    private LocalDateTime systemNow;

    @BeforeEach
    void setUp() {
        assumeFalse(LocalTime.now(clock).isAfter(LocalTime.of(23, 58)), "KST 자정 직전에는 날짜 경계 테스트를 건너뛴다");
        RestAssured.port = port;
        User adminUser = userRepository.save(UserFixture.admin());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        seoulNow = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        systemNow = TimeMapper.systemNow(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    @Test
    @DisplayName("두잉 기록 없음은 club_metric 행이 없거나 기록 시각이 비어 있는 운영 중 동아리다")
    void noRecordMeansMissingMetricRowOrNullActivity() {
        Club missingRow = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        Club nullActivity = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.saveMetric(clubMetricRepository, nullActivity, null);
        Club recorded = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.saveMetric(clubMetricRepository, recorded, seoulNow.minusDays(100));
        ClubSignalFixture.saveClub(clubRepository, ClubStatus.INACTIVE);

        assertSignalClubs(AdminClubSignal.NO_RECORD, missingRow, nullActivity);
    }

    @Test
    @DisplayName("운영진 미접속은 회장·임원의 로그인도 세션 사용(폐기 세션 포함)도 30일 안에 없을 때다 — 탈퇴 운영진·일반 부원의 접속은 세지 않는다")
    void operatorInactiveIgnoresWithdrawnOperatorsAndMembers() {
        Club loginOnlyRecent = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.recordLogin(jdbcTemplate, leaderOf(loginOnlyRecent), systemNow.minusDays(1));

        Club sessionOnlyRecent = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        User officer = ClubSignalFixture.saveMember(userRepository, clubMemberRepository, sessionOnlyRecent,
                ClubMemberRole.OFFICER, "세션임원");
        ClubSignalFixture.saveSession(authSessionRepository, officer, seoulNow.minusDays(1), false);

        Club revokedSessionRecent = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.saveSession(authSessionRepository, leaderOf(revokedSessionRecent), seoulNow.minusDays(2), true);

        Club withdrawnOperatorRecent = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        User withdrawnLeader = leaderOf(withdrawnOperatorRecent);
        ClubSignalFixture.recordLogin(jdbcTemplate, withdrawnLeader, systemNow.minusHours(1));
        ClubSignalFixture.saveSession(authSessionRepository, withdrawnLeader, seoulNow.minusHours(1), false);
        ClubSignalFixture.withdraw(jdbcTemplate, withdrawnLeader);

        Club memberOnlyRecent = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        User member = ClubSignalFixture.saveMember(userRepository, clubMemberRepository, memberOnlyRecent,
                ClubMemberRole.MEMBER, "일반부원");
        ClubSignalFixture.recordLogin(jdbcTemplate, member, systemNow.minusHours(1));
        ClubSignalFixture.saveSession(authSessionRepository, member, seoulNow.minusHours(1), false);

        Club noOperator = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        Club operatorWithoutHistory = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        leaderOf(operatorWithoutHistory);

        assertSignalClubs(AdminClubSignal.OPERATOR_INACTIVE,
                withdrawnOperatorRecent, memberOnlyRecent, noOperator, operatorWithoutHistory);
    }

    @Test
    @DisplayName("접속 경계는 로그인(저장 존)·세션(KST) 각자의 지금 − 30일이다 — 3시간 안쪽은 접속, 3시간 바깥은 미접속")
    void operatorInactiveBoundaryInEachRegime() {
        Club loginInside = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.recordLogin(jdbcTemplate, leaderOf(loginInside), systemNow.minusDays(30).plusHours(3));
        Club loginOutside = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.recordLogin(jdbcTemplate, leaderOf(loginOutside), systemNow.minusDays(30).minusHours(3));
        Club sessionInside = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.saveSession(authSessionRepository, leaderOf(sessionInside), seoulNow.minusDays(30).plusHours(3), false);
        Club sessionOutside = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.saveSession(authSessionRepository, leaderOf(sessionOutside), seoulNow.minusDays(30).minusHours(3), false);

        assertSignalClubs(AdminClubSignal.OPERATOR_INACTIVE, loginOutside, sessionOutside);
    }

    @Test
    @DisplayName("운영진 미접속 목록도 회장 이름·학번은 그 동아리 회장이고 행이 겹치지 않는다")
    void operatorInactiveListKeepsLeaderColumns() {
        Club staleClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        User leader = ClubSignalFixture.saveMember(userRepository, clubMemberRepository, staleClub, ClubMemberRole.LEADER, "회장가");
        User officer = ClubSignalFixture.saveMember(userRepository, clubMemberRepository, staleClub, ClubMemberRole.OFFICER, "임원나");
        ClubSignalFixture.recordLogin(jdbcTemplate, leader, systemNow.minusDays(40));
        ClubSignalFixture.saveSession(authSessionRepository, officer, seoulNow.minusDays(40), false);

        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("signal", "OPERATOR_INACTIVE")
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(1))
                .body("data.content[0].id", equalTo(staleClub.getId().intValue()))
                .body("data.content[0].leaderId", equalTo(leader.getId().intValue()))
                .body("data.content[0].leaderName", equalTo("회장가"))
                .body("data.content[0].leaderStudentId", equalTo(leader.getStudentId()));
    }

    private User leaderOf(Club club) {
        return ClubSignalFixture.saveMember(userRepository, clubMemberRepository, club, ClubMemberRole.LEADER, "회장" + club.getId());
    }

    private void assertSignalClubs(AdminClubSignal signal, Club... expectedClubs) {
        Object[] expectedIds = Arrays.stream(expectedClubs).map(expected -> expected.getId().intValue()).toArray();
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("signal", signal.name()).queryParam("size", 100)
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(expectedIds.length))
                .body("data.content.id", containsInAnyOrder(expectedIds));
    }
}

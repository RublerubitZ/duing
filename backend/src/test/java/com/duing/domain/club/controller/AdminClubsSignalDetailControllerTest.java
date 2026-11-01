package com.duing.domain.club.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubSignalFixture;
import com.duing.common.fixture.PendingItemsFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.time.TimeMapper;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import io.restassured.specification.RequestSpecification;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
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

/** 신호 목록 행 재료 signalDetail(스펙 §6-1·§10-1) — 결과 대기·가입 대기 하위 레코드, 운영진 접속, 페이지 재료, 판정↔표시. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubsSignalDetailControllerTest extends IntegrationTestBase {

    private static final String ADMIN_CLUBS_PATH = "/api/v1/admin/clubs";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private String adminToken;
    private LocalDate today;
    private LocalDateTime seoulNow;
    private LocalDateTime systemNow;

    @BeforeEach
    void setUp() {
        assumeFalse(LocalTime.now(clock).isAfter(LocalTime.of(23, 58)), "KST 자정 직전에는 날짜 경계 테스트를 건너뛴다");
        RestAssured.port = port;
        User adminUser = userRepository.save(UserFixture.admin());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        today = LocalDate.now(clock);
        seoulNow = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        systemNow = TimeMapper.systemNow(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    @Test
    @DisplayName("결과 대기 재료는 가장 이른 끝난 날의 모집과 신호 모집 수·결과 미확정 지원 합이다 — 늦은 마감의 끝난 날은 기간 종료일이다")
    void resultWaitingMaterialPicksOldestRecruitmentAndSums() {
        Club club = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        Recruitment lateClosed = ClubSignalFixture.saveClosedRecruitment(recruitmentRepository, club,
                today.minusDays(40), today.minusDays(20), today.atTime(9, 0));
        saveApplication(lateClosed, ApplicationStatus.SUBMITTED);
        saveApplication(lateClosed, ApplicationStatus.ON_HOLD);
        saveApplication(lateClosed, ApplicationStatus.ACCEPTED);
        Recruitment expiredOpen = ClubSignalFixture.saveOpenRecruitment(recruitmentRepository, club,
                today.minusDays(30), today.minusDays(10));
        saveApplication(expiredOpen, ApplicationStatus.INTERVIEW_PENDING);
        // 동아리당 OPEN 모집은 하나(V38 uk_recruitment_club_active) — 최근에 끝난 비신호 모집은 마감 모집으로 둔다(끝난 날 오늘−3)
        Recruitment recentlyEnded = ClubSignalFixture.saveClosedRecruitment(recruitmentRepository, club,
                today.minusDays(30), today.minusDays(3), today.minusDays(3).atTime(12, 0));
        saveApplication(recentlyEnded, ApplicationStatus.SUBMITTED);

        admin().queryParam("signal", "RESULT_WAITING").when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(1))
                .body("data.content[0].signalDetail.resultWaiting.oldestRecruitmentId", equalTo(lateClosed.getId().intValue()))
                .body("data.content[0].signalDetail.resultWaiting.oldestRecruitmentTitle", equalTo(lateClosed.getTitle()))
                .body("data.content[0].signalDetail.resultWaiting.oldestEndedOn", equalTo(today.minusDays(20).toString()))
                .body("data.content[0].signalDetail.resultWaiting.recruitmentCount", equalTo(2))
                .body("data.content[0].signalDetail.resultWaiting.applicationCount", equalTo(3))
                .body("data.content[0].signalDetail", hasKey("joinRequestWaiting"))
                .body("data.content[0].signalDetail.joinRequestWaiting", nullValue());
    }

    @Test
    @DisplayName("끝난 날이 같은 신호 모집이 둘이면 모집 id 가 작은 쪽이 가장 오래된 모집이다")
    void resultWaitingTieBreaksBySmallerRecruitmentId() {
        Club club = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        Recruitment firstSaved = ClubSignalFixture.saveOpenRecruitment(recruitmentRepository, club,
                today.minusDays(30), today.minusDays(15));
        saveApplication(firstSaved, ApplicationStatus.SUBMITTED);
        Recruitment secondSaved = ClubSignalFixture.saveClosedRecruitment(recruitmentRepository, club,
                today.minusDays(30), today.plusDays(5), today.minusDays(15).atTime(12, 0));
        saveApplication(secondSaved, ApplicationStatus.SUBMITTED);

        admin().queryParam("signal", "RESULT_WAITING").when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].signalDetail.resultWaiting.oldestRecruitmentId", equalTo(firstSaved.getId().intValue()))
                .body("data.content[0].signalDetail.resultWaiting.oldestEndedOn", equalTo(today.minusDays(15).toString()))
                .body("data.content[0].signalDetail.resultWaiting.recruitmentCount", equalTo(2));
    }

    @Test
    @DisplayName("가입 대기 재료는 그 동아리 대기 신청 전부의 수(7일 안 신청 포함)와 가장 오래된 신청 시각이다")
    void joinRequestWaitingMaterialCountsAllPendingRequests() {
        Club club = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubJoinCode inviteCode = inviteCode(club);
        LocalDateTime oldestRequestedAt = today.minusDays(9).atTime(12, 0);
        savePendingRequest(club, inviteCode, oldestRequestedAt);
        savePendingRequest(club, inviteCode, today.minusDays(1).atTime(12, 0));
        ClubJoinRequest processedRequest = PendingItemsFixture.saveProcessedJoinRequest(clubJoinRequestRepository, club,
                inviteCode, userRepository.save(UserFixture.unique()), userRepository.save(UserFixture.unique()),
                JoinRequestStatus.APPROVED, LocalDateTime.now(clock));
        ClubSignalFixture.moveRequestedAt(jdbcTemplate, processedRequest, today.minusDays(30).atTime(12, 0));

        JsonPath listed = list(Map.of("signal", "JOIN_REQUEST_WAITING"));

        assertThat(listed.getInt("data.content[0].signalDetail.joinRequestWaiting.requestCount")).isEqualTo(2);
        assertThat(Instant.parse(listed.getString("data.content[0].signalDetail.joinRequestWaiting.oldestRequestedAt")))
                .as("created_at 은 system regime — 응답은 절대시각")
                .isEqualTo(TimeMapper.seoulWallClockToInstant(oldestRequestedAt));
        assertThat(listed.getMap("data.content[0].signalDetail")).containsEntry("resultWaiting", null);
    }

    @Test
    @DisplayName("두잉 기록 없음·운영진 미접속 행은 재료 객체가 있고 두 하위 레코드가 null 이다")
    void usageSignalRowsCarryEmptySubRecords() {
        ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);

        for (String signal : List.of("NO_RECORD", "OPERATOR_INACTIVE")) {
            admin().queryParam("signal", signal).when().get(ADMIN_CLUBS_PATH)
                    .then().statusCode(HttpStatus.OK.value())
                    .body("data.totalElements", equalTo(1))
                    .body("data.content[0].signalDetail", hasKey("operatorsLastActiveAt"))
                    .body("data.content[0].signalDetail.operatorsLastActiveAt", nullValue())
                    .body("data.content[0].signalDetail", hasKey("resultWaiting"))
                    .body("data.content[0].signalDetail.resultWaiting", nullValue())
                    .body("data.content[0].signalDetail", hasKey("joinRequestWaiting"))
                    .body("data.content[0].signalDetail.joinRequestWaiting", nullValue());
        }
    }

    @Test
    @DisplayName("signal 을 보내지 않으면 모든 행의 signalDetail 키가 null 이다 — 옛 백엔드의 키 없음과 구분된다")
    void rowsWithoutSignalCarryNullSignalDetailKey() {
        ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.saveClub(clubRepository, ClubStatus.INACTIVE);

        admin().queryParam("size", 100).when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(2))
                .body("data.content[0]", hasKey("signalDetail"))
                .body("data.content[1]", hasKey("signalDetail"))
                .body("data.content.signalDetail", everyItem(nullValue()));
    }

    @Test
    @DisplayName("재료는 그 페이지 동아리로만 모은다 — 이름순 둘째 동아리를 size=1&page=1 로 받으면 그 동아리 재료다")
    void materialIsCollectedForThePageClubsOnly() {
        Club firstByName = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE, "가신호재료동아리");
        Recruitment firstRecruitment = longEndedRecruitment(firstByName);
        saveApplication(firstRecruitment, ApplicationStatus.SUBMITTED);
        saveApplication(firstRecruitment, ApplicationStatus.SUBMITTED);
        Club secondByName = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE, "나신호재료동아리");
        saveApplication(longEndedRecruitment(secondByName), ApplicationStatus.SUBMITTED);

        admin().queryParam("signal", "RESULT_WAITING").queryParam("size", 1).queryParam("page", 1)
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(2))
                .body("data.content[0].id", equalTo(secondByName.getId().intValue()))
                .body("data.content[0].signalDetail.resultWaiting.applicationCount", equalTo(1));
    }

    @Test
    @DisplayName("신호 목록의 끝을 넘은 쪽은 빈 목록과 전체 건수를 준다 — 빈 페이지로 재료를 조회하지 않는다")
    void pageBeyondEndReturnsEmptyContent() {
        Club club = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        saveApplication(longEndedRecruitment(club), ApplicationStatus.SUBMITTED);

        admin().queryParam("signal", "RESULT_WAITING").queryParam("page", 5).queryParam("size", 20)
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(1))
                .body("data.content", empty());
    }

    @Test
    @DisplayName("운영진 마지막 접속은 회장·임원의 세션 사용·로그인 중 늦은 절대시각이고, 운영진이 없으면 null 이다")
    void operatorsLastActiveAtIsLaterOfSessionAndLogin() {
        Club withOperators = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        saveApplication(longEndedRecruitment(withOperators), ApplicationStatus.SUBMITTED);
        User leader = ClubSignalFixture.saveMember(userRepository, clubMemberRepository, withOperators, ClubMemberRole.LEADER, "회장");
        User officer = ClubSignalFixture.saveMember(userRepository, clubMemberRepository, withOperators, ClubMemberRole.OFFICER, "임원");
        LocalDateTime sessionUsedAt = seoulNow.minusDays(2);
        ClubSignalFixture.saveSession(authSessionRepository, leader, sessionUsedAt, true);
        ClubSignalFixture.recordLogin(jdbcTemplate, officer, systemNow.minusDays(5));
        Club withoutOperators = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        saveApplication(longEndedRecruitment(withoutOperators), ApplicationStatus.SUBMITTED);

        JsonPath listed = list(Map.of("signal", "RESULT_WAITING", "size", 100));

        assertThat(Instant.parse(listed.getString(rowOf(withOperators) + ".signalDetail.operatorsLastActiveAt")))
                .isEqualTo(TimeMapper.seoulWallClockToInstant(sessionUsedAt));
        assertThat(listed.getString(rowOf(withoutOperators) + ".signalDetail.operatorsLastActiveAt")).isNull();
    }

    @Test
    @DisplayName("판정↔표시 — 운영진 미접속 행의 운영진 마지막 접속은 비었거나 30일보다 오래됐고, 경계 바로 안쪽 동아리는 목록에 없다")
    void operatorInactiveVerdictMatchesDisplayedActivity() {
        Club stale = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        LocalDateTime staleLoginAt = systemNow.minusDays(31);
        ClubSignalFixture.recordLogin(jdbcTemplate,
                ClubSignalFixture.saveMember(userRepository, clubMemberRepository, stale, ClubMemberRole.LEADER, "오래된회장"), staleLoginAt);
        Club noOperator = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        Club insideBoundary = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.saveSession(authSessionRepository,
                ClubSignalFixture.saveMember(userRepository, clubMemberRepository, insideBoundary, ClubMemberRole.LEADER, "경계회장"),
                seoulNow.minusDays(30).plusHours(3), false);

        JsonPath listed = list(Map.of("signal", "OPERATOR_INACTIVE", "size", 100));

        assertThat(listed.getList("data.content.id", Integer.class))
                .containsExactlyInAnyOrder(stale.getId().intValue(), noOperator.getId().intValue());
        Instant inactiveThreshold = Instant.now(clock).minus(Duration.ofDays(30));
        for (String lastActiveAt : listed.getList("data.content.signalDetail.operatorsLastActiveAt", String.class)) {
            assertThat(lastActiveAt == null || Instant.parse(lastActiveAt).isBefore(inactiveThreshold))
                    .as("표시값 %s 는 판정 기준(지금 − 30일)보다 오래됐거나 비어야 한다", lastActiveAt).isTrue();
        }
        assertThat(Instant.parse(listed.getString(rowOf(stale) + ".signalDetail.operatorsLastActiveAt")))
                .isEqualTo(TimeMapper.systemWallClockToInstant(staleLoginAt));
    }

    private RequestSpecification admin() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
    }

    private JsonPath list(Map<String, ?> queryParams) {
        return admin().queryParams(queryParams).when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private String rowOf(Club club) {
        return "data.content.find { it.id == %d }".formatted(club.getId());
    }

    private Recruitment longEndedRecruitment(Club club) {
        return ClubSignalFixture.saveOpenRecruitment(recruitmentRepository, club, today.minusDays(30), today.minusDays(20));
    }

    private void saveApplication(Recruitment recruitment, ApplicationStatus status) {
        PendingItemsFixture.saveApplication(applicationRepository, recruitment, userRepository.save(UserFixture.unique()), status);
    }

    private ClubJoinCode inviteCode(Club club) {
        return PendingItemsFixture.saveClubInviteCode(clubJoinCodeRepository, club, LocalDateTime.now(clock).plusDays(7));
    }

    private void savePendingRequest(Club club, ClubJoinCode inviteCode, LocalDateTime seoulRequestedAt) {
        ClubJoinRequest joinRequest = PendingItemsFixture.savePendingJoinRequest(clubJoinCodeRepository,
                clubJoinRequestRepository, club, inviteCode, userRepository.save(UserFixture.unique()));
        ClubSignalFixture.moveRequestedAt(jdbcTemplate, joinRequest, seoulRequestedAt);
    }
}

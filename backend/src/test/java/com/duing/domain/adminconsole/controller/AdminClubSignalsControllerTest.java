package com.duing.domain.adminconsole.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubSignalFixture;
import com.duing.common.fixture.PendingItemsFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.metric.repository.ClubMetricRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.AdminClubSignal;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.RecruitmentAutoClosePolicy;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.time.TimeMapper;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 홈 동아리 현황 집계 = 목록 신호 필터(동아리 신호 스펙 §10-1 동치 (1)~(10)).
 * 신호마다 양성·음성·경계·삭제·운영 중단·폐쇄·다른 동아리가 섞인 같은 데이터에서 집계 숫자와 목록 건수·id 집합·행 합이 같은지 본다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubSignalsControllerTest extends IntegrationTestBase {

    private static final String CLUB_SIGNALS_PATH = "/api/v1/admin/club-signals";
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
    @Autowired ClubMetricRepository clubMetricRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private String adminToken;
    private String studentToken;
    private LocalDate today;
    private LocalDateTime seoulNow;
    private LocalDateTime systemNow;

    @BeforeEach
    void setUp() {
        assumeFalse(LocalTime.now(clock).isAfter(LocalTime.of(23, 58)), "KST 자정 직전에는 날짜 경계 테스트를 건너뛴다");
        RestAssured.port = port;
        User adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
        today = LocalDate.now(clock);
        seoulNow = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        systemNow = TimeMapper.systemNow(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    @ParameterizedTest
    @EnumSource(AdminClubSignal.class)
    @DisplayName("홈 집계의 신호별 동아리 수는 같은 순간 목록의 건수·동아리 id 와 같고, 모든 행에 재료가 있다 (동치 1~4)")
    void summaryCountEqualsListForEachSignal(AdminClubSignal signal) {
        MixedDataset dataset = seedMixedDataset();
        JsonPath summary = summary();
        JsonPath listed = signalList(signal);

        Set<Long> expectedIds = dataset.expectedIds().get(signal);
        assertThat(expectedIds).as("(3) 공허한 동치 방지").isNotEmpty();
        assertThat(summary.getLong(summaryCountPath(signal))).as("(1)").isEqualTo(listed.getLong("data.totalElements"));
        assertThat(listed.getList("data.content.id", Long.class)).as("(2)").containsExactlyInAnyOrderElementsOf(expectedIds);
        List<Map<String, Object>> signalDetails = listed.getList("data.content.signalDetail");
        assertThat(signalDetails).as("(4) 신호를 보낸 목록은 모든 행이 재료 객체").doesNotContainNull();
        if (signal == AdminClubSignal.RESULT_WAITING) {
            assertThat(signalDetails).as("(4)").allSatisfy(detail -> assertThat(detail.get("resultWaiting")).isNotNull());
        }
        if (signal == AdminClubSignal.JOIN_REQUEST_WAITING) {
            assertThat(signalDetails).as("(4)").allSatisfy(detail -> assertThat(detail.get("joinRequestWaiting")).isNotNull());
        }
    }

    @Test
    @DisplayName("결과 대기·가입 대기 행의 합계(결과 미확정 지원·대기 신청)와 가장 오래된 값(끝난 날·신청 시각)은 홈 집계와 같다 (동치 5·8)")
    void rowSumsAndMinimumsEqualSummary() {
        seedMixedDataset();
        JsonPath summary = summary();
        JsonPath resultWaitingList = signalList(AdminClubSignal.RESULT_WAITING);
        JsonPath joinWaitingList = signalList(AdminClubSignal.JOIN_REQUEST_WAITING);

        List<Integer> applicationCounts = resultWaitingList.getList("data.content.signalDetail.resultWaiting.applicationCount", Integer.class);
        assertThat(applicationCounts.stream().mapToLong(Integer::longValue).sum())
                .isEqualTo(summary.getLong("data.resultWaiting.applicationCount"))
                .isEqualTo(4L);
        List<Integer> requestCounts = joinWaitingList.getList("data.content.signalDetail.joinRequestWaiting.requestCount", Integer.class);
        assertThat(requestCounts.stream().mapToLong(Integer::longValue).sum())
                .isEqualTo(summary.getLong("data.joinRequestWaiting.requestCount"))
                .isEqualTo(4L);

        List<String> endedOns = resultWaitingList.getList("data.content.signalDetail.resultWaiting.oldestEndedOn", String.class);
        LocalDate endedBefore = RecruitmentAutoClosePolicy.endedBefore(today);
        assertThat(endedOns).as("결과 대기 행의 끝난 날은 모두 기준일보다 앞이다")
                .allSatisfy(endedOn -> assertThat(LocalDate.parse(endedOn)).isBefore(endedBefore));
        assertThat(summary.getString("data.resultWaiting.oldestEndedOn"))
                .isEqualTo(endedOns.stream().min(String::compareTo).orElseThrow())
                .isEqualTo(today.minusDays(30).toString());
        List<String> requestedAts = joinWaitingList.getList("data.content.signalDetail.joinRequestWaiting.oldestRequestedAt", String.class);
        assertThat(Instant.parse(summary.getString("data.joinRequestWaiting.oldestRequestedAt")))
                .isEqualTo(requestedAts.stream().map(Instant::parse).min(Instant::compareTo).orElseThrow())
                .isEqualTo(TimeMapper.seoulWallClockToInstant(today.minusDays(20).atTime(12, 0)));
    }

    @Test
    @DisplayName("홈 집계의 운영 중 동아리 수는 ?status=ACTIVE 목록 건수와 같다 — 운영 중단·폐쇄 제외 (동치 6)")
    void activeClubCountEqualsActiveList() {
        MixedDataset dataset = seedMixedDataset();

        long activeListTotal = RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("status", "ACTIVE").when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value()).extract().jsonPath().getLong("data.totalElements");

        assertThat(summary().getLong("data.activeClubCount")).isEqualTo(activeListTotal).isEqualTo(dataset.activeClubCount());
    }

    @Test
    @DisplayName("운영진 미접속 행의 마지막 접속은 비었거나 30일보다 오래됐고, 경계 바로 안쪽 동아리는 목록에 없으며, "
            + "동아리를 떠난 운영진의 최근 접속은 판정·표시 모두 세지 않는다 (동치 7 판정↔표시)")
    void operatorInactiveRowsShowOnlyStaleActivity() {
        MixedDataset dataset = seedMixedDataset();
        JsonPath listed = signalList(AdminClubSignal.OPERATOR_INACTIVE);

        List<Long> listedIds = listed.getList("data.content.id", Long.class);
        List<String> displayedActivity = listed.getList("data.content.signalDetail.operatorsLastActiveAt", String.class);
        assertThat(listedIds).as("떠난 운영진만 최근 접속한 동아리는 미접속이다(판정)").contains(dataset.operatorLeftClubId());
        assertThat(displayedActivity.get(listedIds.indexOf(dataset.operatorLeftClubId())))
                .as("떠난 운영진의 접속은 표시하지 않는다(표시)").isNull();
        assertThat(displayedActivity).filteredOn(Objects::nonNull)
                .as("비교할 표시값이 하나는 있어야 한다(resultDeleted 31일 전 로그인)").isNotEmpty();
        Instant inactiveThreshold = Instant.now(clock).minus(Duration.ofDays(30));
        for (String lastActiveAt : displayedActivity) {
            assertThat(lastActiveAt == null || Instant.parse(lastActiveAt).isBefore(inactiveThreshold))
                    .as("표시값 %s", lastActiveAt).isTrue();
        }
        assertThat(listedIds).doesNotContain(dataset.operatorBoundaryInsideClubId());
    }

    @Test
    @DisplayName("신호에 걸린 동아리가 없으면 건수는 0 이고 가장 오래된 값은 null 이다 (동치 9)")
    void emptySignalsHaveZeroCountsAndNullOldest() {
        Club healthyClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubSignalFixture.saveMetric(clubMetricRepository, healthyClub, seoulNow.minusDays(1));
        ClubSignalFixture.recordLogin(jdbcTemplate,
                ClubSignalFixture.saveMember(userRepository, clubMemberRepository, healthyClub, ClubMemberRole.LEADER, "건강회장"),
                systemNow.minusDays(1));

        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(CLUB_SIGNALS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.activeClubCount", equalTo(1))
                .body("data.resultWaiting.clubCount", equalTo(0))
                .body("data.resultWaiting.applicationCount", equalTo(0))
                .body("data.resultWaiting", hasKey("oldestEndedOn"))
                .body("data.resultWaiting.oldestEndedOn", nullValue())
                .body("data.joinRequestWaiting.clubCount", equalTo(0))
                .body("data.joinRequestWaiting.requestCount", equalTo(0))
                .body("data.joinRequestWaiting", hasKey("oldestRequestedAt"))
                .body("data.joinRequestWaiting.oldestRequestedAt", nullValue())
                .body("data.noRecordClubCount", equalTo(0))
                .body("data.operatorInactiveClubCount", equalTo(0));
    }

    @Test
    @DisplayName("동아리 현황은 총동연만 본다 — 학생 403, 비로그인 401 (동치 10)")
    void clubSignalsIsAdminOnly() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(CLUB_SIGNALS_PATH)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        RestAssured.when().get(CLUB_SIGNALS_PATH)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    /** 신호마다 기대 동아리 id 집합과 운영 중 수, 운영진 접속 경계 바로 안쪽 동아리, 떠난 운영진만 최근 접속한 동아리. */
    private record MixedDataset(Map<AdminClubSignal, Set<Long>> expectedIds, long activeClubCount,
                                Long operatorBoundaryInsideClubId, Long operatorLeftClubId) {
    }

    /**
     * 운영 중 10곳 + 운영 중단 1곳 + 폐쇄 1곳.
     * <pre>
     *  동아리             결과 대기         가입 대기        기록   운영진 접속
     *  resultA           늦은 마감+기간지남 —               있음   회장 로그인 1일 전
     *  resultB           레거시 마감        —               없음   운영진 없음
     *  resultBoundary    끝난 날 오늘−7     —               null   회장 세션 29일 전
     *  resultDeleted     삭제된 모집·삭제된 지원 —           없음   회장 로그인 31일 전
     *  joinA             —                 오늘−9·오늘−1     있음   임원 폐기 세션 2일 전
     *  joinB             —                 오늘−20          없음   일반 부원만 접속
     *  joinBoundary      —                 오늘−7(12시·0시)·처리된 옛·삭제된 옛 있음 회장 세션 30일−3시간 전
     *  usageOnly         —                 —               있음   탈퇴한 회장의 최근 로그인
     *  joinEdge          —                 오늘−8 23:59     있음   회장 로그인 1시간 전
     *  operatorLeft      —                 —               있음   떠난(멤버십 삭제) 회장의 최근 로그인·세션
     *  inactive(운영중단) 결과 대기 모양    오래된 대기       없음   없음
     *  closed(폐쇄)       결과 대기 모양    오래된 대기 포함   없음   없음
     * </pre>
     */
    private MixedDataset seedMixedDataset() {
        Club resultA = activeClub();
        Recruitment lateClosed = ClubSignalFixture.saveClosedRecruitment(recruitmentRepository, resultA,
                today.minusDays(40), today.minusDays(30), today.atTime(9, 0));
        saveApplication(lateClosed, ApplicationStatus.SUBMITTED);
        saveApplication(lateClosed, ApplicationStatus.ON_HOLD);
        saveApplication(ClubSignalFixture.saveOpenRecruitment(recruitmentRepository, resultA,
                today.minusDays(30), today.minusDays(10)), ApplicationStatus.INTERVIEW_PENDING);
        ClubSignalFixture.saveMetric(clubMetricRepository, resultA, seoulNow.minusDays(3));
        ClubSignalFixture.recordLogin(jdbcTemplate, leaderOf(resultA), systemNow.minusDays(1));

        Club resultB = activeClub();
        Recruitment legacyClosed = ClubSignalFixture.saveClosedRecruitment(recruitmentRepository, resultB,
                today.minusDays(40), today.minusDays(20), today.minusDays(20).atTime(12, 0));
        ClubSignalFixture.clearClosedAt(jdbcTemplate, legacyClosed);
        saveApplication(legacyClosed, ApplicationStatus.SUBMITTED);

        Club resultBoundary = activeClub();
        saveApplication(ClubSignalFixture.saveOpenRecruitment(recruitmentRepository, resultBoundary,
                today.minusDays(30), today.minusDays(7)), ApplicationStatus.SUBMITTED);
        ClubSignalFixture.saveMetric(clubMetricRepository, resultBoundary, null);
        ClubSignalFixture.saveSession(authSessionRepository, leaderOf(resultBoundary), seoulNow.minusDays(29), false);

        Club resultDeleted = activeClub();
        Recruitment deletedRecruitment = ClubSignalFixture.saveOpenRecruitment(recruitmentRepository, resultDeleted,
                today.minusDays(30), today.minusDays(20));
        saveApplication(deletedRecruitment, ApplicationStatus.SUBMITTED);
        jdbcTemplate.update("UPDATE recruitment SET deleted_at = now() WHERE id = ?", deletedRecruitment.getId());
        // 살아 있는 오래된 모집이지만 지원서가 소프트 삭제뿐 — 신호가 아니다(목록 EXISTS·재료 GROUP BY 둘 다 빠져야 한다)
        Recruitment aliveRecruitment = ClubSignalFixture.saveOpenRecruitment(recruitmentRepository, resultDeleted,
                today.minusDays(30), today.minusDays(20));
        Application deletedApplication = PendingItemsFixture.saveApplication(applicationRepository, aliveRecruitment,
                userRepository.save(UserFixture.unique()), ApplicationStatus.SUBMITTED);
        jdbcTemplate.update("UPDATE application SET deleted_at = now() WHERE id = ?", deletedApplication.getId());
        ClubSignalFixture.recordLogin(jdbcTemplate, leaderOf(resultDeleted), systemNow.minusDays(31));

        Club joinA = activeClub();
        ClubJoinCode joinACode = inviteCode(joinA);
        savePendingRequest(joinA, joinACode, today.minusDays(9).atTime(12, 0));
        savePendingRequest(joinA, joinACode, today.minusDays(1).atTime(12, 0));
        ClubSignalFixture.saveMetric(clubMetricRepository, joinA, seoulNow.minusDays(5));
        ClubSignalFixture.saveSession(authSessionRepository,
                ClubSignalFixture.saveMember(userRepository, clubMemberRepository, joinA, ClubMemberRole.OFFICER, "임원"),
                seoulNow.minusDays(2), true);

        Club joinB = activeClub();
        savePendingRequest(joinB, inviteCode(joinB), today.minusDays(20).atTime(12, 0));
        User memberOnly = ClubSignalFixture.saveMember(userRepository, clubMemberRepository, joinB, ClubMemberRole.MEMBER, "부원");
        ClubSignalFixture.recordLogin(jdbcTemplate, memberOnly, systemNow.minusHours(1));

        Club joinBoundary = activeClub();
        ClubJoinCode joinBoundaryCode = inviteCode(joinBoundary);
        savePendingRequest(joinBoundary, joinBoundaryCode, today.minusDays(7).atTime(12, 0));
        // 기준 시각 정각(오늘−7 00:00 KST)은 미포함 — 저장 존 변환을 빠뜨리면 UTC JVM 에서 이 행이 걸린다
        savePendingRequest(joinBoundary, joinBoundaryCode, today.minusDays(7).atStartOfDay());
        ClubJoinRequest processedRequest = PendingItemsFixture.saveProcessedJoinRequest(clubJoinRequestRepository,
                joinBoundary, joinBoundaryCode, userRepository.save(UserFixture.unique()),
                userRepository.save(UserFixture.unique()), JoinRequestStatus.APPROVED, LocalDateTime.now(clock));
        ClubSignalFixture.moveRequestedAt(jdbcTemplate, processedRequest, today.minusDays(30).atTime(12, 0));
        // 오래된 대기 신청을 소프트 삭제 — 목록·재료 모두 빠져야 한다(초대 링크 자리는 30개라 남는다)
        ClubJoinRequest deletedOldRequest = PendingItemsFixture.savePendingJoinRequest(clubJoinCodeRepository,
                clubJoinRequestRepository, joinBoundary, joinBoundaryCode, userRepository.save(UserFixture.unique()));
        ClubSignalFixture.moveRequestedAt(jdbcTemplate, deletedOldRequest, today.minusDays(25).atTime(12, 0));
        jdbcTemplate.update("UPDATE club_join_request SET deleted_at = now() WHERE id = ?", deletedOldRequest.getId());
        ClubSignalFixture.saveMetric(clubMetricRepository, joinBoundary, seoulNow.minusDays(10));
        ClubSignalFixture.saveSession(authSessionRepository, leaderOf(joinBoundary),
                seoulNow.minusDays(30).plusHours(3), false);

        Club usageOnly = activeClub();
        ClubSignalFixture.saveMetric(clubMetricRepository, usageOnly, seoulNow.minusDays(1));
        User withdrawnLeader = leaderOf(usageOnly);
        ClubSignalFixture.recordLogin(jdbcTemplate, withdrawnLeader, systemNow.minusHours(1));
        ClubSignalFixture.withdraw(jdbcTemplate, withdrawnLeader);

        // 기준 시각 바로 앞(오늘−8 23:59 KST)은 포함 — 기준을 하루 당기거나 변환을 두 번 해 더 이르게 만들면 이 행이 빠진다
        // (변환 누락·반대 변환은 기준이 늦어지는 쪽이라 이 행은 그대로 포함되고, 위 오늘−7 00:00 행이 잡는다)
        Club joinEdge = activeClub();
        savePendingRequest(joinEdge, inviteCode(joinEdge), today.minusDays(8).atTime(23, 59));
        ClubSignalFixture.saveMetric(clubMetricRepository, joinEdge, seoulNow.minusDays(1));
        ClubSignalFixture.recordLogin(jdbcTemplate, leaderOf(joinEdge), systemNow.minusHours(1));

        // 동아리를 떠난(멤버십 소프트 삭제) 회장만 최근에 로그인·세션 사용 — 판정·표시 모두 세지 않는다
        Club operatorLeft = activeClub();
        ClubSignalFixture.saveMetric(clubMetricRepository, operatorLeft, seoulNow.minusDays(1));
        User departedLeader = leaderOf(operatorLeft);
        ClubSignalFixture.recordLogin(jdbcTemplate, departedLeader, systemNow.minusHours(1));
        ClubSignalFixture.saveSession(authSessionRepository, departedLeader, seoulNow.minusHours(1), false);
        jdbcTemplate.update("UPDATE club_member SET deleted_at = now() WHERE club_id = ? AND user_id = ?",
                operatorLeft.getId(), departedLeader.getId());

        Club inactiveClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.INACTIVE);
        saveApplication(ClubSignalFixture.saveOpenRecruitment(recruitmentRepository, inactiveClub,
                today.minusDays(30), today.minusDays(20)), ApplicationStatus.SUBMITTED);
        savePendingRequest(inactiveClub, inviteCode(inactiveClub), today.minusDays(20).atTime(12, 0));

        Club closedClub = activeClub();
        saveApplication(ClubSignalFixture.saveOpenRecruitment(recruitmentRepository, closedClub,
                today.minusDays(30), today.minusDays(20)), ApplicationStatus.SUBMITTED);
        savePendingRequest(closedClub, inviteCode(closedClub), today.minusDays(20).atTime(12, 0));
        jdbcTemplate.update("UPDATE club SET deleted_at = now() WHERE id = ?", closedClub.getId());

        Map<AdminClubSignal, Set<Long>> expectedIds = new EnumMap<>(AdminClubSignal.class);
        expectedIds.put(AdminClubSignal.RESULT_WAITING, ids(resultA, resultB));
        expectedIds.put(AdminClubSignal.JOIN_REQUEST_WAITING, ids(joinA, joinB, joinEdge));
        expectedIds.put(AdminClubSignal.NO_RECORD, ids(resultB, resultBoundary, resultDeleted, joinB));
        expectedIds.put(AdminClubSignal.OPERATOR_INACTIVE, ids(resultB, resultDeleted, joinB, usageOnly, operatorLeft));
        return new MixedDataset(expectedIds, 10L, joinBoundary.getId(), operatorLeft.getId());
    }

    private JsonPath summary() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(CLUB_SIGNALS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private JsonPath signalList(AdminClubSignal signal) {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("status", "ACTIVE").queryParam("signal", signal.name()).queryParam("size", 100)
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private static String summaryCountPath(AdminClubSignal signal) {
        return switch (signal) {
            case RESULT_WAITING -> "data.resultWaiting.clubCount";
            case JOIN_REQUEST_WAITING -> "data.joinRequestWaiting.clubCount";
            case NO_RECORD -> "data.noRecordClubCount";
            case OPERATOR_INACTIVE -> "data.operatorInactiveClubCount";
        };
    }

    private static Set<Long> ids(Club... clubs) {
        return Arrays.stream(clubs).map(Club::getId).collect(Collectors.toSet());
    }

    private Club activeClub() {
        return ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
    }

    private User leaderOf(Club club) {
        return ClubSignalFixture.saveMember(userRepository, clubMemberRepository, club, ClubMemberRole.LEADER, "회장" + club.getId());
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

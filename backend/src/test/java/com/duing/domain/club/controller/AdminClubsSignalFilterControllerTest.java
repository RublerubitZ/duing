package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
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
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.AdminClubSignal;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.specification.RequestSpecification;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.function.Function;
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
 * 총동연 동아리 목록 신호 필터 — 지원 결과 미확정·가입 신청 7일 넘게 대기와 공통 조합 규칙(스펙 §4-1·§4-2·§6-1·§10-1).
 * 시계는 실제 Clock 빈 + 상대 시각 픽스처다. 날짜 경계 픽스처의 시각은 그날 정오(KST) — 경계 자체를 보는 마감 시각만 00:00·23:59 다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubsSignalFilterControllerTest extends IntegrationTestBase {

    private static final String ADMIN_CLUBS_PATH = "/api/v1/admin/clubs";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private String adminToken;
    private String studentToken;
    private LocalDate today;

    @BeforeEach
    void setUp() {
        // 픽스처를 만든 뒤 요청 전에 KST 자정을 넘으면 기준일이 하루 밀린다 — 23:58 이후에는 건너뛴다(스펙 §10-1).
        assumeFalse(LocalTime.now(clock).isAfter(LocalTime.of(23, 58)), "KST 자정 직전에는 날짜 경계 테스트를 건너뛴다");
        RestAssured.port = port;
        User adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
        today = LocalDate.now(clock);
    }

    @Test
    @DisplayName("결과 대기는 기간 종료일·마감 시각·시작일 세 비교 지점 모두 오늘 − 7 은 빼고 오늘 − 8 은 넣는다")
    void resultWaitingBoundaryAtEachComparisonPoint() {
        activeClubWithUndecided(club -> openRecruitment(club, today.minusDays(30), today.minusDays(7)));
        Club endDateInside = activeClubWithUndecided(club -> openRecruitment(club, today.minusDays(30), today.minusDays(8)));
        // 상시모집을 마감 — 기간 종료일이 없어 마감 시각만 비교된다
        activeClubWithUndecided(club -> closedRecruitment(club, today.minusDays(30), null, today.minusDays(7).atStartOfDay()));
        Club closedAtInside = activeClubWithUndecided(club ->
                closedRecruitment(club, today.minusDays(30), null, today.minusDays(8).atTime(23, 59)));
        // 마감 시각·기간 종료일이 모두 없는 레거시 마감 — 시작일로 센다
        activeClubWithUndecided(club -> legacyClosedWithoutDates(club, today.minusDays(7)));
        Club startDateInside = activeClubWithUndecided(club -> legacyClosedWithoutDates(club, today.minusDays(8)));

        assertSignalClubs(AdminClubSignal.RESULT_WAITING, endDateInside, closedAtInside, startDateInside);
    }

    @Test
    @DisplayName("늦은 마감·조기 마감·마감 시각 없는 레거시 마감 모집도 결과 대기로 세고, 최근에 조기 마감한 모집은 뺀다")
    void resultWaitingCountsLateEarlyAndLegacyClosedRecruitments() {
        Club lateClosed = activeClubWithUndecided(club ->
                closedRecruitment(club, today.minusDays(40), today.minusDays(30), today.atTime(9, 0)));
        Club earlyClosed = activeClubWithUndecided(club ->
                closedRecruitment(club, today.minusDays(40), today.plusDays(10), today.minusDays(10).atTime(12, 0)));
        Club legacyClosed = activeClubWithUndecided(club -> {
            Recruitment closedRecruitment = closedRecruitment(club, today.minusDays(40), today.minusDays(20),
                    today.minusDays(20).atTime(12, 0));
            ClubSignalFixture.clearClosedAt(jdbcTemplate, closedRecruitment);
            return closedRecruitment;
        });
        activeClubWithUndecided(club ->
                closedRecruitment(club, today.minusDays(40), today.plusDays(3), today.minusDays(3).atTime(12, 0)));

        assertSignalClubs(AdminClubSignal.RESULT_WAITING, lateClosed, earlyClosed, legacyClosed);
    }

    @Test
    @DisplayName("접수 중 상시모집은 시작이 오래돼도 끝나지 않은 모집이라 빼고, 신규 접수 마감은 확정한 종료일(전날)로 센다")
    void resultWaitingTreatsAlwaysOpenAsNotEndedAndStopIntakeAsEndDate() {
        activeClubWithUndecided(club -> openRecruitment(club, today.minusDays(60), null));
        Club stoppedSevenDaysAgo = activeClubWithUndecided(club -> stoppedIntake(club, today.minusDays(7)));
        activeClubWithUndecided(club -> stoppedIntake(club, today.minusDays(6)));

        assertSignalClubs(AdminClubSignal.RESULT_WAITING, stoppedSevenDaysAgo);
    }

    @Test
    @DisplayName("결과가 다 정해진 모집·삭제된 모집·삭제된 지원은 빼고, 면접 대상만 남은 모집은 넣는다")
    void resultWaitingCountsOnlyUndecidedLiveApplications() {
        Club decidedClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        Recruitment decidedRecruitment = openRecruitment(decidedClub, today.minusDays(30), today.minusDays(20));
        saveApplication(decidedRecruitment, ApplicationStatus.ACCEPTED);
        saveApplication(decidedRecruitment, ApplicationStatus.REJECTED);

        Club deletedRecruitmentClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        Recruitment deletedRecruitment = openRecruitment(deletedRecruitmentClub, today.minusDays(30), today.minusDays(20));
        saveApplication(deletedRecruitment, ApplicationStatus.SUBMITTED);
        jdbcTemplate.update("UPDATE recruitment SET deleted_at = now() WHERE id = ?", deletedRecruitment.getId());

        Club deletedApplicationClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        Application deletedApplication = saveApplication(
                openRecruitment(deletedApplicationClub, today.minusDays(30), today.minusDays(20)), ApplicationStatus.SUBMITTED);
        jdbcTemplate.update("UPDATE application SET deleted_at = now() WHERE id = ?", deletedApplication.getId());

        Club interviewOnlyClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        saveApplication(openRecruitment(interviewOnlyClub, today.minusDays(30), today.minusDays(20)),
                ApplicationStatus.INTERVIEW_PENDING);

        assertSignalClubs(AdminClubSignal.RESULT_WAITING, interviewOnlyClub);
    }

    @Test
    @DisplayName("탈퇴한 지원자의 결과 없는 지원서만 남은 동아리는 결과 대기에서 빼고, 살아 있는 지원자의 지원서가 함께 남았으면 넣는다")
    void resultWaitingIgnoresWithdrawnApplicants() {
        Club withdrawnOnlyClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        saveWithdrawnApplication(longEndedRecruitment(withdrawnOnlyClub), ApplicationStatus.SUBMITTED);

        Club mixedClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        Recruitment mixedRecruitment = longEndedRecruitment(mixedClub);
        saveWithdrawnApplication(mixedRecruitment, ApplicationStatus.SUBMITTED);
        saveApplication(mixedRecruitment, ApplicationStatus.ON_HOLD);

        assertSignalClubs(AdminClubSignal.RESULT_WAITING, mixedClub);
    }

    @Test
    @DisplayName("가입 대기는 신청일 오늘 − 7 은 빼고 오늘 − 8 은 넣으며, 7일 안 신청만 있거나 처리·삭제된 오래된 신청만 있는 동아리는 뺀다")
    void joinRequestWaitingBoundaryAndExclusions() {
        clubWithPendingRequestAt(today.minusDays(7).atTime(12, 0));
        Club inside = clubWithPendingRequestAt(today.minusDays(8).atTime(12, 0));
        clubWithPendingRequestAt(today.minusDays(2).atTime(12, 0));

        Club processedClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubJoinRequest processedRequest = PendingItemsFixture.saveProcessedJoinRequest(clubJoinRequestRepository,
                processedClub, inviteCode(processedClub), userRepository.save(UserFixture.unique()),
                userRepository.save(UserFixture.unique()), JoinRequestStatus.APPROVED, LocalDateTime.now(clock));
        ClubSignalFixture.moveRequestedAt(jdbcTemplate, processedRequest, today.minusDays(20).atTime(12, 0));

        Club deletedClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        ClubJoinRequest deletedRequest = savePendingRequest(deletedClub, today.minusDays(20).atTime(12, 0));
        jdbcTemplate.update("UPDATE club_join_request SET deleted_at = now() WHERE id = ?", deletedRequest.getId());

        assertSignalClubs(AdminClubSignal.JOIN_REQUEST_WAITING, inside);
    }

    @Test
    @DisplayName("신호는 운영 중 동아리만 본다 — 운영 중단·승인 대기·폐쇄 동아리는 같은 데이터가 있어도 뺀다")
    void signalKeepsOnlyActiveClubs() {
        Club activeClub = activeClubWithUndecided(this::longEndedRecruitment);
        clubWithUndecided(ClubStatus.INACTIVE, this::longEndedRecruitment);
        clubWithUndecided(ClubStatus.PENDING_APPROVAL, this::longEndedRecruitment);
        Club closedClub = activeClubWithUndecided(this::longEndedRecruitment);
        jdbcTemplate.update("UPDATE club SET deleted_at = now() WHERE id = ?", closedClub.getId());

        assertSignalClubs(AdminClubSignal.RESULT_WAITING, activeClub);
    }

    @Test
    @DisplayName("신호는 다른 조건과 모두 건다 — 운영 중단 상태·미결 정리 필요와 함께면 빈 결과, 검색어와 함께면 둘 다 맞는 동아리만")
    void signalCombinesWithOtherConditionsByAnd() {
        Club codingClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE, "코딩신호동아리");
        saveApplication(longEndedRecruitment(codingClub), ApplicationStatus.SUBMITTED);
        Club photoClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE, "사진신호동아리");
        saveApplication(longEndedRecruitment(photoClub), ApplicationStatus.SUBMITTED);
        clubWithUndecided(ClubStatus.INACTIVE, this::longEndedRecruitment);
        // 검색어·상태는 맞지만 신호 데이터가 없는 동아리 — 신호 술어가 빠지면 이 동아리가 끼어 아래 검사가 깨진다
        Club noSignalCodingClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE, "코딩무신호동아리");

        admin().queryParam("keyword", "코딩").queryParam("size", 100)
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.id", containsInAnyOrder(codingClub.getId().intValue(),
                        noSignalCodingClub.getId().intValue()));
        admin().queryParam("signal", "RESULT_WAITING").queryParam("status", "INACTIVE")
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value()).body("data.totalElements", equalTo(0));
        admin().queryParam("signal", "RESULT_WAITING").queryParam("needsPendingCleanup", true)
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value()).body("data.totalElements", equalTo(0));
        admin().queryParam("signal", "RESULT_WAITING").queryParam("keyword", "코딩")
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(1))
                .body("data.content.id", containsInAnyOrder(codingClub.getId().intValue()));
        admin().queryParam("signal", "RESULT_WAITING").queryParam("status", "ACTIVE").queryParam("size", 100)
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(2))
                .body("data.content.id", containsInAnyOrder(codingClub.getId().intValue(), photoClub.getId().intValue()));
    }

    @Test
    @DisplayName("모르는 신호 값과 소문자는 400 이고, 빈 값(signal=)은 신호 없음과 같다")
    void unknownOrLowercaseSignalIsBadRequestAndEmptyMeansNone() {
        Club activeClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        Club inactiveClub = ClubSignalFixture.saveClub(clubRepository, ClubStatus.INACTIVE);

        admin().queryParam("signal", "SOMETHING").when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("요청 파라미터 'signal' 의 형식이 올바르지 않습니다."));
        admin().queryParam("signal", "result_waiting").when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        admin().queryParam("signal", "").queryParam("size", 100).when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.id", containsInAnyOrder(activeClub.getId().intValue(), inactiveClub.getId().intValue()));
    }

    @Test
    @DisplayName("신호 목록도 총동연만 본다 — 학생은 403, 로그인하지 않으면 401")
    void signalListIsAdminOnly() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .queryParam("signal", "RESULT_WAITING")
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        RestAssured.given().queryParam("signal", "RESULT_WAITING")
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private RequestSpecification admin() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
    }

    private void assertSignalClubs(AdminClubSignal signal, Club... expectedClubs) {
        Object[] expectedIds = Arrays.stream(expectedClubs).map(expected -> expected.getId().intValue()).toArray();
        var response = admin().queryParam("signal", signal.name()).queryParam("size", 100)
                .when().get(ADMIN_CLUBS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(expectedIds.length));
        if (expectedIds.length == 0) {
            response.body("data.content", empty());
        } else {
            response.body("data.content.id", containsInAnyOrder(expectedIds));
        }
    }

    /** 오래전(오늘 − 20)에 끝난 접수 중 모집 — 신호 모집 모양의 기본값. */
    private Recruitment longEndedRecruitment(Club club) {
        return openRecruitment(club, today.minusDays(30), today.minusDays(20));
    }

    private Club activeClubWithUndecided(Function<Club, Recruitment> recruitmentFactory) {
        return clubWithUndecided(ClubStatus.ACTIVE, recruitmentFactory);
    }

    /** 동아리 하나에 모집 하나를 만들고 결과 미확정 지원(제출) 1건을 넣는다 — 모집 모양은 recruitmentFactory 가 정한다. */
    private Club clubWithUndecided(ClubStatus status, Function<Club, Recruitment> recruitmentFactory) {
        Club club = ClubSignalFixture.saveClub(clubRepository, status);
        saveApplication(recruitmentFactory.apply(club), ApplicationStatus.SUBMITTED);
        return club;
    }

    private Recruitment openRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        return ClubSignalFixture.saveOpenRecruitment(recruitmentRepository, club, startDate, endDate);
    }

    private Recruitment closedRecruitment(Club club, LocalDate startDate, LocalDate endDate, LocalDateTime closedAt) {
        return ClubSignalFixture.saveClosedRecruitment(recruitmentRepository, club, startDate, endDate, closedAt);
    }

    private Recruitment legacyClosedWithoutDates(Club club, LocalDate startDate) {
        Recruitment closedRecruitment = closedRecruitment(club, startDate, null, today.atTime(9, 0));
        ClubSignalFixture.clearClosedAt(jdbcTemplate, closedRecruitment);
        return closedRecruitment;
    }

    /** 상시모집의 신규 접수 마감 — stopIntake(오늘) 은 종료일을 그 전날로 확정한다. */
    private Recruitment stoppedIntake(Club club, LocalDate stoppedOn) {
        Recruitment intake = ClubSignalFixture.newOpenRecruitment(club, today.minusDays(20), null);
        intake.stopIntake(stoppedOn);
        return recruitmentRepository.save(intake);
    }

    private Application saveApplication(Recruitment recruitment, ApplicationStatus status) {
        return PendingItemsFixture.saveApplication(applicationRepository, recruitment,
                userRepository.save(UserFixture.unique()), status);
    }

    /** 회원 탈퇴 모양 — 지원서는 남기고 지원자만 소프트 삭제한다. */
    private void saveWithdrawnApplication(Recruitment recruitment, ApplicationStatus status) {
        User applicant = userRepository.save(UserFixture.unique());
        PendingItemsFixture.saveApplication(applicationRepository, recruitment, applicant, status);
        ClubSignalFixture.withdraw(jdbcTemplate, applicant);
    }

    private ClubJoinCode inviteCode(Club club) {
        return PendingItemsFixture.saveClubInviteCode(clubJoinCodeRepository, club, LocalDateTime.now(clock).plusDays(7));
    }

    private ClubJoinRequest savePendingRequest(Club club, LocalDateTime seoulRequestedAt) {
        ClubJoinRequest joinRequest = PendingItemsFixture.savePendingJoinRequest(clubJoinCodeRepository,
                clubJoinRequestRepository, club, inviteCode(club), userRepository.save(UserFixture.unique()));
        ClubSignalFixture.moveRequestedAt(jdbcTemplate, joinRequest, seoulRequestedAt);
        return joinRequest;
    }

    private Club clubWithPendingRequestAt(LocalDateTime seoulRequestedAt) {
        Club club = ClubSignalFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        savePendingRequest(club, seoulRequestedAt);
        return club;
    }
}

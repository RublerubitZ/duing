package com.duing.domain.interview.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
import org.springframework.test.util.ReflectionTestUtils;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ManagerInterviewScheduleControllerTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private InterviewAvailabilityRepository availabilityRepository;
    @Autowired private InterviewScheduleRepository scheduleRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String leaderToken;
    private String outsiderToken;
    private Long recruitmentId;
    private Long leaderId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        Club club = saveActiveClub("테스트동아리");
        User leader = saveUser("리더");
        User outsider = saveUser("외부인");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "테스트 모집", "내용",
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(30), 10));
        recruitmentId = recruitment.getId();
        leaderId = leader.getId();

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());
    }

    // ── M7 자동배정 ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("자동배정 실행 전 deadline 이 미경과이면 409 를 반환한다")
    void autoAssign_deadline_미경과_409() {
        configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(3)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(autoAssignUrl())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("슬롯이 없는 상태에서 자동배정을 시도하면 409 를 반환한다")
    void autoAssign_슬롯_없음_409() {
        configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().minusHours(1)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(autoAssignUrl())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("자동배정 성공 시 200 과 결과 통계를 반환한다")
    void autoAssign_성공_200() {
        configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().minusHours(1)));
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                5));

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitmentId, applicant);
        availabilityRepository.save(
                InterviewAvailability.create(application.getId(), slot.getId(), recruitmentId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(autoAssignUrl())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalCandidates", equalTo(1))
                .body("data.assignedCount", equalTo(1))
                .body("data.assignmentCompletedAt", notNullValue());
    }

    @Test
    @DisplayName("동아리 비회원이 자동배정을 시도하면 403 을 반환한다")
    void autoAssign_비회원_403() {
        configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().minusHours(1)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().post(autoAssignUrl())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── M8 일정 조회 ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("M8 운영진이 면접 일정을 조회하면 슬롯별 그룹핑된 목록을 반환한다")
    void listSchedules_운영진_200() {
        configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().minusHours(1)));
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                3));

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitmentId, applicant);
        scheduleRepository.save(
                InterviewSchedule.create(application.getId(), slot.getId(), recruitmentId, LocalDateTime.now()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(schedulesUrl())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].slotId", equalTo(slot.getId().intValue()))
                .body("data[0].assigned", hasSize(1));
    }

    @Test
    @DisplayName("동아리 비회원이 일정을 조회하면 403 을 반환한다")
    void listSchedules_비회원_403() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get(schedulesUrl())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── M11 후보 통계 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("M11 운영진이 후보 통계를 조회하면 totalCandidates 와 슬롯별 통계를 반환한다")
    void listCandidates_운영진_200() {
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                5));

        User applicantA = saveUser("A");
        User applicantB = saveUser("B");
        Application applicationA = saveInterviewPendingApplication(recruitmentId, applicantA);
        saveInterviewPendingApplication(recruitmentId, applicantB); // 가용시간 없음

        availabilityRepository.save(
                InterviewAvailability.create(applicationA.getId(), slot.getId(), recruitmentId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(candidatesUrl())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalCandidates", equalTo(2))
                .body("data.candidatesWithAvailability", equalTo(1))
                .body("data.candidatesWithoutAvailability", equalTo(1))
                .body("data.slots", hasSize(1));
    }

    @Test
    @DisplayName("동아리 비회원이 후보 통계를 조회하면 403 을 반환한다")
    void listCandidates_비회원_403() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get(candidatesUrl())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── M9 PUT 수동 배정 ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("M9 운영진이 INTERVIEW_PENDING 지원자를 슬롯에 배정하면 204 를 반환한다")
    void assign_성공_204() {
        configRepository.save(InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(3)));
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                5));

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitmentId, applicant);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType("application/json")
                .body("{\"slotId\": " + slot.getId() + "}")
                .when().put(assignUrl(application.getId()))
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("M9 INTERVIEW_PENDING 이 아닌 지원자에 배정 요청 시 400 을 반환한다")
    void assign_비대상_상태_400() {
        configRepository.save(InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(3)));
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                5));

        User applicant = saveUser("지원자");
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId).orElseThrow();
        Application application = Application.submit(recruitment, applicant, List.of());
        // SUBMITTED 상태 그대로 저장
        applicationRepository.save(application);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType("application/json")
                .body("{\"slotId\": " + slot.getId() + "}")
                .when().put(assignUrl(application.getId()))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("M9 정원이 가득 찬 슬롯에 배정하면 409 를 반환한다")
    void assign_정원_초과_409() {
        configRepository.save(InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(3)));
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                1)); // 정원 1

        User occupant = saveUser("선점자");
        Application occupantApp = saveInterviewPendingApplication(recruitmentId, occupant);
        scheduleRepository.save(
                InterviewSchedule.create(occupantApp.getId(), slot.getId(), recruitmentId, LocalDateTime.now()));

        User lateApplicant = saveUser("후발자");
        Application lateApplication = saveInterviewPendingApplication(recruitmentId, lateApplicant);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType("application/json")
                .body("{\"slotId\": " + slot.getId() + "}")
                .when().put(assignUrl(lateApplication.getId()))
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("M9 동아리 비회원이 배정 요청 시 403 을 반환한다")
    void assign_비회원_403() {
        configRepository.save(InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(3)));
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                5));

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitmentId, applicant);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType("application/json")
                .body("{\"slotId\": " + slot.getId() + "}")
                .when().put(assignUrl(application.getId()))
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── M10 DELETE 취소 ────────────────────────────────────────────────────────

    @Test
    @DisplayName("M10 운영진이 배정된 일정을 취소하면 204 를 반환한다")
    void cancel_성공_204() {
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                5));

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitmentId, applicant);
        scheduleRepository.save(
                InterviewSchedule.create(application.getId(), slot.getId(), recruitmentId, LocalDateTime.now()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete(cancelUrl(application.getId()))
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("M10 일정이 없는 지원자에 취소 요청 시 404 를 반환한다")
    void cancel_일정_없음_404() {
        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitmentId, applicant);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete(cancelUrl(application.getId()))
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("M10 동아리 비회원이 취소 요청 시 403 을 반환한다")
    void cancel_비회원_403() {
        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitmentId, applicant);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().delete(cancelUrl(application.getId()))
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private String autoAssignUrl() {
        return "/api/v1/recruitments/" + recruitmentId + "/interview-schedules/auto-assign";
    }

    private String schedulesUrl() {
        return "/api/v1/recruitments/" + recruitmentId + "/interview-schedules";
    }

    private String candidatesUrl() {
        return "/api/v1/recruitments/" + recruitmentId + "/interview-matching-candidates";
    }

    private String assignUrl(Long applicationId) {
        return "/api/v1/applications/" + applicationId + "/interview-schedule";
    }

    private String cancelUrl(Long applicationId) {
        return "/api/v1/applications/" + applicationId + "/interview-schedule";
    }

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "ctrl" + unique + "@daegu.ac.kr",
                "hash",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, "공학계열", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Application saveInterviewPendingApplication(Long recruitmentIdParam, User user) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentIdParam).orElseThrow();
        Application application = Application.submit(recruitment, user, List.of());
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.INTERVIEW_PENDING);
        return applicationRepository.save(application);
    }
}

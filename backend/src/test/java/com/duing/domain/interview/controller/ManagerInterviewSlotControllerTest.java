package com.duing.domain.interview.controller;

import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewAvailabilityFixture;
import com.duing.common.fixture.InterviewScheduleFixture;
import com.duing.common.fixture.InterviewSlotFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
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
import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ManagerInterviewSlotControllerTest extends IntegrationTestBase {

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

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        Club club = clubRepository.save(Club.create("슬롯테스트동아리", ClubCategory.ACADEMIC, null, "설명", null));

        User leader = saveUser();
        User outsider = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "테스트 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        recruitmentId = recruitment.getId();

        configRepository.save(InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(7)));

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());
    }

    @Test
    @DisplayName("운영진이 슬롯을 bulk 생성하면 201 과 slotIds 를 반환한다")
    void createBulkHappyPath() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3),
                        Map.of("startTime", base.plusHours(2).toString(), "endTime", base.plusHours(3).toString(), "capacity", 2)
                )))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-slots")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.slotIds", hasSize(2));
    }

    @Test
    @DisplayName("동아리 비회원이 슬롯을 생성하면 403 을 반환한다")
    void createBulkReturns403ForNonMember() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-slots")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("InterviewConfig 가 없는 모집에 슬롯을 생성하면 404 를 반환한다")
    void createBulkReturns404WhenNoConfig() {
        // 새 모집 — config 없음
        Club club = clubRepository.save(Club.create("다른동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment newRecruitment = recruitmentRepository.save(
                Recruitment.create(club, "config 없는 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        String newLeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + newLeaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + newRecruitment.getId() + "/interview-slots")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("모집이 이미 시작되었어도 phase 1(가용시간 제출 단계) 이면 슬롯 생성은 201 을 반환한다 — 새 lifecycle 정책")
    void createBulkSucceedsAfterRecruitmentStartIfPhase1() {
        // 이전 정책에서는 모집 시작일 이후 슬롯 생성이 차단되었으나, 새 정책에서는 phase 만으로 판정한다.
        Club club = clubRepository.save(Club.create("시작된동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment startedRecruitment = recruitmentRepository.save(
                Recruitment.create(club, "시작된 모집", "내용",
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(30), 10));
        configRepository.save(InterviewConfig.create(startedRecruitment.getId(), LocalDateTime.now().plusDays(7)));
        String startedLeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + startedLeaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + startedRecruitment.getId() + "/interview-slots")
                .then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("자동배정이 완료된(phase 3) 모집에 슬롯 생성은 409 SlotCreationNotAllowedInCurrentPhase 를 반환한다")
    void createBulkReturns409WhenPhase3() {
        Club club = clubRepository.save(Club.create("배정완료동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment phase3Recruitment = recruitmentRepository.save(
                Recruitment.create(club, "배정완료 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        InterviewConfig phase3Config = configRepository.save(
                InterviewConfig.create(phase3Recruitment.getId(), LocalDateTime.now().plusDays(7)));
        phase3Config.markAssignmentCompleted(LocalDateTime.now());
        configRepository.saveAndFlush(phase3Config);
        String phase3LeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + phase3LeaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + phase3Recruitment.getId() + "/interview-slots")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("phase 2(마감 후 자동배정 전) 에서 슬롯 생성은 201 을 반환한다 — 운영진 직권 배정 용도")
    void createBulkSucceedsWhenPhase2() {
        Club club = clubRepository.save(Club.create("phase2동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment phase2Recruitment = recruitmentRepository.save(
                Recruitment.create(club, "phase2 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        // 마감일 이미 지남, 자동배정 미완료 → phase 2
        configRepository.save(InterviewConfig.create(phase2Recruitment.getId(), LocalDateTime.now().minusHours(1)));
        String phase2LeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + phase2LeaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + phase2Recruitment.getId() + "/interview-slots")
                .then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("capacity 가 0 이하이면 슬롯 생성은 400 을 반환한다")
    void createBulkReturns400WhenCapacityIsZero() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 0)
                )))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-slots")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("endTime 이 startTime 이전이면 슬롯 생성은 400 을 반환한다")
    void createBulkReturns400WhenEndTimeBeforeStartTime() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.minusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-slots")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("운영진이 슬롯 목록을 조회하면 200 과 슬롯 목록을 반환한다")
    void listSlotsHappyPath() {
        // 먼저 슬롯 생성
        LocalDateTime base = LocalDateTime.now().plusDays(5);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-slots");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/recruitments/" + recruitmentId + "/interview-slots")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1));
    }

    // ── M5: PATCH /interview-slots/{slotId} ──────────────────────────────────────

    @Test
    @DisplayName("운영진이 availability 없는 슬롯의 시간을 수정하면 204 를 반환한다")
    void updateSlotTimeHappyPath() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitmentId, base, 3));

        LocalDateTime newStart = base.plusDays(1);
        LocalDateTime newEnd = newStart.plusHours(2);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("startTime", newStart.toString(), "endTime", newEnd.toString()))
                .when().patch("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("비운영진이 슬롯을 수정하면 403 을 반환한다")
    void updateSlotReturns403ForNonMember() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitmentId, base, 3));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("capacity", 10))
                .when().patch("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("phase 1 + 선택된 슬롯의 시간 변경은 409 SlotTimeChangeForbiddenForSelectedSlot 가 반환된다")
    void updateSlotTimeReturns409WhenPhase1SelectedSlot() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitmentId, base, 5));

        User applicant = saveUser();
        Application application = applicationRepository.save(
                Application.submit(recruitmentRepository.findById(recruitmentId).orElseThrow(),
                        applicant, List.of("답변")));
        availabilityRepository.save(
                InterviewAvailabilityFixture.link(application.getId(), slot.getId(), recruitmentId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("startTime", base.plusDays(2).toString(), "endTime", base.plusDays(2).plusHours(1).toString()))
                .when().patch("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("phase 1 + 선택된 슬롯의 capacity 변경은 204 를 반환한다")
    void updateSlotCapacityOnlySucceedsWhenPhase1SelectedSlot() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitmentId, base, 5));

        User applicant = saveUser();
        Application application = applicationRepository.save(
                Application.submit(recruitmentRepository.findById(recruitmentId).orElseThrow(),
                        applicant, List.of("답변")));
        availabilityRepository.save(
                InterviewAvailabilityFixture.link(application.getId(), slot.getId(), recruitmentId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("capacity", 8))
                .when().patch("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("phase 2 + 선택된 슬롯의 capacity 변경은 409 SlotModificationNotAllowedInCurrentPhase 가 반환된다")
    void updateSlotReturns409WhenPhase2SelectedSlot() {
        // phase 2 모집 별도 셋업: 마감일이 이미 지남
        Club club = clubRepository.save(Club.create("phase2수정동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment phase2Recruitment = recruitmentRepository.save(
                Recruitment.create(club, "phase2 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        configRepository.save(InterviewConfig.create(phase2Recruitment.getId(), LocalDateTime.now().minusHours(1)));
        String phase2LeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(phase2Recruitment.getId(), base, 5));
        User applicant = saveUser();
        Application application = applicationRepository.save(
                Application.submit(phase2Recruitment, applicant, List.of("답변")));
        availabilityRepository.save(
                InterviewAvailabilityFixture.link(application.getId(), slot.getId(), phase2Recruitment.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + phase2LeaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("capacity", 10))
                .when().patch("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("phase 2(마감 후 자동배정 전) + 빈 슬롯의 capacity 만 수정은 204 를 반환한다")
    void updateSlotCapacityOnlySucceedsWhenPhase2EmptySlot() {
        Club club = clubRepository.save(Club.create("phase2빈슬롯수정동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment phase2Recruitment = recruitmentRepository.save(
                Recruitment.create(club, "phase2 빈 슬롯 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        // phase 2: 마감일이 이미 지남, 자동배정 미완료. RestAssured 가 별도 트랜잭션이라 saveAndFlush 로 DB 반영 보장.
        configRepository.saveAndFlush(InterviewConfig.create(phase2Recruitment.getId(), LocalDateTime.now().minusHours(1)));
        String phase2LeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(phase2Recruitment.getId(), base, 5));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + phase2LeaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("capacity", 8))
                .when().patch("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("phase 3(자동배정 완료) 에서 빈 슬롯 수정은 409 SlotModificationNotAllowedInCurrentPhase 가 반환된다")
    void updateSlotReturns409WhenPhase3() {
        Club club = clubRepository.save(Club.create("phase3수정동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment phase3Recruitment = recruitmentRepository.save(
                Recruitment.create(club, "phase3 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        InterviewConfig phase3Config = configRepository.save(
                InterviewConfig.create(phase3Recruitment.getId(), LocalDateTime.now().plusDays(7)));
        phase3Config.markAssignmentCompleted(LocalDateTime.now());
        configRepository.saveAndFlush(phase3Config);
        String phase3LeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(phase3Recruitment.getId(), base, 5));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + phase3LeaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("capacity", 10))
                .when().patch("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("존재하지 않는 slotId 로 PATCH 호출 시 404 가 반환된다")
    void updateSlotReturns404ForUnknownSlotId() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("capacity", 5))
                .when().patch("/api/v1/interview-slots/999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── M6: DELETE /interview-slots/{slotId} ─────────────────────────────────────

    @Test
    @DisplayName("운영진이 빈 슬롯을 삭제하면 204 를 반환한다")
    void deleteSlotHappyPath() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitmentId, base, 3));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("비운영진이 슬롯을 삭제하면 403 을 반환한다")
    void deleteSlotReturns403ForNonMember() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitmentId, base, 3));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().delete("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("availability 가 있는 슬롯 삭제는 409 SlotDeletionNotAllowedInCurrentPhase 가 반환된다")
    void deleteSlotReturns409WhenSelectedSlot() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitmentId, base, 5));

        User applicant = saveUser();
        Application application = applicationRepository.save(
                Application.submit(recruitmentRepository.findById(recruitmentId).orElseThrow(),
                        applicant, List.of("답변")));
        availabilityRepository.save(
                InterviewAvailabilityFixture.link(application.getId(), slot.getId(), recruitmentId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("phase 3(자동배정 완료) 에서 빈 슬롯 삭제는 409 SlotDeletionNotAllowedInCurrentPhase 가 반환된다")
    void deleteSlotReturns409WhenPhase3() {
        Club club = clubRepository.save(Club.create("phase3삭제동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment phase3Recruitment = recruitmentRepository.save(
                Recruitment.create(club, "phase3 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        InterviewConfig phase3Config = configRepository.save(
                InterviewConfig.create(phase3Recruitment.getId(), LocalDateTime.now().plusDays(7)));
        phase3Config.markAssignmentCompleted(LocalDateTime.now());
        configRepository.saveAndFlush(phase3Config);
        String phase3LeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(phase3Recruitment.getId(), base, 5));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + phase3LeaderToken)
                .when().delete("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("phase 2(마감 후 자동배정 전) 의 빈 슬롯 삭제는 204 를 반환한다")
    void deleteSlotSucceedsWhenPhase2EmptySlot() {
        Club club = clubRepository.save(Club.create("phase2삭제동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment phase2Recruitment = recruitmentRepository.save(
                Recruitment.create(club, "phase2 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        configRepository.save(InterviewConfig.create(phase2Recruitment.getId(), LocalDateTime.now().minusHours(1)));
        String phase2LeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(phase2Recruitment.getId(), base, 5));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + phase2LeaderToken)
                .when().delete("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("ASSIGNED schedule 이 있는 슬롯 삭제는 409 를 반환한다")
    void deleteSlotReturns409WhenAssignedScheduleExists() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitmentId, base, 5));

        User applicant = saveUser();
        Application application = applicationRepository.save(
                Application.submit(recruitmentRepository.findById(recruitmentId).orElseThrow(),
                        applicant, List.of("답변")));
        scheduleRepository.save(
                InterviewScheduleFixture.assigned(application.getId(), slot.getId(), recruitmentId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/interview-slots/" + slot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("존재하지 않는 slotId 로 DELETE 호출 시 404 가 반환된다")
    void deleteSlotReturns404ForUnknownSlotId() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/interview-slots/999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "유저" + seq, "u" + seq + "@duing.ac.kr",
                "hash", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000",
                LocalDateTime.now()));
    }
}

package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
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
import org.springframework.test.util.ReflectionTestUtils;

// 확정 — ASSIGNED 전이·알림의 유일한 지점 (§6.3·§16-1). 미처리 멤버는 2종 분리 409 로 경고하고,
// force 면 자동 EXCLUDED(대기열 복귀) 후 라운드를 SCHEDULED(터미널)로 종결한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewConfirmControllerTest extends InterviewControllerTestSupport {

    private static final String CONFIRM_PATH = "/api/v1/leader/interview-rounds/{roundId}/confirm";
    private static final String CANDIDATES_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-round-candidates";
    private static final String VIEW_PATH = "/api/v1/applications/{applicationId}/interview";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;
    @Autowired private NotificationRepository notificationRepository;

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("확정동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "확정모집");
    }

    @Test
    @DisplayName("전원이 배정된 라운드를 확정하면 라운드가 종결되고 멤버들이 ASSIGNED 로 전이된다")
    void fullyAssignedRoundConfirms() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        InterviewRoundMember first = saveScheduledMember(round, "확정1", slot, RoundMemberStatus.RESPONDED);
        InterviewRoundMember second = saveScheduledMember(round, "확정2", slot, RoundMemberStatus.RESPONDED);

        givenLeader()
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(2))
                .body("data.excludedMemberCount", equalTo(0));

        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.SCHEDULED);
        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow()
                .getAssignmentCompletedAt()).isNotNull();
        assertThat(interviewRoundMemberRepository.findById(first.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.ASSIGNED);
        assertThat(interviewRoundMemberRepository.findById(second.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.ASSIGNED);
    }

    @Test
    @DisplayName("확정되면 배정된 지원자 전원에게 면접 확정 알림이 발송된다")
    void confirmNotifiesAssignedApplicants() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "알림대상");
        saveMemberWithSchedule(round, application, slot, RoundMemberStatus.RESPONDED);

        givenLeader()
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value());

        Long applicantUserId = userRepository.findById(application.getUser().getId()).orElseThrow().getId();
        String dedupKey = "INTERVIEW_SCHEDULED:a=" + application.getId() + ":s=" + slot.getId();
        assertThat(notificationRepository.existsByUserIdAndDedupKey(applicantUserId, dedupKey)).isTrue();
    }

    @Test
    @DisplayName("미처리 멤버가 있으면 강제 없는 확정은 2종으로 분리된 경고와 함께 거부된다")
    void unresolvedMembersBlockConfirmWithSplitWarning() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        saveScheduledMember(round, "배정완료", slot, RoundMemberStatus.RESPONDED);
        // (a) 미응답·가능없음 — unresponded 로 분류
        saveMember(round, saveInterviewPendingApplication(recruitment, "미응답자"), RoundMemberStatus.INVITED);
        saveMember(round, saveInterviewPendingApplication(recruitment, "가능없음자"), RoundMemberStatus.NO_AVAILABLE_SLOT);
        // (b) 응답했는데 만석 미배정 — respondedUnassigned 로 강조 분류
        Application unluckyApplication = saveInterviewPendingApplication(recruitment, "만석미배정");
        saveMember(round, unluckyApplication, RoundMemberStatus.RESPONDED);
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                unluckyApplication.getId(), slot.getId(), round.getId()));

        givenLeader()
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("data.code", equalTo("INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS"))
                .body("data.unresponded", hasSize(2))
                .body("data.unresponded.memberStatus", hasItem("INVITED"))
                .body("data.unresponded.memberStatus", hasItem("NO_AVAILABLE_SLOT"))
                .body("data.respondedUnassigned", hasSize(1))
                .body("data.respondedUnassigned[0].applicationId",
                        equalTo(unluckyApplication.getId().intValue()))
                .body("data.respondedUnassigned[0].selectedSlotIds", hasItem(slot.getId().intValue()));

        // 거부는 무부작용 — 라운드·멤버 상태가 그대로다.
        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.ASSIGNING);
    }

    @Test
    @DisplayName("강제 확정하면 미처리 멤버가 자동 제외되어 후보 대기열로 복귀하고 라운드는 종결된다")
    void forceConfirmExcludesUnresolvedAndCompletes() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        saveScheduledMember(round, "배정완료", slot, RoundMemberStatus.RESPONDED);
        Application unresolvedApplication = saveInterviewPendingApplication(recruitment, "미응답복귀");
        InterviewRoundMember unresolvedMember =
                saveMember(round, unresolvedApplication, RoundMemberStatus.INVITED);

        givenLeader()
                .queryParam("force", true)
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.excludedMemberCount", equalTo(1));

        assertThat(interviewRoundMemberRepository.findById(unresolvedMember.getId()).orElseThrow()
                .getStatus()).isEqualTo(RoundMemberStatus.EXCLUDED);
        // 제외된 지원자는 후보 대기열로 즉시 복귀한다 (application 은 INTERVIEW_PENDING 유지).
        givenLeader()
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.applicationId", hasItem(unresolvedApplication.getId().intValue()));
        // 제외된 지원자에게는 확정 알림이 가지 않는다.
        Long excludedUserId = userRepository.findById(unresolvedApplication.getUser().getId())
                .orElseThrow().getId();
        assertThat(notificationRepository.existsByUserIdAndDedupKey(excludedUserId,
                "INTERVIEW_SCHEDULED:a=" + unresolvedApplication.getId() + ":s=" + slot.getId()))
                .isFalse();
    }

    @Test
    @DisplayName("수동 배정된 가능없음·미응답 멤버도 확정 시 ASSIGNED 로 전이된다")
    void manuallyScheduledNonRespondedMembersConfirm() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        InterviewRoundMember noSlotMember = saveScheduledMember(round, "가능없음배정",
                slot, RoundMemberStatus.NO_AVAILABLE_SLOT);
        InterviewRoundMember invitedMember = saveScheduledMember(round, "미응답배정",
                slot, RoundMemberStatus.INVITED);

        givenLeader()
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(2));

        assertThat(interviewRoundMemberRepository.findById(noSlotMember.getId()).orElseThrow()
                .getStatus()).isEqualTo(RoundMemberStatus.ASSIGNED);
        assertThat(interviewRoundMemberRepository.findById(invitedMember.getId()).orElseThrow()
                .getStatus()).isEqualTo(RoundMemberStatus.ASSIGNED);
    }

    @Test
    @DisplayName("확정 후 지원자는 확정 일정 단계로, 강제 제외된 지원자는 다음 회차 대기 단계로 보인다")
    void phasesAfterConfirm() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application assignedApplication = saveInterviewPendingApplication(recruitment, "확정지원자");
        saveMemberWithSchedule(round, assignedApplication, slot, RoundMemberStatus.RESPONDED);
        Application excludedApplication = saveInterviewPendingApplication(recruitment, "제외지원자");
        saveMember(round, excludedApplication, RoundMemberStatus.INVITED);

        givenLeader().queryParam("force", true)
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value());

        givenApplicant(assignedApplication)
                .when().get(VIEW_PATH, assignedApplication.getId())
                .then().body("data.phase", equalTo("SCHEDULED"))
                .body("data.scheduledInterview.startTime", equalTo("2026-06-20T14:00:00"));
        givenApplicant(excludedApplication)
                .when().get(VIEW_PATH, excludedApplication.getId())
                .then().body("data.phase", equalTo("WAITING_NEXT_ROUND"));
    }

    @Test
    @DisplayName("배정이 하나도 없는 라운드는 강제로도 확정할 수 없다")
    void roundWithoutSchedulesCannotConfirm() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        saveMember(round, saveInterviewPendingApplication(recruitment, "무배정"), RoundMemberStatus.RESPONDED);

        givenLeader().queryParam("force", true)
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());

        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.ASSIGNING);
    }

    @Test
    @DisplayName("이미 확정됐거나 배정 검토 전인 라운드는 확정할 수 없다")
    void nonAssigningRoundsCannotConfirm() {
        InterviewRound scheduled = saveRound(RoundStatus.SCHEDULED);
        InterviewRound collecting = saveRound(RoundStatus.COLLECTING);

        givenLeader().when().post(CONFIRM_PATH, scheduled.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
        givenLeader().when().post(CONFIRM_PATH, collecting.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("존재하지 않는 라운드는 404, 타 동아리 운영진은 403 을 받는다")
    void notFoundAndForbiddenGuards() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        User outsider = saveUser("타인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        givenLeader().when().post(CONFIRM_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("선정부터 확정까지 — 라운드 생애주기 전체가 API 만으로 완주된다")
    void fullLifecycleEndToEnd() {
        // 1) 후보 선정 → 라운드 생성 (DRAFT)
        Application applicant = saveInterviewPendingApplication(recruitment, "완주자");
        Long roundId = ((Number) givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접",
                        "availabilityDeadline", LocalDateTime.now().plusDays(3).toString(),
                        "applicationIds", List.of(applicant.getId())))
                .when().post("/api/v1/leader/recruitments/{recruitmentId}/interview-rounds",
                        recruitment.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data.roundId")).longValue();

        // 2) 슬롯 생성 → 발송 (COLLECTING + 알림)
        Long slotId = ((Number) givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(Map.of(
                        "startTime", "2026-06-20T14:00:00",
                        "endTime", "2026-06-20T14:30:00",
                        "capacity", 1))))
                .when().post("/api/v1/leader/interview-rounds/{roundId}/slots", roundId)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data.createdSlotIds[0]")).longValue();
        givenLeader().when().post("/api/v1/leader/interview-rounds/{roundId}/request-availability", roundId)
                .then().statusCode(HttpStatus.OK.value());

        // 3) 지원자 응답 (RESPONDED)
        givenApplicant(applicant)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slotId)))
                .when().put("/api/v1/applications/{applicationId}/interview-availability", applicant.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 4) 자동배정 (ASSIGNING + draft) → 확정 (SCHEDULED + ASSIGNED + 알림)
        givenLeader().when().post("/api/v1/leader/interview-rounds/{roundId}/auto-assign", roundId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1));
        givenLeader().when().post(CONFIRM_PATH, roundId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.excludedMemberCount", equalTo(0));

        // 5) 종결 검증 — 지원자 화면·알림까지
        givenApplicant(applicant)
                .when().get(VIEW_PATH, applicant.getId())
                .then().body("data.phase", equalTo("SCHEDULED"));
        Long applicantUserId = userRepository.findById(applicant.getUser().getId()).orElseThrow().getId();
        assertThat(notificationRepository.existsByUserIdAndDedupKey(applicantUserId,
                "INTERVIEW_SCHEDULED:a=" + applicant.getId() + ":s=" + slotId)).isTrue();
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private io.restassured.specification.RequestSpecification givenLeader() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken);
    }

    private io.restassured.specification.RequestSpecification givenApplicant(Application application) {
        User applicant = userRepository.findById(application.getUser().getId()).orElseThrow();
        String token = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private InterviewRound saveRound(RoundStatus status) {
        return interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().minusHours(1), "본관 201호", status));
    }

    private InterviewSlot saveSlot(InterviewRound round, String start, int capacity) {
        LocalDateTime startTime = LocalDateTime.parse(start);
        return interviewSlotRepository.save(InterviewSlot.create(
                round.getId(), startTime, startTime.plusMinutes(30), capacity));
    }

    private InterviewRoundMember saveMember(InterviewRound round, Application application,
                                            RoundMemberStatus status) {
        InterviewRoundMember member = InterviewRoundMember.invite(round.getId(), application.getId());
        if (status != RoundMemberStatus.INVITED) {
            ReflectionTestUtils.setField(member, "status", status);
        }
        return interviewRoundMemberRepository.save(member);
    }

    private InterviewRoundMember saveScheduledMember(InterviewRound round, String name,
                                                     InterviewSlot slot, RoundMemberStatus status) {
        Application application = saveInterviewPendingApplication(recruitment, name);
        return saveMemberWithSchedule(round, application, slot, status);
    }

    private InterviewRoundMember saveMemberWithSchedule(InterviewRound round, Application application,
                                                        InterviewSlot slot, RoundMemberStatus status) {
        InterviewRoundMember member = saveMember(round, application, status);
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), round.getId(), LocalDateTime.now()));
        return member;
    }
}

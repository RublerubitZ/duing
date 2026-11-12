package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import com.duing.global.constant.ErrorCodes;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
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

// 라운드 취소(§16-2 schedule 정리 + 멤버 자동 재큐잉)와 부분 수정(title/location/deadline —
// phase 별 허용 범위). 취소 알림은 없다 (§8 — INTERVIEW_CANCELLED 발행 경로 없음).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewRoundManageControllerTest extends InterviewControllerTestSupport {

    private static final String ROUND_PATH = "/api/v1/leader/interview-rounds/{roundId}";
    private static final String CANCEL_PATH = "/api/v1/leader/interview-rounds/{roundId}/cancel";
    private static final String CANDIDATES_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-round-candidates";
    private static final String VIEW_PATH = "/api/v1/applications/{applicationId}/interview";
    private static final String ROUND_STATUS_CHANGED_MESSAGE =
            "라운드 단계가 바뀌었습니다. 최신 상태를 확인한 뒤 다시 시도해주세요.";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("관리동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "관리모집");
    }

    // ── 취소 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("배정 검토 중 라운드를 취소하면 draft 배정이 정리되고 멤버들이 후보 대기열로 복귀한다")
    void cancelCleansSchedulesAndRequeuesMembers() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusHours(1));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        Application application = saveInterviewPendingApplication(recruitment, "복귀자");
        saveMember(round, application, RoundMemberStatus.RESPONDED);
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), round.getId(), LocalDateTime.now()));

        givenLeader()
                .when().post(CANCEL_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.CANCELLED);
        // §16-2 — 취소된 라운드의 draft 배정이 잔존하면 새 라운드 배정과 병존해 reader 가 깨진다.
        assertThat(interviewScheduleRepository.findByRoundIdAndStatus(
                round.getId(), InterviewScheduleStatus.ASSIGNED)).isEmpty();
        // 멤버는 전이 없이 자동 재큐잉 — placement 술어가 CANCELLED 라운드를 제외한다.
        givenLeader()
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.applicationId", hasItem(application.getId().intValue()));
        // 지원자에겐 참여 이력으로 집계되어 다음 회차 대기로 보인다.
        givenApplicant(application)
                .when().get(VIEW_PATH, application.getId())
                .then().body("data.phase", equalTo("WAITING_NEXT_ROUND"));
    }

    @Test
    @DisplayName("발송 전·응답 수집 중 라운드도 취소할 수 있다")
    void draftAndCollectingRoundsCancel() {
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        InterviewRound collectingRound = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));

        givenLeader().when().post(CANCEL_PATH, draftRound.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        givenLeader().when().post(CANCEL_PATH, collectingRound.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("확정된 라운드는 취소할 수 없고, 취소된 라운드는 다시 취소할 수 없다")
    void terminalRoundsCannotCancel() {
        InterviewRound scheduled = saveRound(RoundStatus.SCHEDULED, LocalDateTime.now().minusDays(1));
        InterviewRound cancelled = saveRound(RoundStatus.CANCELLED, LocalDateTime.now().minusDays(1));

        givenLeader().when().post(CANCEL_PATH, scheduled.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
        givenLeader().when().post(CANCEL_PATH, cancelled.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    // ── 취소 — 화면이 본 단계(expectedRoundStatus) ──────────────────────────────
    // 라운드 만들기의 '작성 중인 라운드' 창이 열린 사이 다른 탭·운영진이 그 초안을 발송하면, 창의 [폐기]가
    // 응답 수집 중인 라운드를 되돌릴 수 없게 취소하면 안 된다. 창은 DRAFT 를 실어 보내고 서버가 잠금 뒤 비교한다.

    @Test
    @DisplayName("초안이라고 보고 폐기했는데 그사이 발송된 라운드는 취소되지 않고 단계가 바뀌었다는 409 다")
    void cancelExpectingDraftRejectsSentRound() {
        InterviewRound sentRound = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));

        givenLeader()
                .queryParam("expectedRoundStatus", "DRAFT")
                .when().post(CANCEL_PATH, sentRound.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo(ROUND_STATUS_CHANGED_MESSAGE));

        assertThat(interviewRoundRepository.findById(sentRound.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.COLLECTING);
    }

    @Test
    @DisplayName("초안이라고 보고 폐기했는데 배정 검토 중인 라운드도 거절되고 초안 배정이 그대로 남는다")
    void cancelExpectingDraftRejectsAssigningRoundAndKeepsSchedules() {
        InterviewRound assigningRound = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusHours(1));
        InterviewSlot slot = saveSlot(assigningRound, "2026-06-20T14:00:00");
        Application application = saveInterviewPendingApplication(recruitment, "배정유지자");
        saveMember(assigningRound, application, RoundMemberStatus.RESPONDED);
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), assigningRound.getId(), LocalDateTime.now()));

        givenLeader()
                .queryParam("expectedRoundStatus", "DRAFT")
                .when().post(CANCEL_PATH, assigningRound.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo(ROUND_STATUS_CHANGED_MESSAGE));

        assertThat(interviewRoundRepository.findById(assigningRound.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.ASSIGNING);
        assertThat(interviewScheduleRepository.findByRoundIdAndStatus(
                assigningRound.getId(), InterviewScheduleStatus.ASSIGNED)).hasSize(1);
    }

    @Test
    @DisplayName("초안이라고 보고 폐기했는데 이미 취소된 라운드도 단계가 바뀌었다는 409 다 — 단계 확인이 취소 가능 여부 확인보다 먼저다")
    void cancelExpectingDraftOnCancelledRoundReportsStatusChanged() {
        InterviewRound cancelledRound = saveRound(RoundStatus.CANCELLED, LocalDateTime.now().minusDays(1));

        givenLeader()
                .queryParam("expectedRoundStatus", "DRAFT")
                .when().post(CANCEL_PATH, cancelledRound.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo(ROUND_STATUS_CHANGED_MESSAGE));
    }

    @Test
    @DisplayName("초안이라고 보고 폐기한 라운드가 아직 초안이면 취소된다")
    void cancelExpectingDraftCancelsDraftRound() {
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));

        givenLeader()
                .queryParam("expectedRoundStatus", "DRAFT")
                .when().post(CANCEL_PATH, draftRound.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewRoundRepository.findById(draftRound.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.CANCELLED);
    }

    @Test
    @DisplayName("타 동아리 사용자는 화면 단계를 실어 보내도 라운드 단계를 알 수 없고 미존재와 같은 404 다")
    void cancelByOutsiderWithExpectedStatusIsNotFound() {
        InterviewRound collectingRound = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        User outsider = saveUser("타인폐기");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .queryParam("expectedRoundStatus", "DRAFT")
                .when().post(CANCEL_PATH, collectingRound.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        assertThat(interviewRoundRepository.findById(collectingRound.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.COLLECTING);
    }

    @Test
    @DisplayName("알 수 없는 단계 값(소문자 포함)은 400 이고 라운드는 취소되지 않는다")
    void cancelWithUnknownExpectedStatusIsBadRequest() {
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));

        givenLeader()
                .queryParam("expectedRoundStatus", "draft")
                .when().post(CANCEL_PATH, draftRound.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("요청 파라미터 'expectedRoundStatus' 의 형식이 올바르지 않습니다."));

        assertThat(interviewRoundRepository.findById(draftRound.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.DRAFT);
    }

    @Test
    @DisplayName("단계 값이 비어 있으면 보내지 않은 것과 같아 단계 확인 없이 취소된다 — 화면은 값이 없으면 키를 빼고 보내야 한다")
    void cancelWithEmptyExpectedStatusSkipsCheck() {
        InterviewRound collectingRound = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));

        givenLeader()
                .queryParam("expectedRoundStatus", "")
                .when().post(CANCEL_PATH, collectingRound.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewRoundRepository.findById(collectingRound.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.CANCELLED);
    }

    @Test
    @DisplayName("화면 단계가 실제와 같아도 확정된 라운드는 취소할 수 없다 — 단계 확인이 취소 가능 여부를 대신하지 않는다")
    void cancelWithMatchingExpectedStatusStillRejectsScheduledRound() {
        InterviewRound scheduledRound = saveRound(RoundStatus.SCHEDULED, LocalDateTime.now().minusDays(1));

        givenLeader()
                .queryParam("expectedRoundStatus", "SCHEDULED")
                .when().post(CANCEL_PATH, scheduledRound.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo("현재 단계에서 허용되지 않는 라운드 상태 변경입니다."));

        assertThat(interviewRoundRepository.findById(scheduledRound.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.SCHEDULED);
    }

    @Test
    @DisplayName("마감된 모집에서도 초안이라고 보고 폐기한 초안 라운드는 취소된다 — 화면 단계 확인이 마감 후 정리를 막지 않는다")
    void closedRecruitmentAllowsDraftDiscardWithExpectedStatus() {
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.saveAndFlush(recruitment);

        givenLeader()
                .queryParam("expectedRoundStatus", "DRAFT")
                .when().post(CANCEL_PATH, draftRound.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewRoundRepository.findById(draftRound.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.CANCELLED);
    }

    @Test
    @DisplayName("취소된 라운드의 자리에 같은 모집의 새 라운드를 만들 수 있다")
    void newRoundAfterCancel() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "재선정자");
        saveMember(round, application, RoundMemberStatus.INVITED);
        givenLeader().when().post(CANCEL_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "재시도 면접",
                        "availabilityDeadline", LocalDateTime.now().plusDays(5)
                                .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                        "applicationIds", java.util.List.of(application.getId())))
                .when().post("/api/v1/leader/recruitments/{recruitmentId}/interview-rounds",
                        recruitment.getId())
                .then().statusCode(HttpStatus.CREATED.value());
    }

    // ── 수정 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("발송 전 라운드의 제목·장소·마감을 한 번에 수정할 수 있다")
    void draftRoundUpdatesAllFields() {
        InterviewRound round = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        // 마감은 미래여야 한다(DRAFT). 고정 날짜는 시간이 지나면 과거가 되어 테스트가 깨지므로 현재 기준 상대값을 쓴다.
        String newDeadlineText = LocalDate.now().plusDays(10) + "T23:59:00";
        LocalDateTime newDeadline = LocalDateTime.parse(newDeadlineText);

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 대면 면접", "location", "본관 201호",
                        "availabilityDeadline", newDeadlineText))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        InterviewRound updated = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(updated.getTitle()).isEqualTo("1차 대면 면접");
        assertThat(updated.getLocation()).isEqualTo("본관 201호");
        assertThat(updated.getAvailabilityDeadline()).isEqualTo(newDeadline);
    }

    @Test
    @DisplayName("일부 필드만 보내면 나머지는 바뀌지 않는다")
    void partialUpdateKeepsOtherFields() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        String originalTitle = round.getTitle();

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("location", "신관 302호"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        InterviewRound updated = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(updated.getLocation()).isEqualTo("신관 302호");
        assertThat(updated.getTitle()).isEqualTo(originalTitle);
    }

    @Test
    @DisplayName("응답 수집 중 마감을 연장하면 지원자 화면에도 새 마감이 보인다")
    void collectingDeadlineExtensionReflectsToApplicant() {
        // 마감은 미래여야 하고 연장만 가능하다. 고정 날짜는 시간이 지나면 깨지므로 현재 기준 상대값을 쓴다.
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(5));
        Application application = saveInterviewPendingApplication(recruitment, "연장수혜자");
        saveMember(round, application, RoundMemberStatus.INVITED);
        saveSlot(round, LocalDate.now().plusDays(6) + "T14:00:00");

        String extendedDeadlineText = LocalDate.now().plusDays(7) + "T23:59:00";

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", extendedDeadlineText))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        givenApplicant(application)
                .when().get(VIEW_PATH, application.getId())
                .then().body("data.phase", equalTo("AVAILABILITY_REQUESTED"))
                .body("data.availabilityDeadline", equalTo(extendedDeadlineText));
    }

    @Test
    @DisplayName("응답 수집 중 마감 단축은 거부된다 — 응답 기회의 소급 박탈")
    void collectingDeadlineShorteningIsRejected() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.parse("2026-06-21T23:59:00"));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", "2026-06-18T23:59:00"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("배정 검토 중에는 장소 수정은 되지만 마감 변경은 거부된다")
    void assigningAllowsInfoButFreezesDeadline() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusHours(1));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("location", "본관 201호"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", "2026-06-30T23:59:00"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("확정된 라운드는 수정할 수 없다")
    void scheduledRoundRejectsUpdate() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED, LocalDateTime.now().minusDays(1));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "변경 시도"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("빈 제목이나 아무 필드도 없는 수정 요청은 거부된다")
    void blankTitleAndEmptyUpdateAreRejected() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));

        Map<String, Object> blankTitle = new HashMap<>();
        blankTitle.put("title", "   ");
        givenLeader()
                .contentType(ContentType.JSON)
                .body(blankTitle)
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of())
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 라운드와 타 동아리 사용자의 요청은 똑같이 404 다")
    void notFoundAndForbiddenGuards() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        User outsider = saveUser("타인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        givenLeader().when().post(CANCEL_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "없는 라운드"))
                .when().patch(ROUND_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "남의 라운드"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
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

    private InterviewRound saveRound(RoundStatus status, LocalDateTime deadline) {
        return interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), deadline, null, status));
    }

    private InterviewSlot saveSlot(InterviewRound round, String start) {
        LocalDateTime startTime = LocalDateTime.parse(start);
        return interviewSlotRepository.save(InterviewSlot.create(
                round.getId(), startTime, startTime.plusMinutes(30), 1));
    }

    private InterviewRoundMember saveMember(InterviewRound round, Application application,
                                            RoundMemberStatus status) {
        InterviewRoundMember member = InterviewRoundMember.invite(round.getId(), application.getId());
        if (status != RoundMemberStatus.INVITED) {
            ReflectionTestUtils.setField(member, "status", status);
        }
        return interviewRoundMemberRepository.save(member);
    }
    // 마감된 모집의 라운드 쓰기 — 마감 후에도 열려 있으면 일정을 바꾸고 확정해 학생에게 면접 알림이
    // 계속 나간다. 정작 그 결과를 반영하려는 순간에야 막히던 모순을 없앤다 (스펙 §1-3 개정).
    @Test
    @DisplayName("마감된 모집의 면접 라운드는 취소할 수 있다 — 자동 마감으로 남은 라운드를 치울 유일한 수단")
    void closedRecruitmentStillAllowsRoundCancel() {
        InterviewRound round = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.saveAndFlush(recruitment);

        givenLeader()
                .when().post(CANCEL_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.CANCELLED);
    }

    @Test
    @DisplayName("마감된 모집의 면접 라운드는 수정할 수 없고 마감 코드와 함께 409 로 거절된다")
    void closedRecruitmentBlocksRoundUpdate() {
        InterviewRound round = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.saveAndFlush(recruitment);

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("location", "바뀐 장소"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo(ErrorCodes.RECRUITMENT_CLOSED));
    }

    @Test
    @DisplayName("마감된 모집의 면접 라운드 상세는 계속 조회된다 — 쓰기 가드가 열람까지 막지 않는다")
    void closedRecruitmentStillAllowsRoundRead() {
        // 라운드 상세는 InterviewRoundAccessor 조회 경로를 타므로, 쓰기 전환이 열람을 막았는지 여기서 드러난다.
        InterviewRound round = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.saveAndFlush(recruitment);

        givenLeader()
                .when().get(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value());
    }

}

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
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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
        LocalDateTime newDeadline = LocalDateTime.parse("2026-06-25T23:59:00");

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 대면 면접", "location", "본관 201호",
                        "availabilityDeadline", "2026-06-25T23:59:00"))
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
        LocalDateTime original = LocalDateTime.parse("2026-06-18T23:59:00");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, original);
        Application application = saveInterviewPendingApplication(recruitment, "연장수혜자");
        saveMember(round, application, RoundMemberStatus.INVITED);
        saveSlot(round, "2026-06-20T14:00:00");

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", "2026-06-21T23:59:00"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        givenApplicant(application)
                .when().get(VIEW_PATH, application.getId())
                .then().body("data.phase", equalTo("AVAILABILITY_REQUESTED"))
                .body("data.availabilityDeadline", equalTo("2026-06-21T23:59:00"));
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
    @DisplayName("존재하지 않는 라운드는 404, 타 동아리 운영진은 403 을 받는다")
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
                .then().statusCode(HttpStatus.FORBIDDEN.value());
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
}

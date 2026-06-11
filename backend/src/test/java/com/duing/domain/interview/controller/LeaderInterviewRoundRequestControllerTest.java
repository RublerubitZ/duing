package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
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

// 발송(DRAFT→COLLECTING + INVITED 전원 알림)과 재알림(COLLECTING, 미응답 대상)을 검증한다.
// 발송 가드 3종(슬롯≥1·INVITED≥1·deadline 필수/미래)은 wizard 발송 버튼 조건과 1:1 이다 (스펙 §9.1 API 5·6·§10.3).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewRoundRequestControllerTest extends InterviewControllerTestSupport {

    private static final String REQUEST_PATH = "/api/v1/leader/interview-rounds/{roundId}/request-availability";
    private static final String REMIND_PATH = "/api/v1/leader/interview-rounds/{roundId}/remind";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private NotificationRepository notificationRepository;

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("발송동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "발송모집");
    }

    // ── 발송 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("슬롯과 대상자가 준비된 라운드를 발송하면 응답 수집이 시작되고 전원에게 알림이 간다")
    void requestAvailabilityOpensCollectingAndNotifiesAll() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().plusDays(7));
        saveSlot(round);
        Application first = saveInterviewPendingApplication(recruitment, "대상자1");
        Application second = saveInterviewPendingApplication(recruitment, "대상자2");
        saveMember(round, first, RoundMemberStatus.INVITED);
        saveMember(round, second, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.notifiedMemberCount", equalTo(2));

        InterviewRound sent = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(sent.getStatus()).isEqualTo(RoundStatus.COLLECTING);
        assertThat(sent.getRequestSequence()).isEqualTo(1);
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                first.getUser().getId(), requestDedupKey(round, first, 1))).isTrue();
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                second.getUser().getId(), requestDedupKey(round, second, 1))).isTrue();
    }

    @Test
    @DisplayName("슬롯이 하나도 없는 라운드는 발송할 수 없다")
    void requestWithoutSlotsIsRejected() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().plusDays(7));
        Application target = saveInterviewPendingApplication(recruitment, "대상자");
        saveMember(round, target, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());

        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.DRAFT);
    }

    @Test
    @DisplayName("마감 시각이 설정되지 않은 라운드는 발송할 수 없다")
    void requestWithoutDeadlineIsRejected() {
        InterviewRound round = saveDraftRound(null);
        saveSlot(round);
        Application target = saveInterviewPendingApplication(recruitment, "대상자");
        saveMember(round, target, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("마감 시각이 이미 지난 라운드는 발송할 수 없다")
    void requestWithPastDeadlineIsRejected() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().minusHours(1));
        saveSlot(round);
        Application target = saveInterviewPendingApplication(recruitment, "대상자");
        saveMember(round, target, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("초대 상태의 대상자가 없는 라운드는 발송할 수 없다")
    void requestWithoutInvitedMembersIsRejected() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().plusDays(7));
        saveSlot(round);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("이미 발송된 라운드는 다시 발송할 수 없다")
    void alreadyCollectingRoundCannotBeRequestedAgain() {
        InterviewRound round = saveRoundWithStatus(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveSlot(round);
        Application target = saveInterviewPendingApplication(recruitment, "대상자");
        saveMember(round, target, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("취소된 라운드는 발송할 수 없다")
    void cancelledRoundCannotBeRequested() {
        InterviewRound round = saveRoundWithStatus(RoundStatus.CANCELLED, LocalDateTime.now().plusDays(3));
        saveSlot(round);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("해당 동아리 운영진이 아니면 발송할 수 없다")
    void nonManagerCannotRequest() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().plusDays(7));
        User outsider = saveUser("외부인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 라운드의 발송은 404 를 반환한다")
    void unknownRoundRequestReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 재알림 ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("재알림은 아직 응답하지 않은 대상자에게만 새 회차로 발송된다")
    void remindNotifiesOnlyUnrespondedMembers() {
        InterviewRound round = saveRoundWithStatus(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        ReflectionTestUtils.setField(round, "requestSequence", 1);
        round = interviewRoundRepository.save(round);
        Application silent = saveInterviewPendingApplication(recruitment, "미응답자");
        Application responded = saveInterviewPendingApplication(recruitment, "응답자");
        saveMember(round, silent, RoundMemberStatus.INVITED);
        saveMember(round, responded, RoundMemberStatus.RESPONDED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REMIND_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.notifiedMemberCount", equalTo(1));

        InterviewRound reminded = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(reminded.getRequestSequence()).isEqualTo(2);
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                silent.getUser().getId(), requestDedupKey(round, silent, 2))).isTrue();
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                responded.getUser().getId(), requestDedupKey(round, responded, 2))).isFalse();
    }

    @Test
    @DisplayName("응답 마감이 지난 뒤에도 재알림을 보낼 수 있다")
    void remindIsAllowedAfterDeadline() {
        InterviewRound round = saveRoundWithStatus(RoundStatus.COLLECTING, LocalDateTime.now().minusHours(1));
        Application silent = saveInterviewPendingApplication(recruitment, "마감후미응답");
        saveMember(round, silent, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REMIND_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.notifiedMemberCount", equalTo(1));
    }

    @Test
    @DisplayName("미응답 대상자가 없으면 재알림을 보낼 수 없다")
    void remindWithoutUnrespondedMembersIsRejected() {
        InterviewRound round = saveRoundWithStatus(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        Application responded = saveInterviewPendingApplication(recruitment, "전원응답");
        saveMember(round, responded, RoundMemberStatus.RESPONDED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REMIND_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("발송 전(DRAFT) 라운드에는 재알림을 보낼 수 없다")
    void remindRequiresCollectingStatus() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().plusDays(7));
        Application target = saveInterviewPendingApplication(recruitment, "드래프트대상");
        saveMember(round, target, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REMIND_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private InterviewRound saveDraftRound(LocalDateTime deadline) {
        return interviewRoundRepository.save(InterviewRoundFixture.draft(recruitment.getId(), deadline));
    }

    private InterviewRound saveRoundWithStatus(RoundStatus status, LocalDateTime deadline) {
        return interviewRoundRepository.save(
                InterviewRoundFixture.withStatus(recruitment.getId(), deadline, null, status));
    }

    private void saveSlot(InterviewRound round) {
        LocalDateTime startTime = LocalDateTime.now().plusDays(10);
        interviewSlotRepository.save(InterviewSlot.create(
                round.getId(), startTime, startTime.plusMinutes(30), 1));
    }

    private void saveMember(InterviewRound round, Application application, RoundMemberStatus status) {
        InterviewRoundMember member = InterviewRoundMember.invite(round.getId(), application.getId());
        if (status != RoundMemberStatus.INVITED) {
            ReflectionTestUtils.setField(member, "status", status);
        }
        interviewRoundMemberRepository.save(member);
    }

    private String requestDedupKey(InterviewRound round, Application application, int sequence) {
        return "INTERVIEW_AVAILABILITY_REQUESTED:r=" + round.getId()
                + ":a=" + application.getId() + ":q=" + sequence;
    }
}

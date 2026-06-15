package com.duing.domain.interview.controller;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
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

// 라운드 목록(카운트 요약)과 상세 dashboard(카운트 카드·멤버 테이블·파생 미응답·슬롯 집계)를 검증한다.
// 미응답은 저장하지 않고 INVITED && now > deadline 로 파생한다 (스펙 §5.3·§9.1 API 3·§10.4).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewRoundDashboardControllerTest extends InterviewControllerTestSupport {

    private static final String LIST_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-rounds";
    private static final String DETAIL_PATH = "/api/v1/leader/interview-rounds/{roundId}";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("대시보드동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "대시보드모집");
    }

    // ── 목록 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("라운드 목록은 최신 생성 순으로 카운트 요약과 함께 반환된다")
    void roundListReturnsSummariesWithCounts() {
        InterviewRound older = saveRound(RoundStatus.SCHEDULED, LocalDateTime.now().minusDays(3));
        InterviewRound newer = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        Application respondedMember = saveInterviewPendingApplication(recruitment, "응답");
        Application invitedMember = saveInterviewPendingApplication(recruitment, "대기");
        Application excludedMember = saveInterviewPendingApplication(recruitment, "제외");
        saveMember(newer, respondedMember, RoundMemberStatus.RESPONDED, null);
        saveMember(newer, invitedMember, RoundMemberStatus.INVITED, null);
        saveMember(newer, excludedMember, RoundMemberStatus.EXCLUDED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(LIST_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data.roundId", contains(newer.getId().intValue(), older.getId().intValue()))
                // 총원은 EXCLUDED 를 제외한 응답 가능 대상 (N), 응답수는 응답 행위 완료 (n)
                .body("data[0].totalMemberCount", equalTo(2))
                .body("data[0].respondedMemberCount", equalTo(1))
                .body("data[0].status", equalTo("COLLECTING"))
                .body("data[1].totalMemberCount", equalTo(0));
    }

    @Test
    @DisplayName("라운드가 없는 모집의 목록은 빈 배열을 반환한다")
    void emptyRoundListReturnsEmptyArray() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(LIST_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집의 라운드 목록 조회는 400 으로 거부된다")
    void interviewNotUsedListIsRejected() {
        Club club = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment simpleRecruitment = saveSimpleRecruitment(club, "면접없는모집");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(LIST_PATH, simpleRecruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("해당 동아리 운영진이 아니면 라운드 목록을 볼 수 없다")
    void nonManagerCannotListRounds() {
        User outsider = saveUser("외부인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get(LIST_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 모집의 라운드 목록은 404 를 반환한다")
    void unknownRecruitmentListReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(LIST_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 상세 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("상세 dashboard 는 상태별 카운트 카드를 제공한다 — 총원은 제외 멤버를 빼고 센다")
    void detailProvidesStatusCounts() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, saveInterviewPendingApplication(recruitment, "초대"), RoundMemberStatus.INVITED, null);
        saveMember(round, saveInterviewPendingApplication(recruitment, "응답"), RoundMemberStatus.RESPONDED, null);
        saveMember(round, saveInterviewPendingApplication(recruitment, "불가"), RoundMemberStatus.NO_AVAILABLE_SLOT, "주말만");
        saveMember(round, saveInterviewPendingApplication(recruitment, "제외"), RoundMemberStatus.EXCLUDED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.title", equalTo("1차 면접"))
                .body("data.status", equalTo("COLLECTING"))
                .body("data.counts.totalMemberCount", equalTo(3))
                .body("data.counts.invitedCount", equalTo(1))
                .body("data.counts.respondedCount", equalTo(1))
                .body("data.counts.noAvailableSlotCount", equalTo(1))
                .body("data.counts.assignedCount", equalTo(0))
                .body("data.counts.excludedCount", equalTo(1))
                .body("data.members", hasSize(4));
    }

    @Test
    @DisplayName("마감 전에는 초대 상태 멤버가 미응답으로 집계되지 않는다")
    void beforeDeadlineInvitedIsNotUnresponded() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, saveInterviewPendingApplication(recruitment, "대기중"), RoundMemberStatus.INVITED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.deadlinePassed", equalTo(false))
                .body("data.counts.unrespondedCount", equalTo(0))
                .body("data.members[0].unresponded", equalTo(false));
    }

    @Test
    @DisplayName("마감이 지나면 초대 상태 멤버가 미응답으로 파생 집계된다")
    void afterDeadlineInvitedBecomesUnresponded() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().minusHours(1));
        saveMember(round, saveInterviewPendingApplication(recruitment, "미응답자"), RoundMemberStatus.INVITED, null);
        saveMember(round, saveInterviewPendingApplication(recruitment, "응답자"), RoundMemberStatus.RESPONDED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.deadlinePassed", equalTo(true))
                .body("data.counts.unrespondedCount", equalTo(1))
                .body("data.members.find { it.status == 'INVITED' }.unresponded", equalTo(true))
                .body("data.members.find { it.status == 'RESPONDED' }.unresponded", equalTo(false));
    }

    @Test
    @DisplayName("가능 슬롯 없음 멤버의 대체 가능시간 텍스트가 상세에 노출된다")
    void noAvailableSlotTextIsExposed() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, saveInterviewPendingApplication(recruitment, "불가자"),
                RoundMemberStatus.NO_AVAILABLE_SLOT, "평일 저녁만 가능합니다");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.members[0].alternativeAvailabilityText", equalTo("평일 저녁만 가능합니다"));
    }

    @Test
    @DisplayName("멤버별 선택 슬롯 수와 슬롯별 선택 수가 함께 집계된다")
    void selectionCountsAreAggregated() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        InterviewSlot slotA = saveSlot(round, "2026-06-20T14:00:00");
        InterviewSlot slotB = saveSlot(round, "2026-06-20T15:00:00");
        Application picky = saveInterviewPendingApplication(recruitment, "둘다선택");
        saveMember(round, picky, RoundMemberStatus.RESPONDED, null);
        interviewAvailabilityRepository.save(InterviewAvailability.create(picky.getId(), slotA.getId(), round.getId()));
        interviewAvailabilityRepository.save(InterviewAvailability.create(picky.getId(), slotB.getId(), round.getId()));
        Application single = saveInterviewPendingApplication(recruitment, "하나선택");
        saveMember(round, single, RoundMemberStatus.RESPONDED, null);
        interviewAvailabilityRepository.save(InterviewAvailability.create(single.getId(), slotA.getId(), round.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.members.find { it.applicationId == " + picky.getId() + " }.selectedSlotCount", equalTo(2))
                .body("data.members.find { it.applicationId == " + single.getId() + " }.selectedSlotCount", equalTo(1))
                .body("data.slots.find { it.slotId == " + slotA.getId() + " }.selectedCount", equalTo(2))
                .body("data.slots.find { it.slotId == " + slotB.getId() + " }.selectedCount", equalTo(1));
    }

    @Test
    @DisplayName("배정된 멤버의 슬롯과 슬롯별 배정 수가 상세에 노출된다")
    void assignedScheduleIsExposed() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusDays(1));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        Application assignee = saveInterviewPendingApplication(recruitment, "배정자");
        saveMember(round, assignee, RoundMemberStatus.RESPONDED, null);
        interviewScheduleRepository.save(InterviewSchedule.create(
                assignee.getId(), slot.getId(), round.getId(), LocalDateTime.now()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.members[0].assignedSlotId", equalTo(slot.getId().intValue()))
                .body("data.slots[0].assignedCount", equalTo(1));
    }

    @Test
    @DisplayName("슬롯은 시작 시각 오름차순으로 정렬되고 배정이 없으면 멤버의 배정 슬롯은 null 이다")
    void slotsAreSortedAndUnassignedMemberHasNullSlot() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        InterviewSlot late = saveSlot(round, "2026-06-20T16:00:00");
        InterviewSlot early = saveSlot(round, "2026-06-20T14:00:00");
        saveMember(round, saveInterviewPendingApplication(recruitment, "미배정"), RoundMemberStatus.INVITED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.slots.slotId", contains(early.getId().intValue(), late.getId().intValue()))
                .body("data.members[0].assignedSlotId", nullValue());
    }

    @Test
    @DisplayName("존재하지 않는 라운드의 상세는 404, 타 동아리 운영진은 403 을 받는다")
    void detailGuards() {
        InterviewRound round = saveRound(RoundStatus.DRAFT, LocalDateTime.now().plusDays(3));
        User outsider = saveUser("타인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private InterviewRound saveRound(RoundStatus status, LocalDateTime deadline) {
        return interviewRoundRepository.save(
                InterviewRoundFixture.withStatus(recruitment.getId(), deadline, null, status));
    }

    private InterviewSlot saveSlot(InterviewRound round, String start) {
        LocalDateTime startTime = LocalDateTime.parse(start);
        return interviewSlotRepository.save(InterviewSlot.create(
                round.getId(), startTime, startTime.plusMinutes(30), 2));
    }

    private void saveMember(InterviewRound round, Application application,
                            RoundMemberStatus status, String alternativeText) {
        InterviewRoundMember member = InterviewRoundMember.invite(round.getId(), application.getId());
        if (status != RoundMemberStatus.INVITED) {
            ReflectionTestUtils.setField(member, "status", status);
        }
        if (alternativeText != null) {
            ReflectionTestUtils.setField(member, "alternativeAvailabilityText", alternativeText);
        }
        interviewRoundMemberRepository.save(member);
    }
}

package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

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
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
import java.util.List;
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

// 자동배정 — COLLECTING→ASSIGNING 전이(첫 실행)/재실행, RESPONDED 만 대상(Rule 1),
// 그리디(제약 큰 멤버 우선·잔여 capacity 최대 슬롯), draft = round 상태로 표현·멤버는 RESPONDED 유지 (스펙 §6.1·§6.2).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewAutoAssignControllerTest extends InterviewControllerTestSupport {

    private static final String AUTO_ASSIGN_PATH = "/api/v1/leader/interview-rounds/{roundId}/auto-assign";

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
        Club club = saveActiveClub("배정동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "배정모집");
    }

    @Test
    @DisplayName("응답 수집 중 라운드에 자동배정을 실행하면 배정 검토 단계로 넘어가고 응답자들이 배정된다")
    void firstRunTransitionsAndAssigns() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slotA = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewSlot slotB = saveSlot(round, "2026-06-20T15:00:00", 1);
        Application first = saveRespondedMember(round, "응답자1", slotA);
        Application second = saveRespondedMember(round, "응답자2", slotB);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(2))
                .body("data.unassignedMemberCount", equalTo(0));

        InterviewRound assigning = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(assigning.getStatus()).isEqualTo(RoundStatus.ASSIGNING);
        List<InterviewSchedule> schedules = interviewScheduleRepository
                .findByRoundIdAndStatus(round.getId(), InterviewScheduleStatus.ASSIGNED);
        assertThat(schedules).extracting(InterviewSchedule::getApplicationId)
                .containsExactlyInAnyOrder(first.getId(), second.getId());
    }

    @Test
    @DisplayName("자동배정 후에도 멤버는 응답 완료 상태를 유지한다 — 확정 전 draft")
    void membersStayRespondedAfterAutoAssign() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveRespondedMember(round, "응답자", slot);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value());

        InterviewRoundMember member = interviewRoundMemberRepository
                .findByRoundIdAndApplicationId(round.getId(), application.getId()).orElseThrow();
        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.RESPONDED);
    }

    @Test
    @DisplayName("선택지가 적은(제약이 큰) 응답자가 먼저 배정된다")
    void leastFlexibleMemberWins() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot contested = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewSlot fallback = saveSlot(round, "2026-06-20T15:00:00", 1);
        Application flexible = saveRespondedMember(round, "여유", contested, fallback);
        Application constrained = saveRespondedMember(round, "한정", contested);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(2));

        assertThat(findAssignedSlotId(round, constrained)).isEqualTo(contested.getId());
        assertThat(findAssignedSlotId(round, flexible)).isEqualTo(fallback.getId());
    }

    @Test
    @DisplayName("선택한 슬롯 중 잔여 수용 인원이 가장 많은 슬롯으로 배정된다")
    void largestRemainingCapacitySlotIsChosen() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot tight = saveSlot(round, "2026-06-20T10:00:00", 1);
        InterviewSlot roomy = saveSlot(round, "2026-06-20T15:00:00", 3);
        Application application = saveRespondedMember(round, "분산대상", tight, roomy);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value());

        assertThat(findAssignedSlotId(round, application)).isEqualTo(roomy.getId());
    }

    @Test
    @DisplayName("선택한 슬롯이 모두 만석인 응답자는 미배정 카운트로 보고된다")
    void overflowIsReportedAsUnassigned() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot only = saveSlot(round, "2026-06-20T14:00:00", 1);
        saveRespondedMember(round, "선착", only);
        Application latecomer = saveRespondedMember(round, "만석", only);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.unassignedMemberCount", equalTo(1));

        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), latecomer.getId(),
                        InterviewScheduleStatus.ASSIGNED)).isEmpty();
    }

    @Test
    @DisplayName("가능한 시간이 없다고 응답한 멤버는 자동배정 대상이 아니다 — 카운트에도 들어가지 않는다")
    void noAvailableSlotMemberIsSkipped() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        saveRespondedMember(round, "정상응답", slot);
        Application reporter = saveInterviewPendingApplication(recruitment, "가능없음");
        saveMember(round, reporter, RoundMemberStatus.NO_AVAILABLE_SLOT);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.unassignedMemberCount", equalTo(0));

        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), reporter.getId(),
                        InterviewScheduleStatus.ASSIGNED)).isEmpty();
    }

    @Test
    @DisplayName("미응답(INVITED)·제외(EXCLUDED) 멤버는 자동배정 대상이 아니다")
    void invitedAndExcludedMembersAreSkipped() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 3);
        saveRespondedMember(round, "정상응답", slot);
        saveMember(round, saveInterviewPendingApplication(recruitment, "미응답"), RoundMemberStatus.INVITED);
        saveMember(round, saveInterviewPendingApplication(recruitment, "제외됨"), RoundMemberStatus.EXCLUDED);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.unassignedMemberCount", equalTo(0));
    }

    @Test
    @DisplayName("배정 검토 중 재실행하면 기존 draft 가 현재 멤버 상태 기준으로 재계산된다")
    void rerunRecalculatesFromCurrentState() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        Application keep = saveRespondedMember(round, "유지", slot);
        Application drop = saveRespondedMember(round, "제외예정", slot);
        givenLeader().when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(2));

        InterviewRoundMember dropMember = interviewRoundMemberRepository
                .findByRoundIdAndApplicationId(round.getId(), drop.getId()).orElseThrow();
        ReflectionTestUtils.setField(dropMember, "status", RoundMemberStatus.EXCLUDED);
        interviewRoundMemberRepository.save(dropMember);

        givenLeader().when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1));

        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), keep.getId(),
                        InterviewScheduleStatus.ASSIGNED)).isPresent();
        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), drop.getId(),
                        InterviewScheduleStatus.ASSIGNED)).isEmpty();
    }

    @Test
    @DisplayName("마감 전이라도 응답 수집 중이면 자동배정을 실행할 수 있다 — 조기 배정")
    void earlyAssignBeforeDeadlineIsAllowed() {
        InterviewRound round = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(3), null, RoundStatus.COLLECTING));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        saveRespondedMember(round, "조기전원응답", slot);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1));
    }

    @Test
    @DisplayName("발송 전이거나 이미 확정된 라운드에는 자동배정을 실행할 수 없다")
    void draftAndScheduledRoundsAreRejected() {
        InterviewRound draft = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        InterviewRound scheduled = saveRound(RoundStatus.SCHEDULED);

        givenLeader().when().post(AUTO_ASSIGN_PATH, draft.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
        givenLeader().when().post(AUTO_ASSIGN_PATH, scheduled.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("응답자가 없는 라운드의 자동배정은 빈 결과로 성공한다")
    void emptyRoundSucceedsWithZeroCounts() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        saveSlot(round, "2026-06-20T14:00:00", 1);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(0))
                .body("data.unassignedMemberCount", equalTo(0));
    }

    @Test
    @DisplayName("존재하지 않는 라운드는 404, 타 동아리 운영진은 403 을 받는다")
    void notFoundAndForbiddenGuards() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        User outsider = saveUser("타인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        givenLeader().when().post(AUTO_ASSIGN_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private io.restassured.specification.RequestSpecification givenLeader() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken);
    }

    private InterviewRound saveRound(RoundStatus status) {
        return interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().minusHours(1), null, status));
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

    private Application saveRespondedMember(InterviewRound round, String name, InterviewSlot... slots) {
        Application application = saveInterviewPendingApplication(recruitment, name);
        saveMember(round, application, RoundMemberStatus.RESPONDED);
        for (InterviewSlot slot : slots) {
            interviewAvailabilityRepository.save(
                    InterviewAvailability.create(application.getId(), slot.getId(), round.getId()));
        }
        return application;
    }

    private Long findAssignedSlotId(InterviewRound round, Application application) {
        return interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), application.getId(),
                        InterviewScheduleStatus.ASSIGNED)
                .orElseThrow().getSlotId();
    }
}

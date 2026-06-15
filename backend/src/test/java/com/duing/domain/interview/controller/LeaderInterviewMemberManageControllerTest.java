package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
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

// 멤버 단위 운영 3종 — 수동 배정/재배정(capacity 하드 체크·draft semantics), 해제, 제외(§16-3
// schedule 정리 + 대기열 즉시 복귀). 잠금은 §16-7-4 순서(round→slot→member)를 상속한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewMemberManageControllerTest extends InterviewControllerTestSupport {

    private static final String SCHEDULE_PATH =
            "/api/v1/leader/interview-rounds/{roundId}/members/{memberId}/schedule";
    private static final String EXCLUDE_PATH =
            "/api/v1/leader/interview-rounds/{roundId}/members/{memberId}/exclude";
    private static final String CANDIDATES_PATH =
            "/api/v1/leader/recruitments/{recruitmentId}/interview-round-candidates";

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
        Club club = saveActiveClub("운영동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "운영모집");
    }

    // ── 수동 배정 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("응답한 멤버를 슬롯에 수동 배정하면 schedule 이 생기고 멤버 상태는 그대로다")
    void respondedMemberCanBeManuallyAssigned() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "응답자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);

        assignSlot(round, member, slot).statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(findActiveSchedule(round, application)).isPresent();
        assertThat(interviewRoundMemberRepository.findById(member.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.RESPONDED);
    }

    @Test
    @DisplayName("가능없음·미응답 멤버도 운영진 재량으로 수동 배정할 수 있다")
    void noSlotAndInvitedMembersCanBeAssigned() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        InterviewRoundMember noSlotMember = saveMember(round,
                saveInterviewPendingApplication(recruitment, "가능없음"), RoundMemberStatus.NO_AVAILABLE_SLOT);
        InterviewRoundMember invitedMember = saveMember(round,
                saveInterviewPendingApplication(recruitment, "미응답"), RoundMemberStatus.INVITED);

        assignSlot(round, noSlotMember, slot).statusCode(HttpStatus.NO_CONTENT.value());
        assignSlot(round, invitedMember, slot).statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("다른 슬롯으로 재배정하면 기존 배정이 교체된다")
    void reassignReplacesExistingSchedule() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot oldSlot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewSlot newSlot = saveSlot(round, "2026-06-20T15:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "재배정자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);
        assignSlot(round, member, oldSlot).statusCode(HttpStatus.NO_CONTENT.value());

        assignSlot(round, member, newSlot).statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(findActiveSchedule(round, application).orElseThrow().getSlotId())
                .isEqualTo(newSlot.getId());
    }

    @Test
    @DisplayName("정원이 찬 슬롯에는 수동 배정할 수 없다 — capacity 하드 체크")
    void fullSlotRejectsManualAssign() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewRoundMember occupant = saveMember(round,
                saveInterviewPendingApplication(recruitment, "선점자"), RoundMemberStatus.RESPONDED);
        assignSlot(round, occupant, slot).statusCode(HttpStatus.NO_CONTENT.value());
        InterviewRoundMember latecomer = saveMember(round,
                saveInterviewPendingApplication(recruitment, "후발"), RoundMemberStatus.RESPONDED);

        assignSlot(round, latecomer, slot).statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("만석 슬롯이라도 그 자리에 이미 배정된 본인의 재배정은 허용된다 — 멱등")
    void reassignToSameFullSlotIsIdempotent() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "본인");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);
        assignSlot(round, member, slot).statusCode(HttpStatus.NO_CONTENT.value());

        assignSlot(round, member, slot).statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(findActiveSchedule(round, application).orElseThrow().getSlotId())
                .isEqualTo(slot.getId());
    }

    @Test
    @DisplayName("다른 라운드의 슬롯으로는 배정할 수 없다")
    void slotFromOtherRoundIsRejected() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewRound otherRound = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot foreignSlot = saveSlot(otherRound, "2026-06-20T14:00:00", 1);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "엉뚱"), RoundMemberStatus.RESPONDED);

        assignSlot(round, member, foreignSlot).statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("배정 검토 단계가 아닌 라운드에는 수동 배정할 수 없다")
    void nonAssigningRoundRejectsManualAssign() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "수집중"), RoundMemberStatus.RESPONDED);

        assignSlot(round, member, slot).statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("제외된 멤버는 수동 배정할 수 없다")
    void excludedMemberCannotBeAssigned() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "제외자"), RoundMemberStatus.EXCLUDED);

        assignSlot(round, member, slot).statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("라운드에 속하지 않은 멤버 ID 로는 배정할 수 없다")
    void memberOfOtherRoundIsNotFound() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewRound otherRound = saveRound(RoundStatus.ASSIGNING);
        InterviewRoundMember foreignMember = saveMember(otherRound,
                saveInterviewPendingApplication(recruitment, "남의멤버"), RoundMemberStatus.RESPONDED);

        assignSlot(round, foreignMember, slot).statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 해제 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("배정을 해제하면 활성 schedule 이 사라진다")
    void unassignRemovesActiveSchedule() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "해제자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);
        assignSlot(round, member, slot).statusCode(HttpStatus.NO_CONTENT.value());

        givenLeader()
                .when().delete(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(findActiveSchedule(round, application)).isEmpty();
    }

    @Test
    @DisplayName("배정이 없는 멤버의 해제는 404 를 반환한다")
    void unassignWithoutScheduleReturnsNotFound() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "무배정"), RoundMemberStatus.RESPONDED);

        givenLeader()
                .when().delete(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("확정된 라운드의 배정은 해제할 수 없다")
    void scheduledRoundRejectsUnassign() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "확정후"), RoundMemberStatus.ASSIGNED);

        givenLeader()
                .when().delete(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    // ── 제외 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("배정 검토 중 멤버를 제외하면 활성 배정이 정리되고 후보 대기열로 즉시 복귀한다")
    void excludeCleansScheduleAndReturnsToQueue() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "복귀자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);
        assignSlot(round, member, slot).statusCode(HttpStatus.NO_CONTENT.value());

        givenLeader()
                .when().post(EXCLUDE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        InterviewRoundMember excluded = interviewRoundMemberRepository
                .findById(member.getId()).orElseThrow();
        assertThat(excluded.getStatus()).isEqualTo(RoundMemberStatus.EXCLUDED);
        // §16-3 — 제외된 지원자에게 리마인더가 가거나 dashboard 에 배정이 잔존하면 안 된다.
        assertThat(findActiveSchedule(round, application)).isEmpty();
        // 대기열 즉시 복귀 — 후보 API 에 다시 노출된다 (placement-active 해제의 cross-API 검증).
        givenLeader()
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.applicationId", hasItem(application.getId().intValue()));
    }

    @Test
    @DisplayName("발송 전·응답 수집 중에도 멤버를 제외할 수 있다")
    void draftAndCollectingRoundsAllowExclude() {
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        InterviewRoundMember draftMember = saveMember(draftRound,
                saveInterviewPendingApplication(recruitment, "명단정리"), RoundMemberStatus.INVITED);
        InterviewRound collectingRound = saveRound(RoundStatus.COLLECTING);
        InterviewRoundMember collectingMember = saveMember(collectingRound,
                saveInterviewPendingApplication(recruitment, "수집중이탈"), RoundMemberStatus.INVITED);

        givenLeader().when().post(EXCLUDE_PATH, draftRound.getId(), draftMember.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        givenLeader().when().post(EXCLUDE_PATH, collectingRound.getId(), collectingMember.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("이미 제외된 멤버를 다시 제외하거나 확정된 라운드에서 제외할 수 없다")
    void terminalExcludeIsRejected() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewRoundMember excluded = saveMember(round,
                saveInterviewPendingApplication(recruitment, "이미제외"), RoundMemberStatus.EXCLUDED);
        InterviewRound scheduledRound = saveRound(RoundStatus.SCHEDULED);
        InterviewRoundMember assignedMember = saveMember(scheduledRound,
                saveInterviewPendingApplication(recruitment, "확정자"), RoundMemberStatus.ASSIGNED);

        givenLeader().when().post(EXCLUDE_PATH, round.getId(), excluded.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
        givenLeader().when().post(EXCLUDE_PATH, scheduledRound.getId(), assignedMember.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("존재하지 않는 라운드는 404, 타 동아리 운영진은 403 을 받는다")
    void notFoundAndForbiddenGuards() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "본인"), RoundMemberStatus.RESPONDED);
        User outsider = saveUser("타인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        givenLeader().when().post(EXCLUDE_PATH, 999_999L, member.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().post(EXCLUDE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private io.restassured.specification.RequestSpecification givenLeader() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken);
    }

    private io.restassured.response.ValidatableResponse assignSlot(
            InterviewRound round, InterviewRoundMember member, InterviewSlot slot) {
        return givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", slot.getId()))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then();
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

    private java.util.Optional<InterviewSchedule> findActiveSchedule(
            InterviewRound round, Application application) {
        return interviewScheduleRepository.findByRoundIdAndApplicationIdAndStatus(
                round.getId(), application.getId(), InterviewScheduleStatus.ASSIGNED);
    }
}

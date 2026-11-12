package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
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
import io.restassured.http.ContentType;
import io.restassured.response.ValidatableResponse;
import io.restassured.specification.RequestSpecification;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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

// 면접 대상이 된 학생은 스스로 철회할 수 없어, 면접을 포기한 학생도 운영진이 결과를 정해 끝낸다. 결과를 정하면 진행 중
// 라운드(초안·응답 수집·배정 검토)에서 빠져 응답 미수집·자동 배정·재초대·정원이 그 사람을 세지 않는다. 확정·취소된 라운드는 그대로다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewDecidedApplicantControllerTest extends InterviewControllerTestSupport {

    private static final String STATUS_PATH = "/api/v1/leader/applications/{applicationId}/status";
    private static final String BULK_STATUS_PATH = "/api/v1/leader/applications/bulk-status";
    private static final String ROUNDS_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-rounds";
    private static final String ROUND_PATH = "/api/v1/leader/interview-rounds/{roundId}";
    private static final String AUTO_ASSIGN_PATH = ROUND_PATH + "/auto-assign";
    private static final String SCHEDULE_PATH = ROUND_PATH + "/members/{memberId}/schedule";
    private static final String DECIDED_MESSAGE = "이미 합격/불합격 처리된 지원입니다.";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;

    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("결과면접동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "결과면접모집");
    }

    @Test
    @DisplayName("응답 수집 중 라운드에서 결과를 정한 지원자는 응답 여부와 상관없이 제외되고 가능 시간 응답이 지워진다 — 같은 라운드의 다른 지원자는 그대로다")
    void decidedApplicantsLeaveCollectingRound() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 3);
        Application invited = saveMember(round, "미응답확정", RoundMemberStatus.INVITED);
        Application responded = saveMember(round, "응답확정", RoundMemberStatus.RESPONDED, slot);
        Application noAvailableSlot = saveMember(round, "가능없음확정", RoundMemberStatus.NO_AVAILABLE_SLOT);
        Application remaining = saveMember(round, "남은응답자", RoundMemberStatus.RESPONDED, slot);

        for (Application decided : List.of(invited, responded, noAvailableSlot)) {
            decide(decided, "REJECTED");
        }

        assertThat(List.of(memberStatusOf(round, invited), memberStatusOf(round, responded),
                memberStatusOf(round, noAvailableSlot))).containsOnly(RoundMemberStatus.EXCLUDED);
        assertThat(availabilitiesOf(round, responded)).isEmpty();
        assertThat(memberStatusOf(round, remaining)).isEqualTo(RoundMemberStatus.RESPONDED);
        assertThat(availabilitiesOf(round, remaining)).hasSize(1);
    }

    @Test
    @DisplayName("배정 검토 중 라운드에서 결과를 정한 지원자는 초안 배정이 지워지고 제외된다")
    void decidedApplicantLosesDraftScheduleInAssigningRound() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application decided = saveMember(round, "초안배정확정", RoundMemberStatus.RESPONDED, slot);
        saveSchedule(round, decided, slot);

        decide(decided, "REJECTED");

        assertThat(memberStatusOf(round, decided)).isEqualTo(RoundMemberStatus.EXCLUDED);
        assertThat(activeScheduleOf(round, decided)).isEmpty();
    }

    @Test
    @DisplayName("발송 전 라운드에서 결과를 정한 지원자도 제외된다")
    void decidedApplicantLeavesDraftRound() {
        InterviewRound round = saveRound(RoundStatus.DRAFT);
        Application decided = saveMember(round, "발송전확정", RoundMemberStatus.INVITED);

        decide(decided, "REJECTED");

        assertThat(memberStatusOf(round, decided)).isEqualTo(RoundMemberStatus.EXCLUDED);
    }

    @Test
    @DisplayName("확정된 라운드에서 면접을 본 뒤 결과를 정해도 확정 멤버와 배정·가능 시간 응답은 그대로 남는다")
    void scheduledRoundKeepsAssignedMemberAfterResult() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application interviewed = saveMember(round, "면접본확정자", RoundMemberStatus.ASSIGNED, slot);
        saveSchedule(round, interviewed, slot);

        decide(interviewed, "ACCEPTED");

        assertThat(memberStatusOf(round, interviewed)).isEqualTo(RoundMemberStatus.ASSIGNED);
        assertThat(activeScheduleOf(round, interviewed)).isPresent();
        assertThat(availabilitiesOf(round, interviewed)).hasSize(1);
    }

    @Test
    @DisplayName("한 지원이 여러 라운드에 있으면 결과를 정할 때 진행 중 라운드의 남은 멤버십만 정리된다 — 운영진이 먼저 제외한 멤버십과 취소된 라운드는 그대로다")
    void resultReleasesOnlyRemainingMembershipsOfInProgressRounds() {
        Application application = saveInterviewPendingApplication(recruitment, "여러라운드");
        InterviewRound cancelledRound = saveRound(RoundStatus.CANCELLED);
        InterviewSlot cancelledSlot = saveSlot(cancelledRound, "2026-06-19T14:00:00", 1);
        addMember(cancelledRound, application, RoundMemberStatus.RESPONDED, cancelledSlot);
        InterviewRound excludedRound = saveRound(RoundStatus.COLLECTING);
        InterviewSlot excludedSlot = saveSlot(excludedRound, "2026-06-20T14:00:00", 1);
        addMember(excludedRound, application, RoundMemberStatus.EXCLUDED, excludedSlot);
        InterviewRound currentRound = saveRound(RoundStatus.COLLECTING);
        InterviewSlot currentSlot = saveSlot(currentRound, "2026-06-21T14:00:00", 1);
        addMember(currentRound, application, RoundMemberStatus.RESPONDED, currentSlot);

        decide(application, "REJECTED");

        assertThat(memberStatusOf(currentRound, application)).isEqualTo(RoundMemberStatus.EXCLUDED);
        assertThat(availabilitiesOf(currentRound, application)).isEmpty();
        assertThat(memberStatusOf(excludedRound, application)).isEqualTo(RoundMemberStatus.EXCLUDED);
        assertThat(availabilitiesOf(excludedRound, application)).hasSize(1);
        assertThat(memberStatusOf(cancelledRound, application)).isEqualTo(RoundMemberStatus.RESPONDED);
        assertThat(availabilitiesOf(cancelledRound, application)).hasSize(1);
    }

    @Test
    @DisplayName("결과를 정한 응답자는 자동 배정에서 빠지고, 같은 슬롯을 고른 다른 응답자가 그 자리를 받는다")
    void decidedApplicantIsLeftOutOfAutoAssign() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        // 둘 다 같은 슬롯 하나만 고르면 매칭은 지원 번호가 작은 쪽부터 놓는다 — 먼저 만든 지원이 결과를 정할 쪽이다.
        Application decided = saveMember(round, "결과확정응답자", RoundMemberStatus.RESPONDED, slot);
        Application remaining = saveMember(round, "남은응답자", RoundMemberStatus.RESPONDED, slot);

        decide(decided, "REJECTED");

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.unassignedMemberCount", equalTo(0));
        assertThat(interviewScheduleRepository
                .findByRoundIdAndStatus(round.getId(), InterviewScheduleStatus.ASSIGNED))
                .extracting(InterviewSchedule::getApplicationId)
                .containsExactly(remaining.getId());
    }

    @Test
    @DisplayName("결과를 정한 지원자는 라운드 목록의 인원·응답 수에서 빠지고, 라운드 상세에는 제외로 보인다")
    void decidedApplicantLeavesRoundCounts() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        Application decided = saveMember(round, "결과확정응답자", RoundMemberStatus.RESPONDED, slot);
        saveMember(round, "남은응답자", RoundMemberStatus.RESPONDED, slot);

        decide(decided, "REJECTED");

        givenLeader()
                .when().get(ROUNDS_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data[0].totalMemberCount", equalTo(1))
                .body("data[0].respondedMemberCount", equalTo(1));
        givenLeader()
                .when().get(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.members.find { it.applicationId == " + decided.getId() + " }.status",
                        equalTo("EXCLUDED"));
    }

    // 결과를 정해 빠진 인원이 운영진이 직접 뺀 인원과 같은 '제외됨'으로만 보이지 않게, 라운드 상세가 지원 결과를 함께 싣는다.
    @Test
    @DisplayName("라운드 상세의 인원은 지원 결과를 함께 싣는다 — 결과를 정한 인원은 합격·불합격, 결과가 없으면 운영진이 직접 뺀 인원도 비어 있다")
    void roundDetailCarriesApplicationResultOfMembers() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 3);
        Application accepted = saveMember(round, "합격으로빠진응답자", RoundMemberStatus.RESPONDED, slot);
        Application rejected = saveMember(round, "불합격으로빠진응답자", RoundMemberStatus.RESPONDED, slot);
        Application preExcluded = saveMember(round, "먼저제외된응답자", RoundMemberStatus.EXCLUDED);
        Application undecided = saveMember(round, "결과없는응답자", RoundMemberStatus.RESPONDED, slot);
        // 운영진이 직접 뺐고 결과는 정하지 않은 인원 — 화면이 '제외됨'으로 남겨야 하는 대비 사례.
        Application directlyExcluded = saveMember(round, "직접제외만된응답자", RoundMemberStatus.EXCLUDED);

        decide(accepted, "ACCEPTED");
        decide(rejected, "REJECTED");
        decide(preExcluded, "REJECTED");

        givenLeader()
                .when().get(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body(memberField(accepted, "status"), equalTo("EXCLUDED"))
                .body(memberField(accepted, "applicationResult"), equalTo("ACCEPTED"))
                .body(memberField(rejected, "status"), equalTo("EXCLUDED"))
                .body(memberField(rejected, "applicationResult"), equalTo("REJECTED"))
                .body(memberField(preExcluded, "status"), equalTo("EXCLUDED"))
                .body(memberField(preExcluded, "applicationResult"), equalTo("REJECTED"))
                .body(memberField(undecided, "status"), equalTo("RESPONDED"))
                // 키가 있어야 한다 — 값이 null 일 때 키를 빼는 직렬화(NON_NULL)로 바뀌면 프론트는 undefined 를 받는다.
                .body(memberLine(undecided), hasKey("applicationResult"))
                .body(memberField(undecided, "applicationResult"), nullValue())
                .body(memberField(directlyExcluded, "status"), equalTo("EXCLUDED"))
                .body(memberLine(directlyExcluded), hasKey("applicationResult"))
                .body(memberField(directlyExcluded, "applicationResult"), nullValue());
    }

    @Test
    @DisplayName("정리 대상이 아닌 라운드(확정·취소)의 인원도 결과를 정하면 지원 결과가 함께 실리고 인원 상태는 그대로다")
    void finishedRoundsDetailCarriesResultWithoutChangingMemberStatus() {
        InterviewRound cancelledRound = saveRound(RoundStatus.CANCELLED);
        InterviewRound scheduledRound = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot cancelledSlot = saveSlot(cancelledRound, "2026-06-19T14:00:00", 1);
        InterviewSlot slot = saveSlot(scheduledRound, "2026-06-20T14:00:00", 1);
        Application interviewed = saveMember(cancelledRound, "다시면접본합격자", RoundMemberStatus.RESPONDED, cancelledSlot);
        addMember(scheduledRound, interviewed, RoundMemberStatus.ASSIGNED, slot);
        saveSchedule(scheduledRound, interviewed, slot);

        decide(interviewed, "ACCEPTED");

        givenLeader()
                .when().get(ROUND_PATH, scheduledRound.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body(memberField(interviewed, "status"), equalTo("ASSIGNED"))
                .body(memberField(interviewed, "applicationResult"), equalTo("ACCEPTED"));
        givenLeader()
                .when().get(ROUND_PATH, cancelledRound.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body(memberField(interviewed, "status"), equalTo("RESPONDED"))
                .body(memberField(interviewed, "applicationResult"), equalTo("ACCEPTED"));
    }

    @Test
    @DisplayName("일괄 변경으로 결과를 정해도 진행 중 라운드에서 제외되고 가능 시간 응답이 지워진다")
    void bulkResultReleasesInProgressMembership() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application decided = saveMember(round, "일괄확정응답자", RoundMemberStatus.RESPONDED, slot);

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("applicationIds", List.of(decided.getId()), "status", "REJECTED"))
                .when().patch(BULK_STATUS_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.updated", equalTo(1));

        assertThat(memberStatusOf(round, decided)).isEqualTo(RoundMemberStatus.EXCLUDED);
        assertThat(availabilitiesOf(round, decided)).isEmpty();
    }

    @Test
    @DisplayName("마감된 모집에서 남은 지원자를 합격으로 확정해도 진행 중 라운드에서 제외되고 가능 시간 응답이 지워진다")
    void closedRecruitmentFinalAcceptanceReleasesInProgressMembership() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application decided = saveMember(round, "마감합격자", RoundMemberStatus.RESPONDED, slot);
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.save(recruitment);

        decide(decided, "ACCEPTED");

        assertThat(memberStatusOf(round, decided)).isEqualTo(RoundMemberStatus.EXCLUDED);
        assertThat(availabilitiesOf(round, decided)).isEmpty();
    }

    @Test
    @DisplayName("확정된 라운드에서 면접을 본 뒤 결과를 정한 지원자는 다른 슬롯으로 일정을 바꿀 수 없다")
    void decidedApplicantInScheduledRoundCannotBeRescheduled() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot currentSlot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewSlot otherSlot = saveSlot(round, "2026-06-20T15:00:00", 1);
        Application interviewed = saveMember(round, "면접본합격자", RoundMemberStatus.ASSIGNED);
        InterviewSchedule currentSchedule = saveSchedule(round, interviewed, currentSlot);
        decide(interviewed, "ACCEPTED");

        assign(round, interviewed, otherSlot)
                .statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo(DECIDED_MESSAGE));

        InterviewSchedule activeSchedule = activeScheduleOf(round, interviewed).orElseThrow();
        assertThat(activeSchedule.getId()).isEqualTo(currentSchedule.getId());
        assertThat(activeSchedule.getSlotId()).isEqualTo(currentSlot.getId());
    }

    @Test
    @DisplayName("결과를 정한 지원자는 지금 일정과 같은 슬롯을 보내도 거절된다")
    void decidedApplicantSameSlotIsRejectedBeforeNoOp() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot currentSlot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application interviewed = saveMember(round, "면접본불합격자", RoundMemberStatus.ASSIGNED);
        InterviewSchedule currentSchedule = saveSchedule(round, interviewed, currentSlot);
        decide(interviewed, "REJECTED");

        // 결과 검사가 같은 슬롯 생략보다 먼저다 — 뒤로 가면 낡은 화면이 204 를 받는다.
        assign(round, interviewed, currentSlot)
                .statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo(DECIDED_MESSAGE));

        assertThat(activeScheduleOf(round, interviewed).orElseThrow().getId())
                .isEqualTo(currentSchedule.getId());
    }

    @Test
    @DisplayName("결과를 정했는데 배정 검토 라운드에 남은 지원자(결과 확정 정리 전 데이터)는 초안 배정도 할 수 없다")
    void leftoverDecidedApplicantInAssigningRoundCannotGetDraft() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        // #1659 이전에 결과를 정해 제외되지 않은 멤버 — 지금의 결과 확정 API 로는 만들 수 없어 직접 저장한다.
        Application leftover = saveApplicationWithStatus(recruitment, "정리전합격자", ApplicationStatus.ACCEPTED);
        addMember(round, leftover, RoundMemberStatus.RESPONDED, slot);

        assign(round, leftover, slot)
                .statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo(DECIDED_MESSAGE));

        assertThat(activeScheduleOf(round, leftover)).isEmpty();
    }

    @Test
    @DisplayName("배정 검토 중 결과를 정해 빠진 지원자를 낡은 화면에서 배정하면 결과가 정해졌다는 문구로 거절된다")
    void staleAssignOfDecidedExcludedMemberSaysResultDecided() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application decided = saveMember(round, "검토중불합격자", RoundMemberStatus.RESPONDED, slot);
        decide(decided, "REJECTED");

        // 멤버도 EXCLUDED 지만 결과 검사가 제외 검사보다 먼저라 원인 문구가 나간다.
        assign(round, decided, slot)
                .statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo(DECIDED_MESSAGE));

        assertThat(activeScheduleOf(round, decided)).isEmpty();
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private RequestSpecification givenLeader() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken);
    }

    /** 라운드 상세 응답에서 그 지원의 인원 한 줄을 가리키는 GPath. */
    private static String memberLine(Application application) {
        return "data.members.find { it.applicationId == " + application.getId() + " }";
    }

    private static String memberField(Application application, String field) {
        return memberLine(application) + "." + field;
    }

    private void decide(Application application, String resultStatus) {
        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("status", resultStatus))
                .when().patch(STATUS_PATH, application.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    /** 수동 배정·일정 변경 — 프론트처럼 화면이 본 단계(지금 라운드 단계)를 싣는다. */
    private ValidatableResponse assign(InterviewRound round, Application application, InterviewSlot slot) {
        return givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", slot.getId(), "expectedRoundStatus", round.getStatus().name()))
                .when().put(SCHEDULE_PATH, round.getId(), memberIdOf(round, application))
                .then();
    }

    private Long memberIdOf(InterviewRound round, Application application) {
        return interviewRoundMemberRepository
                .findByRoundIdAndApplicationId(round.getId(), application.getId())
                .orElseThrow()
                .getId();
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

    /** 면접 대기 지원서를 새로 만들어 주어진 상태의 멤버로 넣고, 넘긴 슬롯마다 가능 시간 응답을 남긴다. */
    private Application saveMember(InterviewRound round, String applicantName, RoundMemberStatus status,
                                   InterviewSlot... selectedSlots) {
        Application application = saveInterviewPendingApplication(recruitment, applicantName);
        addMember(round, application, status, selectedSlots);
        return application;
    }

    private void addMember(InterviewRound round, Application application, RoundMemberStatus status,
                           InterviewSlot... selectedSlots) {
        InterviewRoundMember member = InterviewRoundMember.invite(round.getId(), application.getId());
        if (status != RoundMemberStatus.INVITED) {
            ReflectionTestUtils.setField(member, "status", status);
        }
        interviewRoundMemberRepository.save(member);
        for (InterviewSlot selectedSlot : selectedSlots) {
            interviewAvailabilityRepository.save(
                    InterviewAvailability.create(application.getId(), selectedSlot.getId(), round.getId()));
        }
    }

    private InterviewSchedule saveSchedule(InterviewRound round, Application application, InterviewSlot slot) {
        return interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), round.getId(), LocalDateTime.now()));
    }

    private RoundMemberStatus memberStatusOf(InterviewRound round, Application application) {
        return interviewRoundMemberRepository
                .findByRoundIdAndApplicationId(round.getId(), application.getId())
                .orElseThrow()
                .getStatus();
    }

    /** soft delete 된 응답은 엔티티의 @SQLRestriction 이 걸러 남은 응답만 돌려준다. */
    private List<InterviewAvailability> availabilitiesOf(InterviewRound round, Application application) {
        return interviewAvailabilityRepository.findByRoundIdAndApplicationId(round.getId(), application.getId());
    }

    private Optional<InterviewSchedule> activeScheduleOf(InterviewRound round, Application application) {
        return interviewScheduleRepository.findByRoundIdAndApplicationIdAndStatus(
                round.getId(), application.getId(), InterviewScheduleStatus.ASSIGNED);
    }
}

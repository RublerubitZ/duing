package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

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
import com.duing.domain.user.service.UserService;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
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

// 회원 탈퇴한 지원자는 운영진 인원 목록에서 빠져 아무도 처리할 수 없다. 탈퇴하면 면접 라운드에서도 빠져
// 자동 배정·슬롯별 선택 수·배정 수·정원·확정이 그 사람을 계속 세지 않고, 다시 넣을 수도 없다(#1637).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewWithdrawnApplicantControllerTest extends InterviewControllerTestSupport {

    private static final String ROUND_PATH = "/api/v1/leader/interview-rounds/{roundId}";
    private static final String AUTO_ASSIGN_PATH = ROUND_PATH + "/auto-assign";
    private static final String CONFIRM_PATH = ROUND_PATH + "/confirm";
    private static final String SCHEDULE_PATH = ROUND_PATH + "/members/{memberId}/schedule";
    private static final String CREATE_ROUND_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-rounds";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;
    @Autowired private UserService userService;

    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("탈퇴면접동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "탈퇴면접모집");
    }

    @Test
    @DisplayName("가능 시간에 응답한 뒤 탈퇴한 지원자는 자동 배정에서 빠지고, 그 자리는 남은 응답자가 받는다")
    void withdrawnApplicantIsLeftOutOfAutoAssign() {
        InterviewRound round = saveRound(recruitment, RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application withdrawn = saveMember(round, "탈퇴응답자", RoundMemberStatus.RESPONDED, slot);
        Application remaining = saveMember(round, "남은응답자", RoundMemberStatus.RESPONDED, slot);
        withdraw(withdrawn);

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
    @DisplayName("탈퇴한 지원자의 가능 시간 응답과 배정은 슬롯별 선택 수·배정 수에서 빠진다 — 운영진이 먼저 제외한 지원자도 같다")
    void withdrawnApplicantsLeaveSlotCounts() {
        InterviewRound round = saveRound(recruitment, RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 3);
        Application withdrawnAssigned = saveMember(round, "탈퇴배정자", RoundMemberStatus.RESPONDED, slot);
        saveSchedule(round, withdrawnAssigned, slot);
        Application withdrawnExcluded = saveMember(round, "탈퇴제외자", RoundMemberStatus.EXCLUDED, slot);
        Application remaining = saveMember(round, "남은배정자", RoundMemberStatus.RESPONDED, slot);
        saveSchedule(round, remaining, slot);
        withdraw(withdrawnAssigned);
        withdraw(withdrawnExcluded);

        givenLeader()
                .when().get(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.members.size()", equalTo(1))
                .body("data.slots[0].selectedCount", equalTo(1))
                .body("data.slots[0].assignedCount", equalTo(1));
    }

    @Test
    @DisplayName("확정된 라운드에서 탈퇴한 지원자의 자리는 비고, 오래된 화면에서 그 지원자를 다시 배정하려 해도 거절된다")
    void withdrawnApplicantSeatIsFreedInScheduledRound() {
        InterviewRound round = saveRound(recruitment, RoundStatus.SCHEDULED);
        InterviewSlot freedSlot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewSlot otherSlot = saveSlot(round, "2026-06-20T15:00:00", 1);
        Application withdrawn = saveMember(round, "탈퇴확정자", RoundMemberStatus.ASSIGNED);
        saveSchedule(round, withdrawn, freedSlot);
        Application moving = saveMember(round, "이동할확정자", RoundMemberStatus.ASSIGNED);
        saveSchedule(round, moving, otherSlot);
        withdraw(withdrawn);

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", freedSlot.getId()))
                .when().put(SCHEDULE_PATH, round.getId(), memberIdOf(round, withdrawn))
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo("현재 상태에서 허용되지 않는 멤버 상태 변경입니다."));
        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", freedSlot.getId()))
                .when().put(SCHEDULE_PATH, round.getId(), memberIdOf(round, moving))
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("배정 검토 중 탈퇴한 미배정 지원자는 확정을 막지 않는다")
    void withdrawnUnassignedApplicantDoesNotBlockConfirm() {
        InterviewRound round = saveRound(recruitment, RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application assigned = saveMember(round, "배정자", RoundMemberStatus.RESPONDED, slot);
        saveSchedule(round, assigned, slot);
        Application withdrawn = saveMember(round, "탈퇴미배정자", RoundMemberStatus.RESPONDED, slot);
        withdraw(withdrawn);

        givenLeader()
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.excludedMemberCount", equalTo(0));
    }

    @Test
    @DisplayName("탈퇴한 지원자는 새 면접 라운드에 넣을 수 없다 — 오래된 후보 화면에서 넘어와도 거절된다")
    void withdrawnApplicantCannotBePlacedInNewRound() {
        Application withdrawn = saveInterviewPendingApplication(recruitment, "탈퇴대기자");
        Application candidate = saveInterviewPendingApplication(recruitment, "대기자");
        withdraw(withdrawn);

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "2차 면접",
                        "applicationIds", List.of(withdrawn.getId(), candidate.getId())))
                .when().post(CREATE_ROUND_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("면접 대상으로 선정할 수 없는 상태의 지원자가 포함되어 있습니다."));
    }

    @Test
    @DisplayName("탈퇴하면 취소되지 않은 모든 라운드에서 빠지고 동아리 멤버십 정리도 그대로 남는다 — 취소된 라운드는 건드리지 않는다")
    void withdrawalLeavesEveryUncancelledRoundAndKeepsOtherWithdrawalChanges() {
        Application application = saveInterviewPendingApplication(recruitment, "여러라운드");
        User applicant = application.getUser();
        ClubMember membership = clubMemberRepository.save(
                ClubMember.asMember(saveActiveClub("가입동아리"), applicant));

        InterviewRound cancelledRound = saveRound(recruitment, RoundStatus.CANCELLED);
        InterviewSlot cancelledSlot = saveSlot(cancelledRound, "2026-06-19T14:00:00", 1);
        addMember(cancelledRound, application, RoundMemberStatus.RESPONDED, cancelledSlot);
        InterviewRound collectingRound = saveRound(recruitment, RoundStatus.COLLECTING);
        InterviewSlot collectingSlot = saveSlot(collectingRound, "2026-06-20T14:00:00", 1);
        addMember(collectingRound, application, RoundMemberStatus.RESPONDED, collectingSlot);

        Recruitment otherRecruitment = saveInterviewRecruitment(saveActiveClub("다른동아리"), "다른모집");
        Application otherApplication = Application.submit(otherRecruitment, applicant, List.of());
        otherApplication.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
        otherApplication = applicationRepository.save(otherApplication);
        InterviewRound assigningRound = saveRound(otherRecruitment, RoundStatus.ASSIGNING);
        InterviewSlot assigningSlot = saveSlot(assigningRound, "2026-06-21T14:00:00", 1);
        addMember(assigningRound, otherApplication, RoundMemberStatus.RESPONDED, assigningSlot);
        saveSchedule(assigningRound, otherApplication, assigningSlot);

        withdraw(application);

        assertThat(clubMemberRepository.findById(membership.getId())).isEmpty();
        assertThat(memberStatusOf(collectingRound, application)).isEqualTo(RoundMemberStatus.EXCLUDED);
        assertThat(interviewAvailabilityRepository
                .findByRoundIdAndApplicationId(collectingRound.getId(), application.getId())).isEmpty();
        assertThat(memberStatusOf(assigningRound, otherApplication)).isEqualTo(RoundMemberStatus.EXCLUDED);
        assertThat(interviewAvailabilityRepository
                .findByRoundIdAndApplicationId(assigningRound.getId(), otherApplication.getId())).isEmpty();
        assertThat(interviewScheduleRepository.findByRoundIdAndApplicationIdAndStatus(
                assigningRound.getId(), otherApplication.getId(), InterviewScheduleStatus.ASSIGNED)).isEmpty();
        assertThat(memberStatusOf(cancelledRound, application)).isEqualTo(RoundMemberStatus.RESPONDED);
        assertThat(interviewAvailabilityRepository
                .findByRoundIdAndApplicationId(cancelledRound.getId(), application.getId())).hasSize(1);
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private RequestSpecification givenLeader() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken);
    }

    private InterviewRound saveRound(Recruitment roundRecruitment, RoundStatus status) {
        return interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                roundRecruitment.getId(), LocalDateTime.now().minusHours(1), null, status));
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

    private void saveSchedule(InterviewRound round, Application application, InterviewSlot slot) {
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), round.getId(), LocalDateTime.now()));
    }

    private InterviewRoundMember memberOf(InterviewRound round, Application application) {
        return interviewRoundMemberRepository
                .findByRoundIdAndApplicationId(round.getId(), application.getId())
                .orElseThrow();
    }

    private Long memberIdOf(InterviewRound round, Application application) {
        return memberOf(round, application).getId();
    }

    private RoundMemberStatus memberStatusOf(InterviewRound round, Application application) {
        return memberOf(round, application).getStatus();
    }

    private void withdraw(Application application) {
        userService.withdraw(application.getUser().getId());
    }
}

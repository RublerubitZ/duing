package com.duing.domain.interview.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
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

// 지원자 인터뷰 조회 — 서버 파생 applicantPhase 만 노출하고 raw 상태는 절대 노출하지 않는다 (스펙 §9.2·§9.3).
// EXCLUDED 멤버가 중립 카피(WAITING_NEXT_ROUND)로 가려지는 것이 SSOT 의 존재 이유다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApplicantInterviewControllerTest extends InterviewControllerTestSupport {

    private static final String INTERVIEW_PATH = "/api/v1/applications/{applicationId}/interview";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;

    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User leader = saveUser("리더");
        Club club = saveActiveClub("지원자뷰동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "지원자뷰모집");
    }

    @Test
    @DisplayName("보류 중인 지원자는 면접 구간 밖이므로 NOT_APPLICABLE 단계를 받는다")
    void onHoldSeesNotApplicable() {
        Application application = saveOnHoldApplication(recruitment, "보류중");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("NOT_APPLICABLE"))
                .body("data.slots", nullValue())
                .body("data.scheduledInterview", nullValue());
    }

    @Test
    @DisplayName("면접 대상으로 선정됐지만 라운드가 없는 지원자는 WAITING_ROUND 단계를 받는다")
    void pendingWithoutRoundSeesWaitingRound() {
        Application application = saveInterviewPendingApplication(recruitment, "대기중");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("WAITING_ROUND"));
    }

    @Test
    @DisplayName("발송 전(DRAFT) 라운드 멤버십은 지원자에게 보이지 않는다 — WAITING_ROUND 로 표시된다")
    void draftMembershipIsHiddenAsWaitingRound() {
        Application application = saveInterviewPendingApplication(recruitment, "드래프트소속");
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        interviewRoundMemberRepository.save(
                InterviewRoundMember.invite(draftRound.getId(), application.getId()));

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("WAITING_ROUND"))
                .body("data.availabilityDeadline", nullValue());
    }

    @Test
    @DisplayName("발송 전(DRAFT) 라운드에서 제외된 지원자는 이력 없는 WAITING_ROUND 로 보인다")
    void excludedInDraftRoundStaysWaitingRound() {
        Application application = saveInterviewPendingApplication(recruitment, "드래프트제외");
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        saveMember(draftRound, application, RoundMemberStatus.EXCLUDED, null);

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("WAITING_ROUND"));
    }

    @Test
    @DisplayName("취소된 라운드를 거친 지원자는 WAITING_NEXT_ROUND 단계를 받는다")
    void cancelledRoundHistorySeesWaitingNextRound() {
        Application application = saveInterviewPendingApplication(recruitment, "취소이력");
        InterviewRound cancelledRound = saveRound(RoundStatus.CANCELLED, LocalDateTime.now().plusDays(3));
        interviewRoundMemberRepository.save(
                InterviewRoundMember.invite(cancelledRound.getId(), application.getId()));

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("WAITING_NEXT_ROUND"));
    }

    @Test
    @DisplayName("진행 중 라운드에서 제외된 지원자는 제외 사실이 드러나지 않는 WAITING_NEXT_ROUND 를 받는다")
    void excludedMemberIsMaskedAsWaitingNextRound() {
        Application application = saveInterviewPendingApplication(recruitment, "제외이력");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, application, RoundMemberStatus.EXCLUDED, null);

        String responseBody = givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("WAITING_NEXT_ROUND"))
                .extract().body().asString();

        // EXCLUDED 라는 내부 상태 문자열이 응답 어디에도 없어야 한다 (SSOT 누출 차단).
        org.assertj.core.api.Assertions.assertThat(responseBody).doesNotContain("EXCLUDED");
    }

    @Test
    @DisplayName("응답 요청을 받은 지원자는 선택 가능한 슬롯 목록·마감과 함께 AVAILABILITY_REQUESTED 를 받는다")
    void invitedSeesRequestedWithSlots() {
        Application application = saveInterviewPendingApplication(recruitment, "초대됨");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        InterviewSlot slotA = saveSlot(round, "2026-06-20T14:00:00");
        saveSlot(round, "2026-06-20T15:00:00");
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slotA.getId(), round.getId()));

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("AVAILABILITY_REQUESTED"))
                .body("data.availabilityDeadline", org.hamcrest.Matchers.notNullValue())
                .body("data.slots", hasSize(2))
                .body("data.slots[0].selected", equalTo(true))
                .body("data.slots[1].selected", equalTo(false));
    }

    @Test
    @DisplayName("마감이 지난 뒤 미응답 지원자는 AVAILABILITY_CLOSED 를 받는다")
    void invitedAfterDeadlineSeesClosed() {
        Application application = saveInterviewPendingApplication(recruitment, "마감놓침");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().minusHours(1));
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        saveSlot(round, "2026-06-20T14:00:00");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("AVAILABILITY_CLOSED"));
    }

    @Test
    @DisplayName("응답을 완료한 지원자는 자신의 선택이 표시된 슬롯 목록과 함께 RESPONDED 를 받는다")
    void respondedSeesOwnSelection() {
        Application application = saveInterviewPendingApplication(recruitment, "응답완료");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, application, RoundMemberStatus.RESPONDED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slot.getId(), round.getId()));

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("RESPONDED"))
                .body("data.slots", hasSize(1))
                .body("data.slots[0].selected", equalTo(true));
    }

    @Test
    @DisplayName("가능한 시간이 없다고 응답한 지원자는 자신이 남긴 텍스트와 함께 NO_SLOT_REPORTED 를 받는다")
    void noSlotReporterSeesOwnText() {
        Application application = saveInterviewPendingApplication(recruitment, "가능없음");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, application, RoundMemberStatus.NO_AVAILABLE_SLOT, "주말 오전만 가능합니다");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("NO_SLOT_REPORTED"))
                .body("data.myAlternativeText", equalTo("주말 오전만 가능합니다"));
    }

    @Test
    @DisplayName("배정 검토 중인 라운드의 지원자는 SCHEDULING 를 받고 슬롯 목록은 보이지 않는다")
    void assigningSeesScheduling() {
        Application application = saveInterviewPendingApplication(recruitment, "조율중");
        InterviewRound round = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusDays(1));
        saveMember(round, application, RoundMemberStatus.RESPONDED, null);
        saveSlot(round, "2026-06-20T14:00:00");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("SCHEDULING"))
                .body("data.slots", nullValue());
    }

    @Test
    @DisplayName("일정이 확정된 지원자는 면접 일시와 장소가 담긴 SCHEDULED 를 받는다")
    void assignedSeesScheduledInterview() {
        Application application = saveInterviewPendingApplication(recruitment, "확정자");
        InterviewRound round = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().minusDays(1), "본관 201호", RoundStatus.SCHEDULED));
        saveMember(round, application, RoundMemberStatus.ASSIGNED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), round.getId(), LocalDateTime.now()));

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("SCHEDULED"))
                .body("data.scheduledInterview.startTime", equalTo("2026-06-20T14:00:00"))
                .body("data.scheduledInterview.location", equalTo("본관 201호"));
    }

    @Test
    @DisplayName("합격 처리된 지원자의 인터뷰 조회는 NOT_APPLICABLE 를 받는다")
    void acceptedSeesNotApplicable() {
        Application application = saveApplicationWithStatus(recruitment, "합격자", ApplicationStatus.ACCEPTED);

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("NOT_APPLICABLE"));
    }

    @Test
    @DisplayName("다른 지원자의 인터뷰 정보는 조회할 수 없다")
    void othersInterviewIsForbidden() {
        Application application = saveInterviewPendingApplication(recruitment, "본인");
        User stranger = saveUser("타인");
        String strangerToken = jwtTokenProvider.createToken(stranger.getId(), stranger.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 지원서의 인터뷰 조회는 404 를 반환한다")
    void unknownApplicationReturnsNotFound() {
        Application application = saveInterviewPendingApplication(recruitment, "아무나");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집의 인터뷰 조회는 400 으로 거부된다")
    void interviewNotUsedIsRejected() {
        Club club = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, saveUser("리더2")));
        Recruitment simpleRecruitment = saveSimpleRecruitment(club, "면접없는모집");
        Application application = saveSubmittedApplication(simpleRecruitment, "일반지원자");
        application.transitionTo(ApplicationStatus.ON_HOLD, false);
        applicationRepository.save(application);

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private io.restassured.specification.RequestSpecification givenApplicant(Application application) {
        // application.getUser() 는 저장 후 분리된 프록시일 수 있어 getId() 로 키를 꺼낸 뒤 재조회한다.
        com.duing.domain.user.entity.User applicantUser =
                userRepository.findById(application.getUser().getId()).orElseThrow();
        String token = jwtTokenProvider.createToken(applicantUser.getId(), applicantUser.getRole().name());
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private InterviewRound saveRound(RoundStatus status, LocalDateTime deadline) {
        return interviewRoundRepository.save(
                InterviewRoundFixture.withStatus(recruitment.getId(), deadline, null, status));
    }

    private InterviewSlot saveSlot(InterviewRound round, String start) {
        LocalDateTime startTime = LocalDateTime.parse(start);
        return interviewSlotRepository.save(InterviewSlot.create(
                round.getId(), startTime, startTime.plusMinutes(30), 1));
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

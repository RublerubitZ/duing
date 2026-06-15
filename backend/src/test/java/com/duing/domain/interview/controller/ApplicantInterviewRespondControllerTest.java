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
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
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

// 지원자 응답 — 슬롯 선택/가능없음 전체 교체 upsert, COLLECTING && 마감 전 한정, 상호 전환 (스펙 §9.2 API 14·§5.2).
// 잠금 2종(§16-7 application FORCE_INCREMENT, §16-7-1 슬롯 행 잠금)을 상속하는 지원자 writer 다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApplicantInterviewRespondControllerTest extends InterviewControllerTestSupport {

    private static final String RESPOND_PATH = "/api/v1/applications/{applicationId}/interview-availability";
    private static final String VIEW_PATH = "/api/v1/applications/{applicationId}/interview";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;

    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User leader = saveUser("리더");
        Club club = saveActiveClub("응답동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "응답모집");
    }

    @Test
    @DisplayName("초대된 지원자가 슬롯을 선택하면 응답이 저장되고 진행 단계가 RESPONDED 로 바뀐다")
    void invitedApplicantRespondsWithSlots() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "응답자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.INVITED, null);
        InterviewSlot slotA = saveSlot(round, "2026-06-20T14:00:00");
        InterviewSlot slotB = saveSlot(round, "2026-06-20T15:00:00");

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slotA.getId(), slotB.getId())))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewRoundMemberRepository.findById(member.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.RESPONDED);
        assertThat(interviewAvailabilityRepository
                .findByRoundIdAndApplicationId(round.getId(), application.getId()))
                .extracting(InterviewAvailability::getSlotId)
                .containsExactlyInAnyOrder(slotA.getId(), slotB.getId());
        // BE#7 조회 연동 — phase 가 RESPONDED 로 파생된다
        givenApplicant(application)
                .when().get(VIEW_PATH, application.getId())
                .then().body("data.phase", equalTo("RESPONDED"));
    }

    @Test
    @DisplayName("재응답하면 이전 선택이 새 선택으로 완전히 교체된다")
    void respondingAgainReplacesPreviousSelection() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "재응답자");
        saveMember(round, application, RoundMemberStatus.RESPONDED, null);
        InterviewSlot oldSlot = saveSlot(round, "2026-06-20T14:00:00");
        InterviewSlot newSlot = saveSlot(round, "2026-06-20T15:00:00");
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), oldSlot.getId(), round.getId()));

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(newSlot.getId())))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewAvailabilityRepository
                .findByRoundIdAndApplicationId(round.getId(), application.getId()))
                .extracting(InterviewAvailability::getSlotId)
                .containsExactly(newSlot.getId());
    }

    @Test
    @DisplayName("응답 완료 상태에서 가능한 슬롯이 없다고 다시 응답하면 선택이 비워지고 텍스트가 남는다")
    void respondedSwitchesToNoAvailableSlot() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "전환자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slot.getId(), round.getId()));

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("noAvailableSlot", true, "alternativeText", "시험 기간이라 다음 주만 가능합니다"))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        InterviewRoundMember switched = interviewRoundMemberRepository.findById(member.getId()).orElseThrow();
        assertThat(switched.getStatus()).isEqualTo(RoundMemberStatus.NO_AVAILABLE_SLOT);
        assertThat(switched.getAlternativeAvailabilityText()).isEqualTo("시험 기간이라 다음 주만 가능합니다");
        assertThat(interviewAvailabilityRepository
                .findByRoundIdAndApplicationId(round.getId(), application.getId())).isEmpty();
    }

    @Test
    @DisplayName("가능없음 상태에서 슬롯으로 다시 응답하면 텍스트가 비워지고 RESPONDED 가 된다")
    void noAvailableSlotSwitchesBackToSlots() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "복귀자");
        InterviewRoundMember member = saveMember(round, application,
                RoundMemberStatus.NO_AVAILABLE_SLOT, "주말만");
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slot.getId())))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        InterviewRoundMember switched = interviewRoundMemberRepository.findById(member.getId()).orElseThrow();
        assertThat(switched.getStatus()).isEqualTo(RoundMemberStatus.RESPONDED);
        assertThat(switched.getAlternativeAvailabilityText()).isNull();
    }

    @Test
    @DisplayName("마감이 지난 뒤의 응답은 거부된다")
    void respondingAfterDeadlineIsRejected() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().minusHours(1));
        Application application = saveInterviewPendingApplication(recruitment, "지각생");
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slot.getId())))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("배정 검토(ASSIGNING)로 넘어간 라운드에는 응답할 수 없다")
    void respondingToAssigningRoundIsRejected() {
        InterviewRound round = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(3), null, RoundStatus.ASSIGNING));
        Application application = saveInterviewPendingApplication(recruitment, "늦은응답");
        saveMember(round, application, RoundMemberStatus.RESPONDED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slot.getId())))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("발송 전(DRAFT) 라운드의 멤버는 응답 대상이 아니다 — 404")
    void draftMembershipCannotRespond() {
        InterviewRound round = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        Application application = saveInterviewPendingApplication(recruitment, "드래프트");
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slot.getId())))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("어느 라운드에도 속하지 않은 지원자의 응답은 404 를 반환한다")
    void nonMemberCannotRespond() {
        Application application = saveInterviewPendingApplication(recruitment, "무소속");

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("noAvailableSlot", true))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("다른 라운드의 슬롯을 선택하면 거부된다")
    void slotFromOtherRoundIsRejected() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().plusDays(3));
        InterviewRound otherRound = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(3), null, RoundStatus.SCHEDULED));
        Application application = saveInterviewPendingApplication(recruitment, "엉뚱슬롯");
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        InterviewSlot otherSlot = saveSlot(otherRound, "2026-06-20T14:00:00");

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(otherSlot.getId())))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("삭제된 슬롯을 선택하면 거부된다")
    void deletedSlotIsRejected() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "삭제슬롯");
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        interviewSlotRepository.delete(slot);

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slot.getId())))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("같은 슬롯을 중복 선택하면 한 건으로 정리된다")
    void duplicateSlotIdsAreDeduplicated() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "중복선택");
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slot.getId(), slot.getId())))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewAvailabilityRepository
                .findByRoundIdAndApplicationId(round.getId(), application.getId())).hasSize(1);
    }

    @Test
    @DisplayName("슬롯 선택과 가능없음을 동시에 보내거나 둘 다 비우면 거부된다")
    void xorViolationIsRejected() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "모순응답");
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slot.getId()), "noAvailableSlot", true))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of())
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("이미 합격 처리된 지원자는 응답을 변경할 수 없다")
    void decidedApplicantCannotRespond() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "합격자");
        saveMember(round, application, RoundMemberStatus.RESPONDED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.ACCEPTED);
        applicationRepository.save(application);

        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slot.getId())))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("다른 지원자의 응답은 변경할 수 없다")
    void othersResponseIsForbidden() {
        InterviewRound round = saveCollectingRound(LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "본인");
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        User stranger = saveUser("타인");
        String strangerToken = jwtTokenProvider.createToken(stranger.getId(), stranger.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("noAvailableSlot", true))
                .when().put(RESPOND_PATH, application.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 지원서는 404, 면접 미사용 모집은 400 을 반환한다")
    void notFoundAndInterviewNotUsedGuards() {
        Application application = saveInterviewPendingApplication(recruitment, "아무나");
        givenApplicant(application)
                .contentType(ContentType.JSON)
                .body(Map.of("noAvailableSlot", true))
                .when().put(RESPOND_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        Club club = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, saveUser("리더2")));
        Recruitment simpleRecruitment = saveSimpleRecruitment(club, "면접없는모집");
        Application simpleApplication = saveSubmittedApplication(simpleRecruitment, "일반지원자");
        givenApplicant(simpleApplication)
                .contentType(ContentType.JSON)
                .body(Map.of("noAvailableSlot", true))
                .when().put(RESPOND_PATH, simpleApplication.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private io.restassured.specification.RequestSpecification givenApplicant(Application application) {
        User applicant = userRepository.findById(application.getUser().getId()).orElseThrow();
        String token = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private InterviewRound saveCollectingRound(LocalDateTime deadline) {
        return interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), deadline, null, RoundStatus.COLLECTING));
    }

    private InterviewSlot saveSlot(InterviewRound round, String start) {
        LocalDateTime startTime = LocalDateTime.parse(start);
        return interviewSlotRepository.save(InterviewSlot.create(
                round.getId(), startTime, startTime.plusMinutes(30), 1));
    }

    private InterviewRoundMember saveMember(InterviewRound round, Application application,
                                            RoundMemberStatus status, String alternativeText) {
        InterviewRoundMember member = InterviewRoundMember.invite(round.getId(), application.getId());
        if (status != RoundMemberStatus.INVITED) {
            ReflectionTestUtils.setField(member, "status", status);
        }
        if (alternativeText != null) {
            ReflectionTestUtils.setField(member, "alternativeAvailabilityText", alternativeText);
        }
        return interviewRoundMemberRepository.save(member);
    }
}

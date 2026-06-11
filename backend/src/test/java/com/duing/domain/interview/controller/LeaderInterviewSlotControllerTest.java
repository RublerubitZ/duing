package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
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
import com.duing.domain.notification.repository.NotificationRepository;
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

// 슬롯 일괄 생성/수정/삭제의 phase 가드·availability 참조 규칙과
// Rule 2(추가 슬롯 생성 시 NO_AVAILABLE_SLOT 멤버 복귀 + 재알림)를 검증한다 (스펙 §5.5·§8·§9.1 API 4).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewSlotControllerTest extends InterviewControllerTestSupport {

    private static final String CREATE_SLOTS_PATH = "/api/v1/leader/interview-rounds/{roundId}/slots";
    private static final String SLOT_PATH = "/api/v1/leader/interview-slots/{slotId}";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
    @Autowired private NotificationRepository notificationRepository;

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("슬롯동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "슬롯모집");
    }

    // ── 일괄 생성 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("준비 중(DRAFT) 라운드에 슬롯을 일괄 생성할 수 있다 — wizard Step3")
    void createSlotsInDraftRound() {
        InterviewRound round = saveRound(RoundStatus.DRAFT, LocalDateTime.now().plusDays(7));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        slotItem("2026-06-20T14:00:00", "2026-06-20T14:30:00", 1),
                        slotItem("2026-06-20T14:30:00", "2026-06-20T15:00:00", 2))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.createdSlotIds", hasSize(2))
                .body("data.reinvitedMemberCount", equalTo(0));

        assertThat(interviewSlotRepository.findAll().stream()
                .filter(slot -> slot.getRoundId().equals(round.getId())))
                .hasSize(2);
    }

    @Test
    @DisplayName("응답 수집 중 추가 슬롯을 만들면 가능 슬롯이 없다던 멤버가 INVITED 로 복귀하고 재알림이 발송된다")
    void rule2ReinvitesNoAvailableSlotMembersWithNotification() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        Application stuck = saveInterviewPendingApplication(recruitment, "가능없음");
        InterviewRoundMember stuckMember = saveMemberWithStatus(round, stuck, RoundMemberStatus.NO_AVAILABLE_SLOT, "주말만 가능");
        Application fine = saveInterviewPendingApplication(recruitment, "응답완료");
        InterviewRoundMember fineMember = saveMemberWithStatus(round, fine, RoundMemberStatus.RESPONDED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(slotItem("2026-06-21T10:00:00", "2026-06-21T10:30:00", 1))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.reinvitedMemberCount", equalTo(1));

        InterviewRoundMember reinvited = interviewRoundMemberRepository.findById(stuckMember.getId()).orElseThrow();
        assertThat(reinvited.getStatus()).isEqualTo(RoundMemberStatus.INVITED);
        assertThat(reinvited.getAlternativeAvailabilityText()).isNull();
        // RESPONDED 멤버는 무영향 (Rule 1 — 자동배정 대상 유지)
        assertThat(interviewRoundMemberRepository.findById(fineMember.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.RESPONDED);
        // requestSequence 1 회 증가 + dedupKey 로 알림 생성 (AFTER_COMMIT 리스너)
        InterviewRound updated = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(updated.getRequestSequence()).isEqualTo(1);
        String dedupKey = "INTERVIEW_AVAILABILITY_REQUESTED:r=" + round.getId()
                + ":a=" + stuck.getId() + ":q=1";
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                stuck.getUser().getId(), dedupKey)).isTrue();
        // 복귀 대상이 아닌 멤버에게는 알림이 가지 않는다
        String fineDedupKey = "INTERVIEW_AVAILABILITY_REQUESTED:r=" + round.getId()
                + ":a=" + fine.getId() + ":q=1";
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                fine.getUser().getId(), fineDedupKey)).isFalse();
    }

    @Test
    @DisplayName("준비 중(DRAFT) 라운드의 슬롯 생성은 복귀·알림을 발동하지 않는다 — 발송 전이므로")
    void draftCreationDoesNotTriggerRule2() {
        InterviewRound round = saveRound(RoundStatus.DRAFT, LocalDateTime.now().plusDays(3));
        Application stuck = saveInterviewPendingApplication(recruitment, "가능없음드래프트");
        InterviewRoundMember stuckMember = saveMemberWithStatus(round, stuck, RoundMemberStatus.NO_AVAILABLE_SLOT, "야간만");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(slotItem("2026-06-21T11:00:00", "2026-06-21T11:30:00", 1))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.reinvitedMemberCount", equalTo(0));

        assertThat(interviewRoundMemberRepository.findById(stuckMember.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.NO_AVAILABLE_SLOT);
        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getRequestSequence())
                .isZero();
    }

    @Test
    @DisplayName("응답 마감이 지난 뒤의 추가 슬롯 생성은 복귀를 발동하지 않는다 — 마감 연장이 먼저다")
    void rule2DoesNotFireAfterDeadline() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().minusHours(1));
        Application stuck = saveInterviewPendingApplication(recruitment, "마감후가능없음");
        InterviewRoundMember stuckMember = saveMemberWithStatus(round, stuck, RoundMemberStatus.NO_AVAILABLE_SLOT, "오전만");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(slotItem("2026-06-22T10:00:00", "2026-06-22T10:30:00", 1))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.reinvitedMemberCount", equalTo(0));

        assertThat(interviewRoundMemberRepository.findById(stuckMember.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.NO_AVAILABLE_SLOT);
    }

    @Test
    @DisplayName("배정 검토(ASSIGNING) 이후 단계에서는 슬롯을 생성할 수 없다")
    void slotCreationIsBlockedAfterCollecting() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusDays(1));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(slotItem("2026-06-23T10:00:00", "2026-06-23T10:30:00", 1))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("종료 시각이 시작 시각보다 빠른 슬롯은 만들 수 없다")
    void invalidSlotTimeIsRejected() {
        InterviewRound round = saveRound(RoundStatus.DRAFT, LocalDateTime.now().plusDays(7));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(slotItem("2026-06-20T15:00:00", "2026-06-20T14:00:00", 1))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("동시 면접 인원이 1 미만인 슬롯은 만들 수 없다")
    void nonPositiveCapacityIsRejected() {
        InterviewRound round = saveRound(RoundStatus.DRAFT, LocalDateTime.now().plusDays(7));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(slotItem("2026-06-20T14:00:00", "2026-06-20T14:30:00", 0))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("해당 동아리 운영진이 아니면 슬롯을 만들 수 없다")
    void nonManagerCannotCreateSlots() {
        InterviewRound round = saveRound(RoundStatus.DRAFT, LocalDateTime.now().plusDays(7));
        User outsider = saveUser("외부인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(slotItem("2026-06-20T14:00:00", "2026-06-20T14:30:00", 1))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 라운드에는 슬롯을 만들 수 없다")
    void unknownRoundReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(slotItem("2026-06-20T14:00:00", "2026-06-20T14:30:00", 1))))
                .when().post(CREATE_SLOTS_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 수정 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("아무도 선택하지 않은 슬롯은 시간을 변경할 수 있다")
    void unSelectedSlotTimeCanBeChanged() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("startTime", "2026-06-20T16:00:00", "endTime", "2026-06-20T16:30:00"))
                .when().patch(SLOT_PATH, slot.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        InterviewSlot updated = interviewSlotRepository.findById(slot.getId()).orElseThrow();
        assertThat(updated.getStartTime()).isEqualTo(LocalDateTime.parse("2026-06-20T16:00:00"));
    }

    @Test
    @DisplayName("지원자가 선택한 슬롯의 시간은 변경할 수 없다 — 정원만 변경할 수 있다")
    void selectedSlotAllowsOnlyCapacityChange() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        Application respondent = saveInterviewPendingApplication(recruitment, "응답자");
        saveMemberWithStatus(round, respondent, RoundMemberStatus.RESPONDED, null);
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                respondent.getId(), slot.getId(), round.getId()));

        // 시간 변경 → 409
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("startTime", "2026-06-20T17:00:00", "endTime", "2026-06-20T17:30:00"))
                .when().patch(SLOT_PATH, slot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());

        // 정원 변경 → 204
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("capacity", 3))
                .when().patch(SLOT_PATH, slot.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewSlotRepository.findById(slot.getId()).orElseThrow().getCapacity()).isEqualTo(3);
    }

    @Test
    @DisplayName("일정 확정(SCHEDULED) 라운드의 슬롯은 수정할 수 없다")
    void scheduledRoundSlotCannotBeModified() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED, LocalDateTime.now().minusDays(1));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("capacity", 5))
                .when().patch(SLOT_PATH, slot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("시작 시각만 전달하고 종료 시각을 생략하면 400 이 반환된다")
    void halfTimePairIsRejected() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("startTime", "2026-06-20T16:00:00"))
                .when().patch(SLOT_PATH, slot.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 슬롯의 수정은 404 를 반환한다")
    void unknownSlotUpdateReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("capacity", 2))
                .when().patch(SLOT_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 삭제 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("아무도 선택하지 않은 슬롯은 삭제할 수 있다")
    void unSelectedSlotCanBeDeleted() {
        InterviewRound round = saveRound(RoundStatus.DRAFT, LocalDateTime.now().plusDays(7));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete(SLOT_PATH, slot.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // soft delete — @SQLRestriction 으로 조회되지 않는다
        assertThat(interviewSlotRepository.findById(slot.getId())).isEmpty();
    }

    @Test
    @DisplayName("지원자가 선택한 슬롯은 삭제할 수 없다")
    void selectedSlotCannotBeDeleted() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        Application respondent = saveInterviewPendingApplication(recruitment, "선택자");
        saveMemberWithStatus(round, respondent, RoundMemberStatus.RESPONDED, null);
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                respondent.getId(), slot.getId(), round.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete(SLOT_PATH, slot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("배정 검토(ASSIGNING) 단계의 슬롯은 삭제할 수 없다")
    void assigningRoundSlotCannotBeDeleted() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusDays(1));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete(SLOT_PATH, slot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private Map<String, Object> slotItem(String start, String end, int capacity) {
        return Map.of("startTime", start, "endTime", end, "capacity", capacity);
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

    private InterviewRoundMember saveMemberWithStatus(InterviewRound round, Application application,
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

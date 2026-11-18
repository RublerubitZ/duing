package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.common.fixture.InterviewScheduleFixture;
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
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.Comparator;
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

// 확정 후 일정 변경(§6.4) — SCHEDULED 슬롯 관리·개별 재배정·INTERVIEW_UPDATED 알림을 검증한다.
// 라운드 터미널 의미(제외·해제·자동배정·취소 불변)·Rule 2 미발동·§16-1 불변식은 각 시나리오가 단언한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewRescheduleControllerTest extends InterviewControllerTestSupport {

    private static final String CREATE_SLOTS_PATH = "/api/v1/leader/interview-rounds/{roundId}/slots";
    private static final String SLOT_PATH = "/api/v1/leader/interview-slots/{slotId}";
    private static final String SCHEDULE_PATH =
            "/api/v1/leader/interview-rounds/{roundId}/members/{memberId}/schedule";
    private static final String ROUND_STATUS_CHANGED_MESSAGE =
            "라운드 단계가 바뀌었습니다. 최신 상태를 확인한 뒤 다시 시도해주세요.";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;
    @Autowired private NotificationRepository notificationRepository;

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("재조정동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "재조정모집");
    }

    @Test
    @DisplayName("확정된 라운드에 새 슬롯을 추가할 수 있다")
    void scheduledRoundAllowsSlotCreation() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        slotItem("2026-07-01T10:00:00", "2026-07-01T10:30:00", 1))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.CREATED.value());

        assertThat(interviewSlotRepository.countByRoundId(round.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("확정된 라운드에서 슬롯을 추가해도 가능없음 멤버가 재초대되지 않는다")
    void scheduledRoundSlotAdditionDoesNotTriggerRule2() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        Application stuckApplication = saveInterviewPendingApplication(recruitment, "가능없음확정후");
        InterviewRoundMember stuckMember = saveMember(round, stuckApplication, RoundMemberStatus.NO_AVAILABLE_SLOT);

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        slotItem("2026-07-01T11:00:00", "2026-07-01T11:30:00", 1))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                // reinvitedMemberCount 가 0 — Rule 2 는 COLLECTING 한정이므로 발동하지 않는다.
                .body("data.reinvitedMemberCount", org.hamcrest.Matchers.equalTo(0));

        // 멤버 상태 불변
        assertThat(interviewRoundMemberRepository.findById(stuckMember.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.NO_AVAILABLE_SLOT);
        // 알림 부재 — requestSequence 증가 없음
        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getRequestSequence())
                .isZero();
        // INTERVIEW_AVAILABILITY_REQUESTED 알림 부재 직접 단언 — Rule 2 가 발동했다면 q=1 키로 생성됐다.
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                stuckApplication.getUser().getId(),
                "INTERVIEW_AVAILABILITY_REQUESTED:r=" + round.getId()
                        + ":a=" + stuckApplication.getId() + ":q=1")).isFalse();
    }

    @Test
    @DisplayName("확정된 라운드의 참조 없는 슬롯은 수정·삭제할 수 있다")
    void scheduledRoundAllowsUnreferencedSlotModifyAndDelete() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot slot = saveSlot(round, "2026-07-02T14:00:00", 1);

        // capacity 수정 (정원 참조 없는 슬롯 — availability 0)
        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("capacity", 3))
                .when().patch(SLOT_PATH, slot.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewSlotRepository.findById(slot.getId()).orElseThrow().getCapacity()).isEqualTo(3);

        // 삭제 — 참조 없으므로 허용
        givenLeader()
                .when().delete(SLOT_PATH, slot.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewSlotRepository.findById(slot.getId())).isEmpty();
    }

    @Test
    @DisplayName("확정된 멤버를 다른 슬롯으로 옮기면 배정이 교체되고 변경 알림이 발송된다")
    void scheduledRoundAssignedMemberReassignSendsNotification() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot oldSlot = saveSlot(round, "2026-07-03T10:00:00", 1);
        InterviewSlot newSlot = saveSlot(round, "2026-07-03T11:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "재배정대상");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.ASSIGNED);
        // 기존 배정 픽스처로 직접 저장
        interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                application.getId(), oldSlot.getId(), round.getId()));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", newSlot.getId()))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 배정이 새 슬롯으로 교체
        Optional<InterviewSchedule> activeSchedule = interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(
                        round.getId(), application.getId(), InterviewScheduleStatus.ASSIGNED);
        assertThat(activeSchedule).isPresent();
        assertThat(activeSchedule.orElseThrow().getSlotId()).isEqualTo(newSlot.getId());
        // 멤버 상태 ASSIGNED 유지 — §16-1 불변식
        assertThat(interviewRoundMemberRepository.findById(member.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.ASSIGNED);
        // INTERVIEW_UPDATED 알림 — 새 슬롯 시각으로 한 건
        assertThat(updatedNotificationBodies(application)).containsExactly("07/03 11:00으로 일정이 변경되었습니다");
    }

    @Test
    @DisplayName("배정 검토 중의 수동 배정은 변경 알림을 보내지 않는다")
    void assigningRoundManualAssignDoesNotSendNotification() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-07-04T10:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "ASSIGNING배정");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", slot.getId()))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // ASSIGNING 은 draft — INTERVIEW_UPDATED 알림 없음
        assertThat(updatedNotificationBodies(application)).isEmpty();
    }

    @Test
    @DisplayName("확정된 라운드의 정원이 찬 슬롯으로는 옮길 수 없다")
    void scheduledRoundRejectsAssignToFullSlot() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot fullSlot = saveSlot(round, "2026-07-05T10:00:00", 1);
        // fullSlot 에 선점자 배정
        Application occupant = saveInterviewPendingApplication(recruitment, "선점자확정");
        saveMember(round, occupant, RoundMemberStatus.ASSIGNED);
        interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                occupant.getId(), fullSlot.getId(), round.getId()));

        Application latecomer = saveInterviewPendingApplication(recruitment, "후발확정");
        InterviewRoundMember latecomingMember = saveMember(round, latecomer, RoundMemberStatus.ASSIGNED);
        interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                latecomer.getId(), saveSlot(round, "2026-07-05T11:00:00", 1).getId(), round.getId()));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", fullSlot.getId()))
                .when().put(SCHEDULE_PATH, round.getId(), latecomingMember.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", org.hamcrest.Matchers.containsString("수용 인원이 가득"));
    }

    @Test
    @DisplayName("확정된 라운드에서 배정 해제는 여전히 불가하다")
    void scheduledRoundRejectsUnassign() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot slot = saveSlot(round, "2026-07-06T10:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "해제시도자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.ASSIGNED);
        interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                application.getId(), slot.getId(), round.getId()));

        // §16-1 — 해제를 허용하면 "schedule 없는 ASSIGNED" 상태가 생겨 불변식이 깨진다.
        givenLeader()
                .when().delete(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("취소된 라운드는 슬롯 추가도 재배정도 불가하다")
    void cancelledRoundRejectsAllChanges() {
        InterviewRound round = saveRound(RoundStatus.CANCELLED);
        Application application = saveInterviewPendingApplication(recruitment, "취소후시도");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.EXCLUDED);

        // 슬롯 추가
        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        slotItem("2026-07-07T10:00:00", "2026-07-07T10:30:00", 1))))
                .when().post(CREATE_SLOTS_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());

        // 재배정 (슬롯 없어도 phase 가드가 먼저 차단)
        InterviewSlot slot = saveSlot(round, "2026-07-07T10:00:00", 1);
        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", slot.getId()))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("확정된 라운드에서 멤버 제외는 여전히 불가하다")
    void scheduledRoundRejectsExclude() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        Application application = saveInterviewPendingApplication(recruitment, "제외시도자확정");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.ASSIGNED);

        // SCHEDULED 는 EXCLUDABLE_ROUND_STATUSES 에 없음 — 터미널 의미 유지
        givenLeader()
                .when().post("/api/v1/leader/interview-rounds/{roundId}/members/{memberId}/exclude",
                        round.getId(), member.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("확정된 라운드에서 지금 일정과 같은 슬롯을 보내면 아무것도 바뀌지 않고 알림도 없다")
    void scheduledRoundSameSlotIsNoOpWithoutNotification() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot slot = saveSlot(round, "2026-07-08T10:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "멱등재배정확정");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.ASSIGNED);
        // 지금 일정이 확정으로 정해진 경우 — 앞선 일정 변경 알림이 없어 이벤트가 나가면 알림 행이 반드시 생긴다.
        InterviewSchedule confirmedSchedule = interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                application.getId(), slot.getId(), round.getId()));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", slot.getId(), "expectedRoundStatus", "SCHEDULED"))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 이벤트 0건의 대리 단언 — @RecordApplicationEvents 는 테스트 스레드 ThreadLocal 이라 요청 스레드의 이벤트를 받지 못한다.
        assertThat(notificationRepository.countByUserIdAndReadAtIsNull(application.getUser().getId())).isZero();
        InterviewSchedule activeSchedule = interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(
                        round.getId(), application.getId(), InterviewScheduleStatus.ASSIGNED)
                .orElseThrow();
        assertThat(activeSchedule.getId()).isEqualTo(confirmedSchedule.getId());
        assertThat(activeSchedule.getSlotId()).isEqualTo(slot.getId());
    }

    @Test
    @DisplayName("확정된 라운드에서 배정이 있는 슬롯은 삭제할 수 없다")
    void scheduledRoundRejectsDeleteOfAssignedSlot() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot assignedSlot = saveSlot(round, "2026-07-09T10:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "배정보유슬롯삭제");
        saveMember(round, application, RoundMemberStatus.ASSIGNED);
        // 수동 배정 멤버 — availability 기록이 없어 SlotHasAvailability 가드로는 안 잡힌다.
        interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                application.getId(), assignedSlot.getId(), round.getId()));

        givenLeader()
                .when().delete(SLOT_PATH, assignedSlot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());

        // 슬롯 잔존 — 확정된 면접이 고아가 되지 않는다.
        assertThat(interviewSlotRepository.findById(assignedSlot.getId())).isPresent();
    }

    @Test
    @DisplayName("확정된 라운드에서 배정이 있는 슬롯의 시간은 변경할 수 없다")
    void scheduledRoundRejectsTimeChangeOfAssignedSlot() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot assignedSlot = saveSlot(round, "2026-07-10T10:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "배정보유시간변경");
        saveMember(round, application, RoundMemberStatus.ASSIGNED);
        // 수동 배정 멤버 — availability 기록이 없어 SlotTimeChangeForbiddenForSelectedSlot 로는 안 잡힌다.
        interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                application.getId(), assignedSlot.getId(), round.getId()));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("startTime", "2026-07-10T13:00:00", "endTime", "2026-07-10T13:30:00"))
                .when().patch(SLOT_PATH, assignedSlot.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("배정 검토 화면에서 보낸 배정이 그 사이 확정된 라운드에 오면 거절되고 일정 변경 알림도 없다")
    void staleAssigningScreenOnScheduledRoundIsRejected() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot oldSlot = saveSlot(round, "2026-07-08T10:00:00", 1);
        InterviewSlot newSlot = saveSlot(round, "2026-07-08T11:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "낡은화면대상");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.ASSIGNED);
        interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                application.getId(), oldSlot.getId(), round.getId()));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", newSlot.getId(), "expectedRoundStatus", "ASSIGNING"))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", org.hamcrest.Matchers.equalTo(ROUND_STATUS_CHANGED_MESSAGE));

        // 배정은 원래 슬롯 그대로, 새 슬롯으로의 변경 알림 없음
        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(
                        round.getId(), application.getId(), InterviewScheduleStatus.ASSIGNED)
                .orElseThrow().getSlotId()).isEqualTo(oldSlot.getId());
        assertThat(updatedNotificationBodies(application)).isEmpty();
    }

    @Test
    @DisplayName("확정 화면에서 보낸 일정 변경은 그대로 바뀌고 알림이 간다")
    void scheduledScreenRescheduleWithMatchingExpectedStatus() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot oldSlot = saveSlot(round, "2026-07-09T10:00:00", 1);
        InterviewSlot newSlot = saveSlot(round, "2026-07-09T11:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "확정화면대상");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.ASSIGNED);
        interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                application.getId(), oldSlot.getId(), round.getId()));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", newSlot.getId(), "expectedRoundStatus", "SCHEDULED"))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(
                        round.getId(), application.getId(), InterviewScheduleStatus.ASSIGNED)
                .orElseThrow().getSlotId()).isEqualTo(newSlot.getId());
        assertThat(updatedNotificationBodies(application)).containsExactly("07/09 11:00으로 일정이 변경되었습니다");
    }

    @Test
    @DisplayName("배정 검토 화면에서 보낸 배정은 배정 검토 라운드에 그대로 들어가고 알림이 없다")
    void assigningScreenAssignWithMatchingExpectedStatus() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-07-10T10:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "배정검토화면대상");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", slot.getId(), "expectedRoundStatus", "ASSIGNING"))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(
                        round.getId(), application.getId(), InterviewScheduleStatus.ASSIGNED)).isPresent();
        assertThat(updatedNotificationBodies(application)).isEmpty();
    }

    @Test
    @DisplayName("취소된 라운드에 배정 검토 화면에서 보내면 단계가 바뀌었다는 문구로 거절된다")
    void cancelledRoundWithExpectedAssigningGetsStatusChangedMessage() {
        InterviewRound round = saveRound(RoundStatus.CANCELLED);
        InterviewSlot slot = saveSlot(round, "2026-07-11T10:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "취소라운드대상");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", slot.getId(), "expectedRoundStatus", "ASSIGNING"))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                // 기대 단계 검사가 단계 허용 검사보다 먼저인지 문구로 구분한다
                .body("message", org.hamcrest.Matchers.equalTo(ROUND_STATUS_CHANGED_MESSAGE));
    }

    @Test
    @DisplayName("다른 동아리 사용자는 기대 단계가 달라도 404 — 남의 라운드 단계가 새지 않는다")
    void outsiderGets404EvenWithMismatchedExpectedStatus() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot slot = saveSlot(round, "2026-07-12T10:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "외부요청대상");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.ASSIGNED);
        User outsider = saveUser("다른동아리회장");
        Club otherClub = saveActiveClub("다른동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, outsider));
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", slot.getId(), "expectedRoundStatus", "ASSIGNING"))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("지금 일정과 같은 슬롯이어도 낡은 배정 검토 화면에서 보내면 단계가 바뀌었다는 문구로 거절된다")
    void staleScreenSameSlotGetsStatusChangedMessage() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot slot = saveSlot(round, "2026-07-13T10:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "낡은화면같은슬롯");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.ASSIGNED);
        interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                application.getId(), slot.getId(), round.getId()));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", slot.getId(), "expectedRoundStatus", "ASSIGNING"))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                // 같은 슬롯 생략이 기대 단계 검사보다 앞이면 낡은 화면이 204 를 받는다
                .body("message", org.hamcrest.Matchers.equalTo(ROUND_STATUS_CHANGED_MESSAGE));
    }

    @Test
    @DisplayName("확정된 라운드에서 A→B→A→B 로 옮기면 옮길 때마다 변경 알림이 가고 마지막 알림은 B 시각이다")
    void scheduledRoundBackAndForthNotifiesEveryMove() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewSlot slotA = saveSlot(round, "2026-07-14T10:00:00", 1);
        InterviewSlot slotB = saveSlot(round, "2026-07-14T11:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "왕복재배정");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.ASSIGNED);
        interviewScheduleRepository.save(InterviewScheduleFixture.assigned(
                application.getId(), slotA.getId(), round.getId()));

        // 세 번째 이동(다시 B)은 앞서 변경 알림을 받은 슬롯으로 돌아가는 이동이다 — 키가 (지원, 슬롯)뿐이면 여기서 빠진다.
        for (InterviewSlot targetSlot : List.of(slotB, slotA, slotB)) {
            givenLeader()
                    .contentType(ContentType.JSON)
                    .body(Map.of("slotId", targetSlot.getId(), "expectedRoundStatus", "SCHEDULED"))
                    .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                    .then().statusCode(HttpStatus.NO_CONTENT.value());
        }

        assertThat(updatedNotificationBodies(application)).containsExactly(
                "07/14 11:00으로 일정이 변경되었습니다",
                "07/14 10:00으로 일정이 변경되었습니다",
                "07/14 11:00으로 일정이 변경되었습니다");
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private List<String> updatedNotificationBodies(Application application) {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getUserId().equals(application.getUser().getId()))
                .filter(notification -> notification.getType() == NotificationType.INTERVIEW_UPDATED)
                .sorted(Comparator.comparing(Notification::getId))
                .map(Notification::getBody)
                .toList();
    }

    private io.restassured.specification.RequestSpecification givenLeader() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken);
    }

    private Map<String, Object> slotItem(String start, String end, int capacity) {
        return Map.of("startTime", start, "endTime", end, "capacity", capacity);
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
}

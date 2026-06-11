# BE#11 — 라운드 확정 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 구문으로 tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 6 은 리뷰 후 컨트롤러가 수행한다.**

**Goal:** `POST /api/v1/leader/interview-rounds/{roundId}/confirm?force=` — 미처리 멤버 경고 2종 분리 409, `force` 시 잔존 미처리 자동 EXCLUDED → schedule 보유 멤버 ASSIGNED → round SCHEDULED(터미널) → `INTERVIEW_SCHEDULED` 알림 (스펙 §6.3·§9.1 API 11).

**Architecture:** ASSIGNED 전이의 **유일한 지점**(§16-1)이자 알림 발화의 유일한 지점. "처리됨 = 활성 schedule 보유" (멤버 상태 무관 — 수동 배정된 INVITED/NO_AVAILABLE_SLOT 도 확정 대상, §6.3 "schedule 보유 멤버 ASSIGNED 전이" 문언이 §5.2 표의 주 경로 서술보다 우선). 미처리 = schedule 미보유 비EXCLUDED — RESPONDED 면 `respondedUnassigned`(강조), INVITED/NO_AVAILABLE_SLOT 이면 `unresponded` 로 분리 보고. 알림은 **기존 `InterviewScheduledEvent`/`InterviewScheduledListener` 인프라 재사용** (유지 목록 §13 — 발행만 추가, dedupKey `INTERVIEW_SCHEDULED:a={app}:s={slot}` 기존 그대로). 잠금: §16-7-4 순서 round(W)→members(W 전체).

**Tech Stack:** Spring Boot 3.4 / Java 21 / Spring Events / RestAssured + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.1·§6.3·§9.1 API 11·§16-1·§16-7-2·§16-7-4
**리뷰 정책:** duing-code-reviewer + codex 기본 + **codex adversarial 필수** (스펙 §12 — 확정)

---

## 핵심 결정

1. **분류 기준은 schedule 보유 여부 단일**: `confirmed` = 활성(ASSIGNED status·미삭제) schedule 보유 비EXCLUDED 멤버, `unresolved` = 미보유 비EXCLUDED 멤버. `confirmAssigned()` 도메인 허용 셋 {INVITED, RESPONDED, NO_AVAILABLE_SLOT} — 수동 배정 멤버의 확정 일관성 (§6.3 우선 근거 Architecture 에 명시).
2. **409 payload 는 house 포맷(`ApiResponse`) 안에**: `data = {code: "INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS", unresponded: [{applicationId, applicantName, memberStatus}], respondedUnassigned: [{applicationId, applicantName, selectedSlotIds}]}` — §6.3 의 body 구조를 FE 가 일관 파싱하는 표준 래퍼 데이터로 싣는다. 예외(`RoundHasUnresolvedMembers`)가 query payload 를 보유하고 `GlobalExceptionHandler` 전용 핸들러가 변환 (BE#3 의 잠금 충돌 핸들러 추가 전례).
3. **`NothingToConfirm`(409)**: 활성 schedule 보유 멤버 0명이면 force 여도 거부 — 배정 없는 라운드 확정은 무의미하고 취소(§12 BE#12)가 옳은 경로.
4. **force 시 미처리 멤버의 §16-3 정리 불요** — 미처리 정의 자체가 "활성 schedule 미보유"라 정리 대상이 없다 (방어 호출도 생략, 근거 주석).
5. **잠금**: round `findByIdForUpdate`(404→403→ASSIGNING 가드) → **전 멤버** 잠금 `findAllByRoundIdForUpdate` 신규 (분류·전이가 전 상태 대상, ORDER BY id — §16-7-2/7-4). slot 잠금 불요(capacity 검증 없음 — schedule 은 읽기만). application 잠금(§16-7) 생략: 확정은 이미 active 인 멤버십의 마무리라 "합불 처리된 지원자가 활성 멤버십 획득" 모순을 새로 만들지 않는다 — 합불 처리 직후 확정으로 ACCEPTED 지원자에게 확정 알림 1건이 갈 수 있는 경계는 수용 (지원자 화면은 §9.3-0 이 NOT_APPLICABLE 로 가림).
6. **이벤트는 confirmed 멤버별 발행** — `InterviewScheduledEvent(applicationId, slotId, recruitmentId)` 기존 시그니처 그대로 (slotId = 본인 schedule 의 슬롯, recruitmentId = round 값). 리스너는 무변경 (AFTER_COMMIT·createIfAbsent·dedupKey 기존재 — 알림 body 의 location 미포함도 기존 동작 유지, FE 상세 화면이 보충).
7. **응답 200 `{assignedMemberCount, excludedMemberCount}`** — force/비force 공통 (비force 성공 시 excluded 0).
8. **이름·선택 슬롯 조회는 기존 쿼리 재사용**: `findMemberLinesByRoundId`(BE#6 — applicantName) + `findByRoundId`(availability, BE#9 — selectedSlotIds). 409 경로에서만 추가 조회 (성공 경로 비용 0).

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Modify | `entity/InterviewRound.java` + `entity/InterviewRoundMember.java` + `entity/InterviewRoundDomainTest.java` | `confirm()`·`confirmAssigned()` TDD 4건 |
| Modify | `repository/InterviewRoundMemberRepository.java` | `findAllByRoundIdForUpdate` |
| Modify | `exception/InterviewException.java` | `NothingToConfirm`(409)·`RoundHasUnresolvedMembers`(409, payload 보유) |
| Create | `service/dto/query/UnresolvedMembersPayload.java` + `ConfirmResult.java` | 409 payload·결과 |
| Modify | `global/exception/GlobalExceptionHandler.java` | `RoundHasUnresolvedMembers` 전용 핸들러 |
| Create | `controller/dto/response/UnresolvedMembersResponse.java` + `ConfirmRoundResponse.java` | 응답 변환 |
| Modify | `service/InterviewAssignmentService.java` + `GeneralInterviewAssignmentService.java` | `confirmRound` (+eventPublisher 의존) |
| Modify | `api/LeaderInterviewAssignmentApi.java` + `controller/LeaderInterviewAssignmentController.java` | POST confirm (200) |
| Test Create | `controller/LeaderInterviewConfirmControllerTest.java` | RestAssured 12건 (E2E 풀 시나리오 포함) |

커밋 2개: ① 도메인 전이 TDD ② 확정 API.

---

### Task 1: 브랜치 생성

- [ ] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-round-confirm
```

---

### Task 2: 도메인 전이 2종 (TDD)

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/interview/entity/InterviewRoundDomainTest.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/entity/InterviewRound.java` / `InterviewRoundMember.java`

- [ ] **Step 1: 단위 테스트 4건 추가 (RED)**

```java
    @Test
    @DisplayName("배정 검토 중 라운드는 확정으로 종결된다")
    void assigningRoundConfirms() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);
        round.openCollecting(LocalDateTime.now());
        round.openAssigning();

        round.confirm();

        assertThat(round.getStatus()).isEqualTo(RoundStatus.SCHEDULED);
    }

    @Test
    @DisplayName("배정 검토 단계가 아닌 라운드는 확정할 수 없다")
    void nonAssigningRoundCannotConfirm() {
        InterviewRound collecting = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);
        collecting.openCollecting(LocalDateTime.now());

        assertThatThrownBy(collecting::confirm)
                .isInstanceOf(InterviewException.RoundTransitionNotAllowed.class);
    }

    @Test
    @DisplayName("배정을 보유한 멤버는 확정 시 상태와 무관하게 ASSIGNED 가 된다")
    void scheduledMembersConfirmRegardlessOfStatus() {
        InterviewRoundMember responded = InterviewRoundMember.invite(1L, 10L);
        responded.markResponded();
        InterviewRoundMember noSlot = InterviewRoundMember.invite(1L, 11L);
        noSlot.reportNoAvailableSlot("주말만");
        InterviewRoundMember invited = InterviewRoundMember.invite(1L, 12L);

        responded.confirmAssigned();
        noSlot.confirmAssigned();
        invited.confirmAssigned();

        assertThat(responded.getStatus()).isEqualTo(RoundMemberStatus.ASSIGNED);
        assertThat(noSlot.getStatus()).isEqualTo(RoundMemberStatus.ASSIGNED);
        assertThat(invited.getStatus()).isEqualTo(RoundMemberStatus.ASSIGNED);
    }

    @Test
    @DisplayName("이미 종결된 멤버는 확정 전이할 수 없다")
    void terminalMembersCannotConfirm() {
        InterviewRoundMember excluded = InterviewRoundMember.invite(1L, 10L);
        excluded.exclude();
        InterviewRoundMember assigned = InterviewRoundMember.invite(1L, 11L);
        ReflectionTestUtils.setField(assigned, "status", RoundMemberStatus.ASSIGNED);

        assertThatThrownBy(excluded::confirmAssigned)
                .isInstanceOf(InterviewException.MemberTransitionNotAllowed.class);
        assertThatThrownBy(assigned::confirmAssigned)
                .isInstanceOf(InterviewException.MemberTransitionNotAllowed.class);
    }
```

- [ ] **Step 2: RED 확인** — 컴파일 실패

- [ ] **Step 3: 구현 (GREEN)**

`InterviewRound` — `openAssigning()` 아래:

```java
    /** 확정: ASSIGNING → SCHEDULED (터미널, 스펙 §5.1·§6.3). 재확정·확정 후 변경 경로는 없다 (§14). */
    public void confirm() {
        if (this.status != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        this.status = RoundStatus.SCHEDULED;
    }
```

`InterviewRoundMember` — `exclude()` 아래:

```java
    /**
     * 확정: ASSIGNED 전이의 유일한 지점 (§6.3·§16-1). 분류 기준은 "활성 schedule 보유"(서비스 검증)라
     * 수동 배정된 INVITED·NO_AVAILABLE_SLOT 도 대상 — §6.3 문언이 §5.2 주 경로 서술보다 우선한다.
     */
    public void confirmAssigned() {
        if (this.status == RoundMemberStatus.ASSIGNED || this.status == RoundMemberStatus.EXCLUDED) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }
        this.status = RoundMemberStatus.ASSIGNED;
    }
```

- [ ] **Step 4: GREEN 확인** — 도메인 21건(기존 17+신규 4) PASS

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 라운드·멤버 확정 전이(confirm·confirmAssigned) 추가"
```

---

### Task 3: 통합 테스트 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/LeaderInterviewConfirmControllerTest.java`

- [ ] **Step 1: 테스트 작성** (`InterviewControllerTestSupport` 상속)

```java
package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;

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

// 확정 — ASSIGNED 전이·알림의 유일한 지점 (§6.3·§16-1). 미처리 멤버는 2종 분리 409 로 경고하고,
// force 면 자동 EXCLUDED(대기열 복귀) 후 라운드를 SCHEDULED(터미널)로 종결한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewConfirmControllerTest extends InterviewControllerTestSupport {

    private static final String CONFIRM_PATH = "/api/v1/leader/interview-rounds/{roundId}/confirm";
    private static final String CANDIDATES_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-round-candidates";
    private static final String VIEW_PATH = "/api/v1/applications/{applicationId}/interview";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
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
        Club club = saveActiveClub("확정동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "확정모집");
    }

    @Test
    @DisplayName("전원이 배정된 라운드를 확정하면 라운드가 종결되고 멤버들이 ASSIGNED 로 전이된다")
    void fullyAssignedRoundConfirms() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        InterviewRoundMember first = saveScheduledMember(round, "확정1", slot, RoundMemberStatus.RESPONDED);
        InterviewRoundMember second = saveScheduledMember(round, "확정2", slot, RoundMemberStatus.RESPONDED);

        givenLeader()
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(2))
                .body("data.excludedMemberCount", equalTo(0));

        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.SCHEDULED);
        assertThat(interviewRoundMemberRepository.findById(first.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.ASSIGNED);
        assertThat(interviewRoundMemberRepository.findById(second.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.ASSIGNED);
    }

    @Test
    @DisplayName("확정되면 배정된 지원자 전원에게 면접 확정 알림이 발송된다")
    void confirmNotifiesAssignedApplicants() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "알림대상");
        saveMemberWithSchedule(round, application, slot, RoundMemberStatus.RESPONDED);

        givenLeader()
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value());

        Long applicantUserId = userRepository.findById(application.getUser().getId()).orElseThrow().getId();
        String dedupKey = "INTERVIEW_SCHEDULED:a=" + application.getId() + ":s=" + slot.getId();
        assertThat(notificationRepository.existsByUserIdAndDedupKey(applicantUserId, dedupKey)).isTrue();
    }

    @Test
    @DisplayName("미처리 멤버가 있으면 강제 없는 확정은 2종으로 분리된 경고와 함께 거부된다")
    void unresolvedMembersBlockConfirmWithSplitWarning() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        saveScheduledMember(round, "배정완료", slot, RoundMemberStatus.RESPONDED);
        // (a) 미응답·가능없음 — unresponded 로 분류
        saveMember(round, saveInterviewPendingApplication(recruitment, "미응답자"), RoundMemberStatus.INVITED);
        saveMember(round, saveInterviewPendingApplication(recruitment, "가능없음자"), RoundMemberStatus.NO_AVAILABLE_SLOT);
        // (b) 응답했는데 만석 미배정 — respondedUnassigned 로 강조 분류
        Application unluckyApplication = saveInterviewPendingApplication(recruitment, "만석미배정");
        saveMember(round, unluckyApplication, RoundMemberStatus.RESPONDED);
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                unluckyApplication.getId(), slot.getId(), round.getId()));

        givenLeader()
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("data.code", equalTo("INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS"))
                .body("data.unresponded", hasSize(2))
                .body("data.unresponded.memberStatus", hasItem("INVITED"))
                .body("data.unresponded.memberStatus", hasItem("NO_AVAILABLE_SLOT"))
                .body("data.respondedUnassigned", hasSize(1))
                .body("data.respondedUnassigned[0].applicationId",
                        equalTo(unluckyApplication.getId().intValue()))
                .body("data.respondedUnassigned[0].selectedSlotIds", hasItem(slot.getId().intValue()));

        // 거부는 무부작용 — 라운드·멤버 상태가 그대로다.
        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.ASSIGNING);
    }

    @Test
    @DisplayName("강제 확정하면 미처리 멤버가 자동 제외되어 후보 대기열로 복귀하고 라운드는 종결된다")
    void forceConfirmExcludesUnresolvedAndCompletes() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        saveScheduledMember(round, "배정완료", slot, RoundMemberStatus.RESPONDED);
        Application unresolvedApplication = saveInterviewPendingApplication(recruitment, "미응답복귀");
        InterviewRoundMember unresolvedMember =
                saveMember(round, unresolvedApplication, RoundMemberStatus.INVITED);

        givenLeader()
                .queryParam("force", true)
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.excludedMemberCount", equalTo(1));

        assertThat(interviewRoundMemberRepository.findById(unresolvedMember.getId()).orElseThrow()
                .getStatus()).isEqualTo(RoundMemberStatus.EXCLUDED);
        // 제외된 지원자는 후보 대기열로 즉시 복귀한다 (application 은 INTERVIEW_PENDING 유지).
        givenLeader()
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.applicationId", hasItem(unresolvedApplication.getId().intValue()));
        // 제외된 지원자에게는 확정 알림이 가지 않는다.
        Long excludedUserId = userRepository.findById(unresolvedApplication.getUser().getId())
                .orElseThrow().getId();
        assertThat(notificationRepository.existsByUserIdAndDedupKey(excludedUserId,
                "INTERVIEW_SCHEDULED:a=" + unresolvedApplication.getId() + ":s=" + slot.getId()))
                .isFalse();
    }

    @Test
    @DisplayName("수동 배정된 가능없음·미응답 멤버도 확정 시 ASSIGNED 로 전이된다")
    void manuallyScheduledNonRespondedMembersConfirm() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        InterviewRoundMember noSlotMember = saveScheduledMember(round, "가능없음배정",
                slot, RoundMemberStatus.NO_AVAILABLE_SLOT);
        InterviewRoundMember invitedMember = saveScheduledMember(round, "미응답배정",
                slot, RoundMemberStatus.INVITED);

        givenLeader()
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(2));

        assertThat(interviewRoundMemberRepository.findById(noSlotMember.getId()).orElseThrow()
                .getStatus()).isEqualTo(RoundMemberStatus.ASSIGNED);
        assertThat(interviewRoundMemberRepository.findById(invitedMember.getId()).orElseThrow()
                .getStatus()).isEqualTo(RoundMemberStatus.ASSIGNED);
    }

    @Test
    @DisplayName("확정 후 지원자는 확정 일정 단계로, 강제 제외된 지원자는 다음 회차 대기 단계로 보인다")
    void phasesAfterConfirm() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application assignedApplication = saveInterviewPendingApplication(recruitment, "확정지원자");
        saveMemberWithSchedule(round, assignedApplication, slot, RoundMemberStatus.RESPONDED);
        Application excludedApplication = saveInterviewPendingApplication(recruitment, "제외지원자");
        saveMember(round, excludedApplication, RoundMemberStatus.INVITED);

        givenLeader().queryParam("force", true)
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value());

        givenApplicant(assignedApplication)
                .when().get(VIEW_PATH, assignedApplication.getId())
                .then().body("data.phase", equalTo("SCHEDULED"))
                .body("data.scheduledInterview.startTime", equalTo("2026-06-20T14:00:00"));
        givenApplicant(excludedApplication)
                .when().get(VIEW_PATH, excludedApplication.getId())
                .then().body("data.phase", equalTo("WAITING_NEXT_ROUND"));
    }

    @Test
    @DisplayName("배정이 하나도 없는 라운드는 강제로도 확정할 수 없다")
    void roundWithoutSchedulesCannotConfirm() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        saveMember(round, saveInterviewPendingApplication(recruitment, "무배정"), RoundMemberStatus.RESPONDED);

        givenLeader().queryParam("force", true)
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());

        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.ASSIGNING);
    }

    @Test
    @DisplayName("이미 확정됐거나 배정 검토 전인 라운드는 확정할 수 없다")
    void nonAssigningRoundsCannotConfirm() {
        InterviewRound scheduled = saveRound(RoundStatus.SCHEDULED);
        InterviewRound collecting = saveRound(RoundStatus.COLLECTING);

        givenLeader().when().post(CONFIRM_PATH, scheduled.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
        givenLeader().when().post(CONFIRM_PATH, collecting.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("존재하지 않는 라운드는 404, 타 동아리 운영진은 403 을 받는다")
    void notFoundAndForbiddenGuards() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        User outsider = saveUser("타인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        givenLeader().when().post(CONFIRM_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().post(CONFIRM_PATH, round.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("선정부터 확정까지 — 라운드 생애주기 전체가 API 만으로 완주된다")
    void fullLifecycleEndToEnd() {
        // 1) 후보 선정 → 라운드 생성 (DRAFT)
        Application applicant = saveInterviewPendingApplication(recruitment, "완주자");
        Long roundId = ((Number) givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접",
                        "availabilityDeadline", LocalDateTime.now().plusDays(3).toString(),
                        "applicationIds", List.of(applicant.getId())))
                .when().post("/api/v1/leader/recruitments/{recruitmentId}/interview-rounds",
                        recruitment.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data.roundId")).longValue();

        // 2) 슬롯 생성 → 발송 (COLLECTING + 알림)
        Long slotId = ((Number) givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(Map.of(
                        "startTime", "2026-06-20T14:00:00",
                        "endTime", "2026-06-20T14:30:00",
                        "capacity", 1))))
                .when().post("/api/v1/leader/interview-rounds/{roundId}/slots", roundId)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data.createdSlotIds[0]")).longValue();
        givenLeader().when().post("/api/v1/leader/interview-rounds/{roundId}/request-availability", roundId)
                .then().statusCode(HttpStatus.OK.value());

        // 3) 지원자 응답 (RESPONDED)
        givenApplicant(applicant)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slotId)))
                .when().put("/api/v1/applications/{applicationId}/interview-availability", applicant.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 4) 자동배정 (ASSIGNING + draft) → 확정 (SCHEDULED + ASSIGNED + 알림)
        givenLeader().when().post("/api/v1/leader/interview-rounds/{roundId}/auto-assign", roundId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1));
        givenLeader().when().post(CONFIRM_PATH, roundId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.excludedMemberCount", equalTo(0));

        // 5) 종결 검증 — 지원자 화면·알림까지
        givenApplicant(applicant)
                .when().get(VIEW_PATH, applicant.getId())
                .then().body("data.phase", equalTo("SCHEDULED"));
        Long applicantUserId = userRepository.findById(applicant.getUser().getId()).orElseThrow().getId();
        assertThat(notificationRepository.existsByUserIdAndDedupKey(applicantUserId,
                "INTERVIEW_SCHEDULED:a=" + applicant.getId() + ":s=" + slotId)).isTrue();
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private io.restassured.specification.RequestSpecification givenLeader() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken);
    }

    private io.restassured.specification.RequestSpecification givenApplicant(Application application) {
        User applicant = userRepository.findById(application.getUser().getId()).orElseThrow();
        String token = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private InterviewRound saveRound(RoundStatus status) {
        return interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().minusHours(1), "본관 201호", status));
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

    private InterviewRoundMember saveScheduledMember(InterviewRound round, String name,
                                                     InterviewSlot slot, RoundMemberStatus status) {
        Application application = saveInterviewPendingApplication(recruitment, name);
        return saveMemberWithSchedule(round, application, slot, status);
    }

    private InterviewRoundMember saveMemberWithSchedule(InterviewRound round, Application application,
                                                        InterviewSlot slot, RoundMemberStatus status) {
        InterviewRoundMember member = saveMember(round, application, status);
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), round.getId(), LocalDateTime.now()));
        return member;
    }
}
```

- [ ] **Step 2: RED 확인** — 컴파일 성공 + confirm 경로 전부 FAIL (E2E 의 1~4단계는 기존 API 라 정상 동작). **커밋하지 않는다.**

---

### Task 4: 구현 (GREEN)

- [ ] **Step 1: 레포 + payload·결과 DTO**

`InterviewRoundMemberRepository` 에 추가:

```java
    /** 확정의 분류·전이는 전 상태 멤버 대상 — 전 멤버 잠금 (§16-7-2·§16-7-4, ORDER BY id). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM InterviewRoundMember m WHERE m.roundId = :roundId ORDER BY m.id ASC")
    List<InterviewRoundMember> findAllByRoundIdForUpdate(@Param("roundId") Long roundId);
```

`service/dto/query/UnresolvedMembersPayload.java`:

```java
package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.RoundMemberStatus;
import java.util.List;

/** 확정 거부(§6.3) 경고 2종 — (a) 미응답·가능없음 / (b) 응답했는데 만석 미배정 (강조 대상). */
public record UnresolvedMembersPayload(
        List<UnrespondedMember> unresponded,
        List<RespondedUnassignedMember> respondedUnassigned
) {
    public record UnrespondedMember(Long applicationId, String applicantName,
                                    RoundMemberStatus memberStatus) {}

    public record RespondedUnassignedMember(Long applicationId, String applicantName,
                                            List<Long> selectedSlotIds) {}
}
```

`service/dto/query/ConfirmResult.java`:

```java
package com.duing.domain.interview.service.dto.query;

public record ConfirmResult(int assignedMemberCount, int excludedMemberCount) {}
```

- [ ] **Step 2: 예외 2종 + 전용 핸들러**

`InterviewException` 409 섹션에:

```java
    public static final class NothingToConfirm extends InterviewException {
        private static final String MESSAGE = "확정할 면접 배정이 없습니다.";
        public NothingToConfirm() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class RoundHasUnresolvedMembers extends InterviewException {
        private static final String MESSAGE = "미처리 멤버가 있어 확정할 수 없습니다. 처리 후 다시 시도하거나 강제 확정하세요.";
        private final UnresolvedMembersPayload payload;

        public RoundHasUnresolvedMembers(UnresolvedMembersPayload payload) {
            super(MESSAGE, HttpStatus.CONFLICT);
            this.payload = payload;
        }

        public UnresolvedMembersPayload getPayload() {
            return payload;
        }
    }
```

(import `UnresolvedMembersPayload`)

`controller/dto/response/UnresolvedMembersResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.service.dto.query.UnresolvedMembersPayload;
import java.util.List;

public record UnresolvedMembersResponse(
        String code,
        List<UnrespondedMember> unresponded,
        List<RespondedUnassignedMember> respondedUnassigned
) {
    private static final String CODE = "INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS";

    public record UnrespondedMember(Long applicationId, String applicantName, RoundMemberStatus memberStatus) {}

    public record RespondedUnassignedMember(Long applicationId, String applicantName, List<Long> selectedSlotIds) {}

    public static UnresolvedMembersResponse from(UnresolvedMembersPayload payload) {
        return new UnresolvedMembersResponse(
                CODE,
                payload.unresponded().stream()
                        .map(member -> new UnrespondedMember(
                                member.applicationId(), member.applicantName(), member.memberStatus()))
                        .toList(),
                payload.respondedUnassigned().stream()
                        .map(member -> new RespondedUnassignedMember(
                                member.applicationId(), member.applicantName(), member.selectedSlotIds()))
                        .toList());
    }
}
```

`GlobalExceptionHandler` 에 전용 핸들러 추가 — **기존 핸들러들의 ApiResponse 사용 방식을 먼저 읽고** 동일 스타일로 (data 를 싣는 생성이 기존 `error(String)` 으로 불가능하면 `ApiResponse` 의 canonical 생성자 사용 — `new ApiResponse<>(false, UnresolvedMembersResponse.from(...), exception.getMessage())` 꼴, 기존 record 필드 순서가 정답):

```java
    @ExceptionHandler(InterviewException.RoundHasUnresolvedMembers.class)
    public ResponseEntity<ApiResponse<UnresolvedMembersResponse>> handleUnresolvedMembers(
            InterviewException.RoundHasUnresolvedMembers exception) {
        // §6.3 — 경고 2종을 데이터로 실어 FE 가 분리 렌더·강조할 수 있게 한다.
        return ResponseEntity.status(exception.getStatus())
                .body(new ApiResponse<>(false, UnresolvedMembersResponse.from(exception.getPayload()),
                        exception.getMessage()));
    }
```

(※ `InterviewException.class` 포괄 핸들러보다 **구체 타입 핸들러가 우선**되는 것이 Spring 규칙 — 기존 포괄 핸들러 무변경.)

- [ ] **Step 3: 서비스**

`InterviewAssignmentService` 에 추가:

```java
    /**
     * 라운드 확정 (스펙 §6.3·§9.1 API 11) — ASSIGNED 전이·INTERVIEW_SCHEDULED 알림의 유일한 지점.
     * 미처리(활성 배정 미보유) 멤버가 있으면 force 없이는 경고 2종 분리 409, force 면 자동 EXCLUDED.
     */
    ConfirmResult confirmRound(Long roundId, boolean force, Long currentUserId);
```

`GeneralInterviewAssignmentService` 에 구현 (필드 추가: `ApplicationEventPublisher eventPublisher`, `InterviewRoundMemberRepositoryCustom` 경유 메서드는 기존 `interviewRoundMemberRepository` 로 — `findMemberLinesByRoundId` 가 Custom 에 있음. import: `InterviewScheduledEvent`·`UnresolvedMembersPayload`·`ConfirmResult`·`RoundMemberLine`·`ApplicationEventPublisher`·`Map`·`Collectors` 추가분):

```java
    @Override
    @Transactional
    public ConfirmResult confirmRound(Long roundId, boolean force, Long currentUserId) {
        // 잠금 순서 §16-7-4: round → members(전체). slot 잠금은 불요 — capacity 검증 없이 읽기만.
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);
        if (round.getStatus() != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        List<InterviewRoundMember> members =
                interviewRoundMemberRepository.findAllByRoundIdForUpdate(roundId);
        Map<Long, InterviewSchedule> scheduleByApplicationId = interviewScheduleRepository
                .findByRoundIdAndStatus(roundId, InterviewScheduleStatus.ASSIGNED).stream()
                .collect(Collectors.toMap(InterviewSchedule::getApplicationId, schedule -> schedule));

        List<InterviewRoundMember> confirmTargets = members.stream()
                .filter(member -> member.getStatus() != RoundMemberStatus.EXCLUDED)
                .filter(member -> scheduleByApplicationId.containsKey(member.getApplicationId()))
                .toList();
        List<InterviewRoundMember> unresolvedMembers = members.stream()
                .filter(member -> member.getStatus() != RoundMemberStatus.EXCLUDED)
                .filter(member -> !scheduleByApplicationId.containsKey(member.getApplicationId()))
                .toList();

        if (confirmTargets.isEmpty()) {
            throw new InterviewException.NothingToConfirm();
        }
        if (!unresolvedMembers.isEmpty() && !force) {
            throw new InterviewException.RoundHasUnresolvedMembers(
                    buildUnresolvedPayload(roundId, unresolvedMembers));
        }

        // force — 잔존 미처리 자동 EXCLUDED (§6.3). 미처리 = 활성 배정 미보유라 §16-3 정리 대상이 없다.
        unresolvedMembers.forEach(InterviewRoundMember::exclude);
        confirmTargets.forEach(InterviewRoundMember::confirmAssigned);
        round.confirm();

        // 알림은 AFTER_COMMIT 리스너가 처리 — 롤백 시 발송되지 않는다 (기존 인프라 재사용).
        confirmTargets.forEach(member -> eventPublisher.publishEvent(new InterviewScheduledEvent(
                member.getApplicationId(),
                scheduleByApplicationId.get(member.getApplicationId()).getSlotId(),
                round.getRecruitmentId())));

        return new ConfirmResult(confirmTargets.size(), unresolvedMembers.size());
    }

    private UnresolvedMembersPayload buildUnresolvedPayload(
            Long roundId, List<InterviewRoundMember> unresolvedMembers) {
        Map<Long, String> nameByApplicationId = interviewRoundMemberRepository
                .findMemberLinesByRoundId(roundId).stream()
                .collect(Collectors.toMap(RoundMemberLine::applicationId, RoundMemberLine::userName));
        Map<Long, List<Long>> selectedSlotIdsByApplicationId = interviewAvailabilityRepository
                .findByRoundId(roundId).stream()
                .collect(Collectors.groupingBy(InterviewAvailability::getApplicationId,
                        Collectors.mapping(InterviewAvailability::getSlotId, Collectors.toList())));

        return new UnresolvedMembersPayload(
                unresolvedMembers.stream()
                        .filter(member -> member.getStatus() != RoundMemberStatus.RESPONDED)
                        .map(member -> new UnresolvedMembersPayload.UnrespondedMember(
                                member.getApplicationId(),
                                nameByApplicationId.get(member.getApplicationId()),
                                member.getStatus()))
                        .toList(),
                unresolvedMembers.stream()
                        .filter(member -> member.getStatus() == RoundMemberStatus.RESPONDED)
                        .map(member -> new UnresolvedMembersPayload.RespondedUnassignedMember(
                                member.getApplicationId(),
                                nameByApplicationId.get(member.getApplicationId()),
                                selectedSlotIdsByApplicationId.getOrDefault(
                                        member.getApplicationId(), List.of())))
                        .toList());
    }
```

- [ ] **Step 4: 응답 DTO + Api + Controller**

`controller/dto/response/ConfirmRoundResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.service.dto.query.ConfirmResult;

public record ConfirmRoundResponse(int assignedMemberCount, int excludedMemberCount) {
    public static ConfirmRoundResponse from(ConfirmResult result) {
        return new ConfirmRoundResponse(result.assignedMemberCount(), result.excludedMemberCount());
    }
}
```

`LeaderInterviewAssignmentApi` 에 추가 (import `ConfirmRoundResponse`·`RequestParam`):

```java
    @Operation(
            summary = "면접 라운드 확정",
            description = "배정을 보유한 멤버를 ASSIGNED 로 전이하고 라운드를 종결(SCHEDULED·터미널)하며 확정 알림을 발송한다. "
                    + "미처리(배정 없는) 멤버가 있으면 force 없이는 409 로 거부하고 경고 2종 — 미응답·가능없음 / "
                    + "응답했는데 만석 미배정(강조 대상) — 을 분리 반환한다. force=true 면 미처리 멤버를 자동 제외해 "
                    + "후보 대기열로 복귀시킨 뒤 종결한다. 배정이 하나도 없으면 강제로도 확정할 수 없다."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/confirm")
    ResponseEntity<ApiResponse<ConfirmRoundResponse>> confirmRound(
            @PathVariable Long roundId,
            @RequestParam(defaultValue = "false") boolean force,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`LeaderInterviewAssignmentController` 에 구현:

```java
    @Override
    public ResponseEntity<ApiResponse<ConfirmRoundResponse>> confirmRound(
            @PathVariable Long roundId,
            @RequestParam(defaultValue = "false") boolean force,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(ConfirmRoundResponse.from(
                interviewAssignmentService.confirmRound(roundId, force, currentUser.id()))));
    }
```

- [ ] **Step 5: GREEN 확인** — 12건 PASS (E2E 포함)

---

### Task 5: 전체 검증 + 커밋

- [ ] **Step 1:** `./gradlew test` → BUILD SUCCESSFUL (839 + 4 + 12 = 855건 예상)

- [ ] **Step 2:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 면접 라운드 확정 API — 경고 2종 분리·강제 제외·확정 알림"
```

---

### Task 6: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [ ] **Step 1: self-check 7항목** (기존 동일 명령)

- [ ] **Step 2: push + PR** (자동 머지 금지. **리뷰 단계에서 codex adversarial 필수**)

```bash
git push -u origin feat/interview-round-confirm
gh pr create --base develop --title "feat(backend): 면접 라운드 확정 API" --body "$(cat <<'EOF'
## 🚀 작업 내용

라운드 생애주기의 마지막 조각 — 확정입니다. 배정을 보유한 멤버 전원이 ASSIGNED 로 전이되고 라운드는 터미널(SCHEDULED)로 종결되며, 그 시점에 면접 확정 알림이 나갑니다. ASSIGNED 전이와 확정 알림 모두 이 API 가 유일한 지점입니다 — draft 단계에서 아무리 배정을 만지작거려도 지원자에게는 아무것도 가지 않던 설계가 여기서 완성됩니다.

미처리 멤버가 남아 있으면 그냥 확정되지 않습니다. 경고를 두 종으로 분리해 돌려주는데 — 미응답·가능없음 그룹과, "응답까지 했는데 슬롯이 만석이라 못 들어간" 그룹(강조 대상)입니다. 후자가 운영진이 놓치면 가장 미안해지는 케이스라서요. 그래도 진행하려면 force 로 강제 확정하고, 잔존 미처리 멤버는 자동 제외되어 후보 대기열로 복귀합니다 — 다음 라운드에서 다시 부르면 됩니다.

선정 → 라운드 생성 → 슬롯 → 발송 → 지원자 응답 → 자동배정 → 확정 → 지원자 화면·알림까지, 생애주기 전체를 API 호출만으로 완주하는 엔드투엔드 테스트를 함께 넣었습니다.

## 🤔 고민했던 내용

- 확정 대상의 기준은 멤버 상태가 아니라 "활성 배정 보유"입니다 — 수동 배정된 가능없음·미응답 멤버도 확정되면 ASSIGNED 가 됩니다. 상태머신 표의 주 경로 서술보다 §6.3 의 "schedule 보유 멤버 ASSIGNED 전이" 문언을 우선했습니다.
- 배정이 하나도 없는 라운드는 강제로도 확정을 거부합니다 — 빈 확정은 취소가 옳은 경로입니다.
- 409 경고 본문은 표준 응답 래퍼의 data 로 실었습니다 — 전용 예외가 payload 를 들고 가고 전역 핸들러의 구체 타입 핸들러가 변환합니다.
- 알림은 기존 확정 알림 인프라(이벤트·리스너·중복 방지 키)를 발행만 해서 재사용합니다 — AFTER_COMMIT 이라 롤백 시 발송되지 않습니다.
- 잠금은 전역 순서대로 라운드 → 전체 멤버입니다. 지원서 행 잠금은 생략했습니다 — 확정은 이미 활성인 멤버십의 마무리라 §16-7 이 막는 모순을 새로 만들지 않으며, 합불 처리 직후 확정으로 알림 1건이 겹치는 경계는 수용했습니다.

## 💬 리뷰 중점사항

- 미처리 분류(배정 미보유 비EXCLUDED → RESPONDED 면 강조 그룹)가 §6.3 과 1:1 인지.
- force 트랜잭션의 원자성 — 제외·전이·종결·이벤트 발행이 한 단위인지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §5.1·§6.3·§9.1 API 11·§16-1·§16-7-4
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §6.3 전부 — 경고 2종 분리 409(body 구조·memberStatus 세분·selectedSlotIds) → 테스트 3, force 원자 TX(EXCLUDED→ASSIGNED→SCHEDULED→알림) → 테스트 4·1·2, EXCLUDED 대기열 복귀 → 테스트 4 cross-API, 알림 확정 시점 한정 → 테스트 2·4(부정 단언). §16-1(ASSIGNED 유일 지점) → 도메인 confirmAssigned + Architecture. §9.1 API 11 → 전체. E2E → 테스트 12.
- **플레이스홀더**: 없음.
- **타입 일관성**: `confirm()`/`confirmAssigned()` 시그니처 도메인·서비스·테스트 일치, `ConfirmResult`↔`ConfirmRoundResponse`·`UnresolvedMembersPayload`↔`UnresolvedMembersResponse` 매핑 필드 일치, `InterviewScheduledEvent(applicationId, slotId, recruitmentId)` 기존 시그니처 실측 일치, `findMemberLinesByRoundId`·`findByRoundId`(availability)·`findByRoundIdAndStatus`(schedule) 기존재.
- **주의 메모**: ① E2E 테스트의 request body 필드명(`title`/`availabilityDeadline`/`applicationIds`, slots 일괄 생성 구조, `data.roundId`/`data.createdSlotIds`)은 BE#3/4 의 실제 계약 — 구현 시 기존 컨트롤러 테스트에서 확인하고 다르면 **호출부만 보정** (의미 무변경). ② `ApiResponse` canonical 생성자 필드 순서는 기존 record 정의가 정답. ③ `userRepository`·`applicationRepository` 가 TestSupport 에 protected 로 있는지 확인 (BE#7/8 테스트가 사용한 전례). ④ 알림 리스너는 무변경 — body 에 location 미포함은 기존 동작 유지.

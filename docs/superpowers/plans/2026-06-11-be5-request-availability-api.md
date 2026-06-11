# BE#5 — 발송/재알림 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Availability 요청 발송(`POST /leader/interview-rounds/{roundId}/request-availability` — DRAFT→COLLECTING 전이 + INVITED 전원 알림)과 재알림(`POST .../remind` — COLLECTING 한정, 미응답 INVITED 대상)을 구현한다.

**Architecture:** **첫 라운드 상태 전이 도메인 메서드** `InterviewRound.openCollecting(now)` 도입 (TDD — DRAFT 전제·deadline 필수·미래 검증을 도메인이 보유). 발송 가드 3종(슬롯≥1·INVITED≥1·deadline)은 스펙 §10.3 의 wizard 발송 버튼 활성화 조건과 1:1. 알림은 BE#4 의 `INTERVIEW_AVAILABILITY_REQUESTED` 인프라(이벤트/리스너/dedupKey `q={requestSequence}`)를 그대로 소비 — 발송·재알림 각각 직전에 `increaseRequestSequence()` (스펙 §8). 동시 발송 race 는 round `@Version` + BE#4 의 낙관적 충돌 전역 409 핸들러가 처리한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Spring Events / RestAssured + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.1(전이)·§8(알림)·§9.1 API 5·6·§10.3(발송 가드 1:1)
**리뷰 정책:** duing-code-reviewer + codex 기본 (BE#5 는 adversarial 필수 목록 아님 — 단 상태 전이가 있으므로 리뷰 프롬프트에 전이 정합 포인트 명시)

---

## 핵심 결정

1. **`openCollecting(now)` 도메인 메서드**: status==DRAFT 전제(아니면 `RoundTransitionNotAllowed` 409 — BE#9/11/12 전이들이 재사용할 일반 예외), deadline null → `AvailabilityDeadlineRequired`(400), deadline 과거 → `InvalidDeadline`(400 재사용 — 생성 시 검증했어도 발송까지 시간이 흘렀을 수 있어 재검증). 슬롯/멤버 카운트는 도메인이 레포를 모르므로 서비스 가드.
2. **알림 대상은 INVITED 멤버만** — 발송 시점엔 wizard 직후라 전원 INVITED 가 정상이지만 방어적으로 필터. 대상 0명 → `NoMemberToNotify`(409, 발송·재알림 공용).
3. **재알림은 마감 무관 허용** (스펙 §9.1 API 6 문언: COLLECTING 한정·INVITED 대상 — 마감 제한 없음). 마감 후엔 [마감 연장]이 먼저라는 흐름은 FE 가이드 영역.
4. **응답은 `AvailabilityRequestResponse(notifiedMemberCount)` + 200** — wizard Step4 발송 피드백·재알림 토스트 공용.
5. **`getRoundWithManagerAuth` 헬퍼는 `GeneralInterviewRoundService` 에 동일 패턴으로 중복 허용** — `GeneralInterviewSlotService` 와 2곳, rule of three 전까지 추출하지 않는다 (계획 명시로 리뷰 노이즈 방지).
6. `Clock` 주입 (BE#4 전례 — seoulClock 빈), `InterviewSlotRepository.countByRoundId` derived 추가.

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Modify | `domain/interview/entity/InterviewRound.java` | `openCollecting(now)` |
| Modify | `domain/interview/exception/InterviewException.java` | `RoundTransitionNotAllowed`(409)·`AvailabilityDeadlineRequired`(400)·`RoundHasNoSlots`(409)·`NoMemberToNotify`(409) |
| Modify | `domain/interview/repository/InterviewSlotRepository.java` | `countByRoundId` |
| Modify | `domain/interview/service/InterviewRoundService.java` + `GeneralInterviewRoundService.java` | `requestAvailability`/`remind` + deps(slotRepo·eventPublisher·clock) |
| Create | `controller/dto/response/AvailabilityRequestResponse.java` | `{notifiedMemberCount}` |
| Modify | `api/LeaderInterviewRoundApi.java` + `controller/LeaderInterviewRoundController.java` | 엔드포인트 2개 (200) |
| Test Modify | `entity/InterviewRoundDomainTest.java` | openCollecting 4건 추가 |
| Test Create | `controller/LeaderInterviewRoundRequestControllerTest.java` | RestAssured 13건 |

커밋 2개: ① 도메인 전이 TDD ② 발송/재알림 API.

---

### Task 1: 브랜치 생성

- [ ] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-availability-request
```

---

### Task 2: `openCollecting` 도메인 전이 (TDD)

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/interview/entity/InterviewRoundDomainTest.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/entity/InterviewRound.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/exception/InterviewException.java` (RoundTransitionNotAllowed·AvailabilityDeadlineRequired 선반영)

- [ ] **Step 1: 단위 테스트 4건 추가 (RED)** — `InterviewRoundDomainTest` 에 추가:

```java
    @Test
    @DisplayName("준비 중(DRAFT) 라운드는 마감이 미래로 설정돼 있으면 응답 수집을 시작할 수 있다")
    void draftRoundOpensCollecting() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);

        round.openCollecting(LocalDateTime.now());

        assertThat(round.getStatus()).isEqualTo(RoundStatus.COLLECTING);
    }

    @Test
    @DisplayName("마감 시각이 정해지지 않은 라운드는 발송할 수 없다")
    void openCollectingRequiresDeadline() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접", null, null);

        assertThatThrownBy(() -> round.openCollecting(LocalDateTime.now()))
                .isInstanceOf(InterviewException.AvailabilityDeadlineRequired.class);
    }

    @Test
    @DisplayName("마감 시각이 이미 지난 라운드는 발송할 수 없다 — 생성 후 시간이 흐른 경우의 재검증")
    void openCollectingRejectsPastDeadline() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);

        assertThatThrownBy(() -> round.openCollecting(LocalDateTime.now().plusDays(8)))
                .isInstanceOf(InterviewException.InvalidDeadline.class);
    }

    @Test
    @DisplayName("이미 발송된 라운드는 다시 발송할 수 없다")
    void openCollectingRequiresDraftStatus() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);
        round.openCollecting(LocalDateTime.now());

        assertThatThrownBy(() -> round.openCollecting(LocalDateTime.now()))
                .isInstanceOf(InterviewException.RoundTransitionNotAllowed.class);
    }
```

- [ ] **Step 2: RED 확인** — `./gradlew test --tests "com.duing.domain.interview.entity.InterviewRoundDomainTest"` → 컴파일 실패

- [ ] **Step 3: 구현 (GREEN)**

`InterviewException` — 409 섹션에:

```java
    public static final class RoundTransitionNotAllowed extends InterviewException {
        private static final String MESSAGE = "현재 단계에서 허용되지 않는 라운드 상태 변경입니다.";
        public RoundTransitionNotAllowed() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
```

400 섹션(`InvalidDeadline` 아래)에:

```java
    public static final class AvailabilityDeadlineRequired extends InterviewException {
        private static final String MESSAGE = "발송 전에 면접 가능시간 마감을 설정해야 합니다.";
        public AvailabilityDeadlineRequired() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
```

`InterviewRound` — `increaseRequestSequence()` 아래에 (import `InterviewException`):

```java
    /**
     * 발송: DRAFT → COLLECTING (스펙 §5.1). 마감은 발송의 전제 조건이라 도메인이 직접 검증한다 —
     * 생성 시점에 미래였어도 발송까지 시간이 흐를 수 있어 재검증한다.
     * 슬롯·멤버 존재 가드는 레포지토리가 필요하므로 서비스가 담당한다 (스펙 §10.3 가드 3종 중 나머지).
     */
    public void openCollecting(LocalDateTime now) {
        if (this.status != RoundStatus.DRAFT) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        if (this.availabilityDeadline == null) {
            throw new InterviewException.AvailabilityDeadlineRequired();
        }
        if (!this.availabilityDeadline.isAfter(now)) {
            throw new InterviewException.InvalidDeadline();
        }
        this.status = RoundStatus.COLLECTING;
    }
```

- [ ] **Step 4: GREEN 확인** — 7건(기존 3+신규 4) PASS

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 라운드 발송 전이(openCollecting) 도메인 메서드 추가"
```

---

### Task 3: 통합 테스트 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/LeaderInterviewRoundRequestControllerTest.java`

- [ ] **Step 1: 테스트 작성** (`InterviewControllerTestSupport` 상속)

```java
package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.notification.repository.NotificationRepository;
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

// 발송(DRAFT→COLLECTING + INVITED 전원 알림)과 재알림(COLLECTING, 미응답 대상)을 검증한다.
// 발송 가드 3종(슬롯≥1·INVITED≥1·deadline 필수/미래)은 wizard 발송 버튼 조건과 1:1 이다 (스펙 §9.1 API 5·6·§10.3).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewRoundRequestControllerTest extends InterviewControllerTestSupport {

    private static final String REQUEST_PATH = "/api/v1/leader/interview-rounds/{roundId}/request-availability";
    private static final String REMIND_PATH = "/api/v1/leader/interview-rounds/{roundId}/remind";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private NotificationRepository notificationRepository;

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("발송동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "발송모집");
    }

    // ── 발송 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("슬롯과 대상자가 준비된 라운드를 발송하면 응답 수집이 시작되고 전원에게 알림이 간다")
    void requestAvailabilityOpensCollectingAndNotifiesAll() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().plusDays(7));
        saveSlot(round);
        Application first = saveInterviewPendingApplication(recruitment, "대상자1");
        Application second = saveInterviewPendingApplication(recruitment, "대상자2");
        saveMember(round, first, RoundMemberStatus.INVITED);
        saveMember(round, second, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.notifiedMemberCount", equalTo(2));

        InterviewRound sent = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(sent.getStatus()).isEqualTo(RoundStatus.COLLECTING);
        assertThat(sent.getRequestSequence()).isEqualTo(1);
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                first.getUser().getId(), requestDedupKey(round, first, 1))).isTrue();
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                second.getUser().getId(), requestDedupKey(round, second, 1))).isTrue();
    }

    @Test
    @DisplayName("슬롯이 하나도 없는 라운드는 발송할 수 없다")
    void requestWithoutSlotsIsRejected() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().plusDays(7));
        Application target = saveInterviewPendingApplication(recruitment, "대상자");
        saveMember(round, target, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());

        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.DRAFT);
    }

    @Test
    @DisplayName("마감 시각이 설정되지 않은 라운드는 발송할 수 없다")
    void requestWithoutDeadlineIsRejected() {
        InterviewRound round = saveDraftRound(null);
        saveSlot(round);
        Application target = saveInterviewPendingApplication(recruitment, "대상자");
        saveMember(round, target, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("마감 시각이 이미 지난 라운드는 발송할 수 없다")
    void requestWithPastDeadlineIsRejected() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().minusHours(1));
        saveSlot(round);
        Application target = saveInterviewPendingApplication(recruitment, "대상자");
        saveMember(round, target, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("초대 상태의 대상자가 없는 라운드는 발송할 수 없다")
    void requestWithoutInvitedMembersIsRejected() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().plusDays(7));
        saveSlot(round);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("이미 발송된 라운드는 다시 발송할 수 없다")
    void alreadyCollectingRoundCannotBeRequestedAgain() {
        InterviewRound round = saveRoundWithStatus(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveSlot(round);
        Application target = saveInterviewPendingApplication(recruitment, "대상자");
        saveMember(round, target, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("취소된 라운드는 발송할 수 없다")
    void cancelledRoundCannotBeRequested() {
        InterviewRound round = saveRoundWithStatus(RoundStatus.CANCELLED, LocalDateTime.now().plusDays(3));
        saveSlot(round);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("해당 동아리 운영진이 아니면 발송할 수 없다")
    void nonManagerCannotRequest() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().plusDays(7));
        User outsider = saveUser("외부인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().post(REQUEST_PATH, round.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 라운드의 발송은 404 를 반환한다")
    void unknownRoundRequestReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REQUEST_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 재알림 ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("재알림은 아직 응답하지 않은 대상자에게만 새 회차로 발송된다")
    void remindNotifiesOnlyUnrespondedMembers() {
        InterviewRound round = saveRoundWithStatus(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        ReflectionTestUtils.setField(round, "requestSequence", 1);
        round = interviewRoundRepository.save(round);
        Application silent = saveInterviewPendingApplication(recruitment, "미응답자");
        Application responded = saveInterviewPendingApplication(recruitment, "응답자");
        saveMember(round, silent, RoundMemberStatus.INVITED);
        saveMember(round, responded, RoundMemberStatus.RESPONDED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REMIND_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.notifiedMemberCount", equalTo(1));

        InterviewRound reminded = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(reminded.getRequestSequence()).isEqualTo(2);
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                silent.getUser().getId(), requestDedupKey(round, silent, 2))).isTrue();
        assertThat(notificationRepository.existsByUserIdAndDedupKey(
                responded.getUser().getId(), requestDedupKey(round, responded, 2))).isFalse();
    }

    @Test
    @DisplayName("응답 마감이 지난 뒤에도 재알림을 보낼 수 있다")
    void remindIsAllowedAfterDeadline() {
        InterviewRound round = saveRoundWithStatus(RoundStatus.COLLECTING, LocalDateTime.now().minusHours(1));
        Application silent = saveInterviewPendingApplication(recruitment, "마감후미응답");
        saveMember(round, silent, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REMIND_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.notifiedMemberCount", equalTo(1));
    }

    @Test
    @DisplayName("미응답 대상자가 없으면 재알림을 보낼 수 없다")
    void remindWithoutUnrespondedMembersIsRejected() {
        InterviewRound round = saveRoundWithStatus(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        Application responded = saveInterviewPendingApplication(recruitment, "전원응답");
        saveMember(round, responded, RoundMemberStatus.RESPONDED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REMIND_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("발송 전(DRAFT) 라운드에는 재알림을 보낼 수 없다")
    void remindRequiresCollectingStatus() {
        InterviewRound round = saveDraftRound(LocalDateTime.now().plusDays(7));
        Application target = saveInterviewPendingApplication(recruitment, "드래프트대상");
        saveMember(round, target, RoundMemberStatus.INVITED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().post(REMIND_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private InterviewRound saveDraftRound(LocalDateTime deadline) {
        return interviewRoundRepository.save(InterviewRoundFixture.draft(recruitment.getId(), deadline));
    }

    private InterviewRound saveRoundWithStatus(RoundStatus status, LocalDateTime deadline) {
        return interviewRoundRepository.save(
                InterviewRoundFixture.withStatus(recruitment.getId(), deadline, null, status));
    }

    private void saveSlot(InterviewRound round) {
        LocalDateTime startTime = LocalDateTime.now().plusDays(10);
        interviewSlotRepository.save(InterviewSlot.create(
                round.getId(), startTime, startTime.plusMinutes(30), 1));
    }

    private void saveMember(InterviewRound round, Application application, RoundMemberStatus status) {
        InterviewRoundMember member = InterviewRoundMember.invite(round.getId(), application.getId());
        if (status != RoundMemberStatus.INVITED) {
            ReflectionTestUtils.setField(member, "status", status);
        }
        interviewRoundMemberRepository.save(member);
    }

    private String requestDedupKey(InterviewRound round, Application application, int sequence) {
        return "INTERVIEW_AVAILABILITY_REQUESTED:r=" + round.getId()
                + ":a=" + application.getId() + ":q=" + sequence;
    }
}
```

- [ ] **Step 2: RED 확인** — `./gradlew test --tests "...LeaderInterviewRoundRequestControllerTest"` → 컴파일 성공 + 대부분 FAIL (404 기대 1건 우연 PASS 가능). **커밋하지 않는다.**

---

### Task 4: 구현 (GREEN)

- [ ] **Step 1: 예외 2개 추가** (409 섹션 — Task 2 의 2개는 이미 반영됨):

```java
    public static final class RoundHasNoSlots extends InterviewException {
        private static final String MESSAGE = "슬롯이 없는 라운드는 발송할 수 없습니다. 슬롯을 먼저 생성해주세요.";
        public RoundHasNoSlots() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class NoMemberToNotify extends InterviewException {
        private static final String MESSAGE = "알림을 보낼 대상자가 없습니다.";
        public NoMemberToNotify() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
```

- [ ] **Step 2: `InterviewSlotRepository` 에 `long countByRoundId(Long roundId);` 추가**

- [ ] **Step 3: 응답 DTO**

`backend/src/main/java/com/duing/domain/interview/controller/dto/response/AvailabilityRequestResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

public record AvailabilityRequestResponse(int notifiedMemberCount) {}
```

- [ ] **Step 4: 서비스**

`InterviewRoundService` 에 추가:

```java
    /**
     * 발송: DRAFT → COLLECTING 전이 + INVITED 전원에게 Availability 요청 알림 (스펙 §9.1 API 5).
     * 가드 3종(슬롯≥1·INVITED≥1·deadline 필수/미래)은 wizard 발송 버튼 조건과 1:1 (§10.3).
     */
    AvailabilityRequestResponse requestAvailability(Long roundId, Long currentUserId);

    /**
     * 재알림: COLLECTING 라운드의 미응답(INVITED) 대상에게 새 회차로 재발송 (스펙 §9.1 API 6).
     */
    AvailabilityRequestResponse remind(Long roundId, Long currentUserId);
```

`GeneralInterviewRoundService` — 필드 추가: `InterviewSlotRepository interviewSlotRepository`, `ApplicationEventPublisher eventPublisher`, `Clock clock` (import 포함). 메서드:

```java
    @Override
    @Transactional
    public AvailabilityRequestResponse requestAvailability(Long roundId, Long currentUserId) {
        InterviewRound round = getRoundWithManagerAuth(roundId, currentUserId);

        if (interviewSlotRepository.countByRoundId(round.getId()) == 0) {
            throw new InterviewException.RoundHasNoSlots();
        }
        List<InterviewRoundMember> invitedMembers = interviewRoundMemberRepository
                .findByRoundIdAndStatus(round.getId(), RoundMemberStatus.INVITED);
        if (invitedMembers.isEmpty()) {
            throw new InterviewException.NoMemberToNotify();
        }

        round.openCollecting(LocalDateTime.now(clock));
        notifyAvailabilityRequest(round, invitedMembers);
        return new AvailabilityRequestResponse(invitedMembers.size());
    }

    @Override
    @Transactional
    public AvailabilityRequestResponse remind(Long roundId, Long currentUserId) {
        InterviewRound round = getRoundWithManagerAuth(roundId, currentUserId);

        if (round.getStatus() != RoundStatus.COLLECTING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        List<InterviewRoundMember> unrespondedMembers = interviewRoundMemberRepository
                .findByRoundIdAndStatus(round.getId(), RoundMemberStatus.INVITED);
        if (unrespondedMembers.isEmpty()) {
            throw new InterviewException.NoMemberToNotify();
        }

        notifyAvailabilityRequest(round, unrespondedMembers);
        return new AvailabilityRequestResponse(unrespondedMembers.size());
    }

    /**
     * 요청 회차를 1 올리고 대상 멤버별로 Availability 요청 이벤트를 발행한다 (스펙 §8).
     * 알림 생성은 AFTER_COMMIT 리스너(InterviewAvailabilityRequestedListener)가 담당한다.
     */
    private void notifyAvailabilityRequest(InterviewRound round, List<InterviewRoundMember> targets) {
        round.increaseRequestSequence();
        for (InterviewRoundMember target : targets) {
            eventPublisher.publishEvent(new InterviewAvailabilityRequestedEvent(
                    round.getId(), target.getApplicationId(), round.getRequestSequence()));
        }
    }

    /**
     * round → recruitment → club 경로의 운영진 권한 가드.
     * GeneralInterviewSlotService 와 동일 패턴 중복 — 2곳까지는 허용, 세 번째 등장 시 공통화한다 (rule of three).
     */
    private InterviewRound getRoundWithManagerAuth(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findById(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        Recruitment recruitment = recruitmentRepository.findById(round.getRecruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());
        return round;
    }
```

(import 추가: `InterviewRound`·`InterviewRoundMember`·`RoundMemberStatus`·`RoundStatus`·`InterviewAvailabilityRequestedEvent`·`AvailabilityRequestResponse`·`InterviewSlotRepository`·`ApplicationEventPublisher`·`Clock` — 기존 import 와 병합)

- [ ] **Step 5: Api + Controller**

`LeaderInterviewRoundApi` 에 추가:

```java
    @Operation(
            summary = "면접 라운드 발송 (Availability 요청)",
            description = "준비 중(DRAFT) 라운드를 응답 수집(COLLECTING) 상태로 전환하고 초대된 전원에게 가능 시간 선택 알림을 보낸다 — wizard Step4. "
                    + "가드: 슬롯 1개 이상 + 초대 상태 대상자 1명 이상 + 마감 시각 설정(미래). 충족하지 못하면 409/400. "
                    + "이미 발송됐거나 취소된 라운드는 409."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/request-availability")
    ResponseEntity<ApiResponse<AvailabilityRequestResponse>> requestAvailability(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 재알림",
            description = "응답 수집 중(COLLECTING) 라운드의 미응답 대상자에게 새 회차로 알림을 재발송한다. "
                    + "마감 경과 여부와 무관하게 가능하다. 미응답 대상자가 없으면 409."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/remind")
    ResponseEntity<ApiResponse<AvailabilityRequestResponse>> remind(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`LeaderInterviewRoundController` 에 추가:

```java
    @Override
    public ResponseEntity<ApiResponse<AvailabilityRequestResponse>> requestAvailability(
            @PathVariable Long roundId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                interviewRoundService.requestAvailability(roundId, currentUser.id())));
    }

    @Override
    public ResponseEntity<ApiResponse<AvailabilityRequestResponse>> remind(
            @PathVariable Long roundId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                interviewRoundService.remind(roundId, currentUser.id())));
    }
```

- [ ] **Step 6: GREEN 확인** — 13건 PASS

---

### Task 5: 전체 검증 + 커밋

- [ ] **Step 1:** `./gradlew test` → BUILD SUCCESSFUL (724 + 4 + 13 = 741건 예상)

- [ ] **Step 2:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 면접 라운드 발송·재알림 API"
```

---

### Task 6: self-check + PR 생성

- [ ] **Step 1: self-check 7항목** (BE#0~4 동일 명령 — EOF 검사 포함)

- [ ] **Step 2: push + PR** (자동 머지 금지)

```bash
git push -u origin feat/interview-availability-request
gh pr create --base develop --title "feat(backend): 면접 라운드 발송·재알림 API" --body "$(cat <<'EOF'
## 🚀 작업 내용

wizard 의 마지막 단계 — 발송입니다. 준비 중(DRAFT)이던 라운드가 응답 수집(COLLECTING) 상태로 전환되면서 초대된 지원자 전원에게 "면접 가능 시간을 선택해주세요" 알림이 나갑니다. 발송은 슬롯이 하나라도 있고, 대상자가 있고, 마감 시각이 미래로 설정돼 있어야만 가능합니다 — 설계 문서의 wizard 발송 버튼 활성화 조건과 서버 가드가 1:1 로 맞물립니다.

미응답자만 골라 새 회차로 다시 알리는 재알림도 함께 들어갑니다. 직전 PR 이 깔아둔 알림 인프라(회차 기반 중복 방지 키)를 그대로 소비하므로 이 PR 자체는 작습니다 — 라운드의 첫 상태 전이 도메인 메서드(openCollecting)가 핵심이고, 마감 검증은 생성 시점에 통과했더라도 발송 시점에 재검증합니다.

## 🤔 고민했던 내용

- 재알림을 마감 이후에도 허용했습니다 — 마감 후 미응답자 처리 옵션(개별 배정/제외/마감 연장/재알림) 중 하나라서요. "마감 연장이 먼저"라는 흐름 유도는 프론트 가이드 영역으로 남겼습니다.
- 동시 발송 두 건은 라운드 낙관적 락과 직전 PR 의 전역 409 핸들러 조합으로 한쪽만 성공합니다 — 이 PR 에서 새로 추가한 동시성 장치는 없습니다.
- 발송 시점에 멤버가 전부 INVITED 인 것이 정상이지만, 알림 대상은 방어적으로 INVITED 필터를 거칩니다.

## 💬 리뷰 중점사항

- openCollecting 의 검증 순서(상태→마감 존재→마감 미래)와 도메인/서비스 가드 분담(슬롯·멤버 카운트는 서비스)이 적절한지.
- 발송과 재알림이 같은 알림 경로(notifyAvailabilityRequest)를 공유하는 구조가 맞는지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §5.1·§8·§9.1 API 5·6·§10.3
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §9.1 API 5(가드 3종·전이·전원 알림·sequence++) → Task 4 + 테스트 1~9, API 6(COLLECTING 한정·INVITED 대상·sequence++) → 테스트 10~13, §5.1 전이 → openCollecting TDD 4건, §8(발동 직전 ++·dedupKey 회차 분리) → notifyAvailabilityRequest + 테스트 1·10 (q=1/q=2 검증), §10.3 가드 1:1 → Api javadoc.
- **플레이스홀더**: 없음.
- **타입 일관성**: `AvailabilityRequestResponse(notifiedMemberCount)` 가 서비스/Api/테스트에서 일치, `openCollecting(LocalDateTime)` 시그니처 일치, dedupKey 헬퍼 형식이 BE#4 리스너와 동일.
- **주의 메모**: 테스트 10 의 `requestSequence=1` 셋업은 발송을 거친 라운드 상태 모사 — 재알림이 q=2 를 만드는지 검증하기 위함. `saveRoundWithStatus` 재저장 시 @Version 더티 주의 — ReflectionTestUtils 후 save 한 번만.

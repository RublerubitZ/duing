# BE#12 — 라운드 취소·수정 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 6 은 리뷰 후 컨트롤러가 수행한다.**

**Goal:** 라운드 취소(`POST /leader/interview-rounds/{roundId}/cancel` — CANCELLED 전이 + §16-2 활성 schedule 전부 정리 + 멤버 자동 재큐잉)와 수정(`PATCH /leader/interview-rounds/{roundId}` — title/location/deadline 부분 수정) (스펙 §9.1 API 7·12·§16-2) — **인터뷰 재설계 백엔드의 마지막 PR**.

**Architecture:** 취소는 round 도메인 전이 `cancel()`(DRAFT·COLLECTING·ASSIGNING→CANCELLED) + `softDeleteByRoundId`(BE#9 메서드 재사용 — §16-2: 누락 시 취소된 라운드의 draft 배정이 새 라운드 배정과 병존해 Optional reader 들이 `NonUniqueResult` 로 깨진다). **멤버는 건드리지 않는다** — `isActiveForPlacement` 술어가 CANCELLED 라운드를 제외하므로 전이 없이 자동 큐 복귀하고, 이력 쿼리(§9.3)가 CANCELLED 멤버십을 "참여 이력"으로 집계해 지원자는 WAITING_NEXT_ROUND 로 보인다. 알림 없음 — §8 "INTERVIEW_CANCELLED 타입·리스너 보존하되 MVP 발행 경로 없음". 수정은 부분 PATCH (null = 무변경): title/location 은 DRAFT·COLLECTING·ASSIGNING, deadline 은 DRAFT(미래 자유)·COLLECTING(연장만).

**Tech Stack:** Spring Boot 3.4 / Java 21 / RestAssured + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.1(전이)·§8(알림 없음)·§9.1 API 7·12·§16-2·§16-7-4
**리뷰 정책:** duing-code-reviewer + codex 기본 (BE#12 는 adversarial 필수 목록 아님 — 단 §16-2 데이터 무결성이 있으므로 리뷰 프롬프트에 명시)

---

## 핵심 결정

1. **취소 시 멤버 무변경 — 근거**: EXCLUDED 일괄 전이는 불필요·유해하다. placement 복귀는 술어(`round ≠ CANCELLED`)가, 이력 집계는 §9.3 쿼리(CANCELLED 라운드 멤버십 ∨ 비DRAFT EXCLUDED)가 이미 처리한다 — 멤버를 EXCLUDED 로 바꾸면 "취소"와 "개별 제외"의 운영 기록이 구분 불가능해진다.
2. **deadline 정책 — §9.1 API 7 문언("연장은 DRAFT·COLLECTING 에서만") 해석**: DRAFT 는 발송 전이라 미래 시각이면 자유 변경(발송 가드가 재검증), COLLECTING 은 **연장만**(기존보다 뒤 + 미래) — 단축은 응답 중인 지원자의 기회를 소급 박탈하고 미응답 파생을 즉시 뒤집으므로 금지. ASSIGNING 이후 deadline 변경은 무의미(수집 종료) — 400.
3. **title/location 은 ASSIGNING 까지 허용** — 배정 검토 중 면접 장소를 확정 입력하고 confirm 하는 것이 주 시나리오(확정 알림 후 지원자 화면이 location 표시). SCHEDULED·CANCELLED 는 불변(§14 확정 후 변경 없음).
4. **PATCH 의미론**: null 필드 = 무변경. 세 필드 전부 null → 400 `InvalidRoundUpdate`(무의미 요청 조기 거부). title 이 오면 trim 후 blank → 400 동일 예외. location 비우기(null 화)는 MVP 미지원 — 무변경 처리.
5. **잠금**: 두 경로 모두 round `findByIdForUpdate` (§16-7-4 — 자동배정/확정과 직렬화: 취소 vs 확정 race 는 round 잠금이 결정적으로 한쪽을 409 시킨다). 멤버·슬롯 잠금 불요(안 씀). deadline 연장 vs 응답(round 비잠금)의 race 는 연장이 응답 기회를 **넓히는** 방향뿐이라 무해 (단축 금지가 이를 보장 — 결정 2 의 동시성 근거).
6. **취소·수정 모두 204** (액션·dashboard invalidate 패턴). 신규 예외 1종(`InvalidRoundUpdate` 400) — 전이 위반은 `RoundTransitionNotAllowed`(409)·deadline 위반은 `InvalidDeadline`(400) 재사용.
7. **서비스 배치**: 라운드 생애주기 소속 — `InterviewRoundService`/`GeneralInterviewRoundService` 에 `updateRound`/`cancelRound` 추가 (배정 계열 아님).
8. 도메인 메서드 3개: `cancel()` / `updateInfo(title, location)` (phase 가드 포함, null 무변경) / `updateDeadline(newDeadline, now)` (phase·연장 검증). 모두 TDD.

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Modify | `entity/InterviewRound.java` + `entity/InterviewRoundDomainTest.java` | `cancel()`·`updateInfo()`·`updateDeadline()` TDD 7건 |
| Modify | `exception/InterviewException.java` | `InvalidRoundUpdate`(400) |
| Create | `controller/dto/request/UpdateInterviewRoundRequest.java` | 부분 수정 + toCommand |
| Create | `service/dto/command/UpdateInterviewRoundCommand.java` | 커맨드 |
| Modify | `service/InterviewRoundService.java` + `GeneralInterviewRoundService.java` | `updateRound`/`cancelRound` |
| Modify | `api/LeaderInterviewRoundApi.java` + `controller/LeaderInterviewRoundController.java` | PATCH·POST cancel (204) |
| Test Create | `controller/LeaderInterviewRoundManageControllerTest.java` | RestAssured 13건 |

신규 레포 메서드 0건 (`findByIdForUpdate`·`softDeleteByRoundId` 재사용). 커밋 2개: ① 도메인 TDD ② 취소·수정 API.

---

### Task 1: 브랜치 생성

- [ ] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-round-manage
```

---

### Task 2: 도메인 전이·수정 3종 (TDD)

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/interview/entity/InterviewRoundDomainTest.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/entity/InterviewRound.java`

- [ ] **Step 1: 단위 테스트 7건 추가 (RED)**

```java
    @Test
    @DisplayName("발송 전·응답 수집·배정 검토 라운드는 취소할 수 있다")
    void nonTerminalRoundsCancel() {
        InterviewRound draft = InterviewRound.create(1L, "1차", LocalDateTime.now().plusDays(7), null);
        InterviewRound collecting = InterviewRound.create(1L, "1차", LocalDateTime.now().plusDays(7), null);
        collecting.openCollecting(LocalDateTime.now());
        InterviewRound assigning = InterviewRound.create(1L, "1차", LocalDateTime.now().plusDays(7), null);
        assigning.openCollecting(LocalDateTime.now());
        assigning.openAssigning();

        draft.cancel();
        collecting.cancel();
        assigning.cancel();

        assertThat(draft.getStatus()).isEqualTo(RoundStatus.CANCELLED);
        assertThat(collecting.getStatus()).isEqualTo(RoundStatus.CANCELLED);
        assertThat(assigning.getStatus()).isEqualTo(RoundStatus.CANCELLED);
    }

    @Test
    @DisplayName("확정된 라운드는 터미널이라 취소할 수 없고, 취소된 라운드는 다시 취소할 수 없다")
    void terminalRoundsCannotCancel() {
        InterviewRound scheduled = InterviewRound.create(1L, "1차", LocalDateTime.now().plusDays(7), null);
        scheduled.openCollecting(LocalDateTime.now());
        scheduled.openAssigning();
        scheduled.confirm(LocalDateTime.now());
        InterviewRound cancelled = InterviewRound.create(1L, "1차", LocalDateTime.now().plusDays(7), null);
        cancelled.cancel();

        assertThatThrownBy(scheduled::cancel)
                .isInstanceOf(InterviewException.RoundTransitionNotAllowed.class);
        assertThatThrownBy(cancelled::cancel)
                .isInstanceOf(InterviewException.RoundTransitionNotAllowed.class);
    }

    @Test
    @DisplayName("배정 검토 중에도 라운드 제목과 장소를 수정할 수 있다")
    void infoUpdatesUntilAssigning() {
        InterviewRound round = InterviewRound.create(1L, "1차", LocalDateTime.now().plusDays(7), null);
        round.openCollecting(LocalDateTime.now());
        round.openAssigning();

        round.updateInfo("1차 대면 면접", "본관 201호");

        assertThat(round.getTitle()).isEqualTo("1차 대면 면접");
        assertThat(round.getLocation()).isEqualTo("본관 201호");
    }

    @Test
    @DisplayName("수정에서 비운 필드는 기존 값이 유지되고, 확정된 라운드는 수정할 수 없다")
    void partialUpdateAndTerminalGuard() {
        InterviewRound round = InterviewRound.create(1L, "1차", LocalDateTime.now().plusDays(7), "구관 101호");
        round.updateInfo("1차 대면 면접", null);
        assertThat(round.getTitle()).isEqualTo("1차 대면 면접");
        assertThat(round.getLocation()).isEqualTo("구관 101호");

        InterviewRound scheduled = InterviewRound.create(1L, "1차", LocalDateTime.now().plusDays(7), null);
        scheduled.openCollecting(LocalDateTime.now());
        scheduled.openAssigning();
        scheduled.confirm(LocalDateTime.now());
        assertThatThrownBy(() -> scheduled.updateInfo("변경", null))
                .isInstanceOf(InterviewException.RoundTransitionNotAllowed.class);
    }

    @Test
    @DisplayName("발송 전 라운드의 마감은 미래 시각이면 자유롭게 바꿀 수 있다")
    void draftDeadlineChangesFreely() {
        InterviewRound round = InterviewRound.create(1L, "1차", LocalDateTime.now().plusDays(7), null);
        LocalDateTime earlier = LocalDateTime.now().plusDays(2);

        round.updateDeadline(earlier, LocalDateTime.now());

        assertThat(round.getAvailabilityDeadline()).isEqualTo(earlier);
    }

    @Test
    @DisplayName("응답 수집 중 마감은 연장만 가능하다 — 단축은 응답 기회를 소급 박탈한다")
    void collectingDeadlineOnlyExtends() {
        LocalDateTime original = LocalDateTime.now().plusDays(3);
        InterviewRound round = InterviewRound.create(1L, "1차", original, null);
        round.openCollecting(LocalDateTime.now());

        LocalDateTime extended = original.plusDays(2);
        round.updateDeadline(extended, LocalDateTime.now());
        assertThat(round.getAvailabilityDeadline()).isEqualTo(extended);

        assertThatThrownBy(() -> round.updateDeadline(original, LocalDateTime.now()))
                .isInstanceOf(InterviewException.InvalidDeadline.class);
    }

    @Test
    @DisplayName("배정 검토 단계부터는 마감을 변경할 수 없다 — 수집이 끝난 마감은 의미가 없다")
    void deadlineFrozenFromAssigning() {
        InterviewRound round = InterviewRound.create(1L, "1차", LocalDateTime.now().plusDays(3), null);
        round.openCollecting(LocalDateTime.now());
        round.openAssigning();

        assertThatThrownBy(() -> round.updateDeadline(LocalDateTime.now().plusDays(9), LocalDateTime.now()))
                .isInstanceOf(InterviewException.RoundTransitionNotAllowed.class);
    }
```

- [ ] **Step 2: RED 확인** — 컴파일 실패

- [ ] **Step 3: 구현 (GREEN)** — `InterviewRound` 의 `confirm` 아래에:

```java
    /**
     * 취소: DRAFT·COLLECTING·ASSIGNING → CANCELLED (스펙 §5.1·§9.1 API 12). 멤버는 건드리지
     * 않는다 — placement 술어(round ≠ CANCELLED)가 자동 큐 복귀를, 이력 쿼리가 WAITING_NEXT_ROUND
     * 표시를 처리한다. 활성 schedule 정리(§16-2)는 서비스 담당.
     */
    public void cancel() {
        if (this.status == RoundStatus.SCHEDULED || this.status == RoundStatus.CANCELLED) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        this.status = RoundStatus.CANCELLED;
    }

    /**
     * 제목·장소 부분 수정 (null = 무변경) — ASSIGNING 까지 허용: 배정 검토 중 장소 확정 입력 후
     * confirm 이 주 시나리오다. SCHEDULED·CANCELLED 는 불변 (§14 확정 후 변경 없음).
     */
    public void updateInfo(String title, String location) {
        if (this.status == RoundStatus.SCHEDULED || this.status == RoundStatus.CANCELLED) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        if (title != null) {
            this.title = title;
        }
        if (location != null) {
            this.location = location;
        }
    }

    /**
     * 마감 변경 (스펙 §9.1 API 7) — DRAFT 는 미래 시각이면 자유, COLLECTING 은 연장만(기존보다
     * 뒤 + 미래): 단축은 응답 중인 지원자의 기회를 소급 박탈하고 미응답 파생을 즉시 뒤집는다.
     * 이 "연장만" 제약이 응답 API(round 비잠금)와의 race 를 무해하게 만든다 — 변경은 기회를
     * 넓히는 방향뿐이다. ASSIGNING 부터는 수집이 끝나 변경이 무의미하다.
     */
    public void updateDeadline(LocalDateTime newDeadline, LocalDateTime now) {
        if (this.status == RoundStatus.DRAFT) {
            if (!newDeadline.isAfter(now)) {
                throw new InterviewException.InvalidDeadline();
            }
        } else if (this.status == RoundStatus.COLLECTING) {
            if (this.availabilityDeadline != null && !newDeadline.isAfter(this.availabilityDeadline)) {
                throw new InterviewException.InvalidDeadline();
            }
            if (!newDeadline.isAfter(now)) {
                throw new InterviewException.InvalidDeadline();
            }
        } else {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        this.availabilityDeadline = newDeadline;
    }
```

- [ ] **Step 4: GREEN 확인** — 도메인 28건(기존 21+신규 7) PASS

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 라운드 취소·정보 수정·마감 변경 도메인 메서드 추가"
```

---

### Task 3: 통합 테스트 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/LeaderInterviewRoundManageControllerTest.java`

- [ ] **Step 1: 테스트 작성** (`InterviewControllerTestSupport` 상속)

```java
package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
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
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
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

// 라운드 취소(§16-2 schedule 정리 + 멤버 자동 재큐잉)와 부분 수정(title/location/deadline —
// phase 별 허용 범위). 취소 알림은 없다 (§8 — INTERVIEW_CANCELLED 발행 경로 없음).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewRoundManageControllerTest extends InterviewControllerTestSupport {

    private static final String ROUND_PATH = "/api/v1/leader/interview-rounds/{roundId}";
    private static final String CANCEL_PATH = "/api/v1/leader/interview-rounds/{roundId}/cancel";
    private static final String CANDIDATES_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-round-candidates";
    private static final String VIEW_PATH = "/api/v1/applications/{applicationId}/interview";

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
        Club club = saveActiveClub("관리동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "관리모집");
    }

    // ── 취소 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("배정 검토 중 라운드를 취소하면 draft 배정이 정리되고 멤버들이 후보 대기열로 복귀한다")
    void cancelCleansSchedulesAndRequeuesMembers() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusHours(1));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        Application application = saveInterviewPendingApplication(recruitment, "복귀자");
        saveMember(round, application, RoundMemberStatus.RESPONDED);
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), round.getId(), LocalDateTime.now()));

        givenLeader()
                .when().post(CANCEL_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.CANCELLED);
        // §16-2 — 취소된 라운드의 draft 배정이 잔존하면 새 라운드 배정과 병존해 reader 가 깨진다.
        assertThat(interviewScheduleRepository.findByRoundIdAndStatus(
                round.getId(), InterviewScheduleStatus.ASSIGNED)).isEmpty();
        // 멤버는 전이 없이 자동 재큐잉 — placement 술어가 CANCELLED 라운드를 제외한다.
        givenLeader()
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.applicationId", hasItem(application.getId().intValue()));
        // 지원자에겐 참여 이력으로 집계되어 다음 회차 대기로 보인다.
        givenApplicant(application)
                .when().get(VIEW_PATH, application.getId())
                .then().body("data.phase", equalTo("WAITING_NEXT_ROUND"));
    }

    @Test
    @DisplayName("발송 전·응답 수집 중 라운드도 취소할 수 있다")
    void draftAndCollectingRoundsCancel() {
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        InterviewRound collectingRound = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));

        givenLeader().when().post(CANCEL_PATH, draftRound.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        givenLeader().when().post(CANCEL_PATH, collectingRound.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("확정된 라운드는 취소할 수 없고, 취소된 라운드는 다시 취소할 수 없다")
    void terminalRoundsCannotCancel() {
        InterviewRound scheduled = saveRound(RoundStatus.SCHEDULED, LocalDateTime.now().minusDays(1));
        InterviewRound cancelled = saveRound(RoundStatus.CANCELLED, LocalDateTime.now().minusDays(1));

        givenLeader().when().post(CANCEL_PATH, scheduled.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
        givenLeader().when().post(CANCEL_PATH, cancelled.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("취소된 라운드의 자리에 같은 모집의 새 라운드를 만들 수 있다")
    void newRoundAfterCancel() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        Application application = saveInterviewPendingApplication(recruitment, "재선정자");
        saveMember(round, application, RoundMemberStatus.INVITED);
        givenLeader().when().post(CANCEL_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "재시도 면접",
                        "availabilityDeadline", LocalDateTime.now().plusDays(5)
                                .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                        "applicationIds", java.util.List.of(application.getId())))
                .when().post("/api/v1/leader/recruitments/{recruitmentId}/interview-rounds",
                        recruitment.getId())
                .then().statusCode(HttpStatus.CREATED.value());
    }

    // ── 수정 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("발송 전 라운드의 제목·장소·마감을 한 번에 수정할 수 있다")
    void draftRoundUpdatesAllFields() {
        InterviewRound round = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        LocalDateTime newDeadline = LocalDateTime.parse("2026-06-25T23:59:00");

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 대면 면접", "location", "본관 201호",
                        "availabilityDeadline", "2026-06-25T23:59:00"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        InterviewRound updated = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(updated.getTitle()).isEqualTo("1차 대면 면접");
        assertThat(updated.getLocation()).isEqualTo("본관 201호");
        assertThat(updated.getAvailabilityDeadline()).isEqualTo(newDeadline);
    }

    @Test
    @DisplayName("일부 필드만 보내면 나머지는 바뀌지 않는다")
    void partialUpdateKeepsOtherFields() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        String originalTitle = round.getTitle();

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("location", "신관 302호"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        InterviewRound updated = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(updated.getLocation()).isEqualTo("신관 302호");
        assertThat(updated.getTitle()).isEqualTo(originalTitle);
    }

    @Test
    @DisplayName("응답 수집 중 마감을 연장하면 지원자 화면에도 새 마감이 보인다")
    void collectingDeadlineExtensionReflectsToApplicant() {
        LocalDateTime original = LocalDateTime.parse("2026-06-18T23:59:00");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, original);
        Application application = saveInterviewPendingApplication(recruitment, "연장수혜자");
        saveMember(round, application, RoundMemberStatus.INVITED);
        saveSlot(round, "2026-06-20T14:00:00");

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", "2026-06-21T23:59:00"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        givenApplicant(application)
                .when().get(VIEW_PATH, application.getId())
                .then().body("data.phase", equalTo("AVAILABILITY_REQUESTED"))
                .body("data.availabilityDeadline", equalTo("2026-06-21T23:59:00"));
    }

    @Test
    @DisplayName("응답 수집 중 마감 단축은 거부된다 — 응답 기회의 소급 박탈")
    void collectingDeadlineShorteningIsRejected() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.parse("2026-06-21T23:59:00"));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", "2026-06-18T23:59:00"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("배정 검토 중에는 장소 수정은 되지만 마감 변경은 거부된다")
    void assigningAllowsInfoButFreezesDeadline() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusHours(1));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("location", "본관 201호"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", "2026-06-30T23:59:00"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("확정된 라운드는 수정할 수 없다")
    void scheduledRoundRejectsUpdate() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED, LocalDateTime.now().minusDays(1));

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("title", "변경 시도"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("빈 제목이나 아무 필드도 없는 수정 요청은 거부된다")
    void blankTitleAndEmptyUpdateAreRejected() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));

        Map<String, Object> blankTitle = new HashMap<>();
        blankTitle.put("title", "   ");
        givenLeader()
                .contentType(ContentType.JSON)
                .body(blankTitle)
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of())
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 라운드는 404, 타 동아리 운영진은 403 을 받는다")
    void notFoundAndForbiddenGuards() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        User outsider = saveUser("타인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        givenLeader().when().post(CANCEL_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "남의 라운드"))
                .when().patch(ROUND_PATH, round.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
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

    private InterviewRound saveRound(RoundStatus status, LocalDateTime deadline) {
        return interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), deadline, null, status));
    }

    private InterviewSlot saveSlot(InterviewRound round, String start) {
        LocalDateTime startTime = LocalDateTime.parse(start);
        return interviewSlotRepository.save(InterviewSlot.create(
                round.getId(), startTime, startTime.plusMinutes(30), 1));
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
```

- [ ] **Step 2: RED 확인** — 컴파일 성공 + 대부분 FAIL. **커밋하지 않는다.**

---

### Task 4: 구현 (GREEN)

- [ ] **Step 1: 예외 + DTO**

`InterviewException` 400 섹션에:

```java
    public static final class InvalidRoundUpdate extends InterviewException {
        private static final String MESSAGE = "수정할 내용이 유효하지 않습니다.";
        public InvalidRoundUpdate() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
```

`service/dto/command/UpdateInterviewRoundCommand.java`:

```java
package com.duing.domain.interview.service.dto.command;

import java.time.LocalDateTime;

public record UpdateInterviewRoundCommand(
        Long roundId,
        Long currentUserId,
        String title,
        String location,
        LocalDateTime availabilityDeadline
) {}
```

`controller/dto/request/UpdateInterviewRoundRequest.java` (기존 `CreateInterviewRoundRequest` 의 필드 검증 규칙 — `@Size` 한도 등 — 을 읽고 동일하게 적용):

```java
package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.UpdateInterviewRoundCommand;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record UpdateInterviewRoundRequest(
        // 전 필드 optional — null 은 무변경 (PATCH). 전부 null 이면 서비스가 400 으로 거부한다.
        @Size(max = 100, message = "라운드 제목은 100자 이하여야 합니다.")
        String title,
        @Size(max = 200, message = "면접 장소는 200자 이하여야 합니다.")
        String location,
        LocalDateTime availabilityDeadline
) {
    public UpdateInterviewRoundCommand toCommand(Long roundId, Long currentUserId) {
        return new UpdateInterviewRoundCommand(roundId, currentUserId, title, location, availabilityDeadline);
    }
}
```

- [ ] **Step 2: 서비스**

`InterviewRoundService` 에 추가:

```java
    /**
     * 라운드 부분 수정 (스펙 §9.1 API 7) — null 필드는 무변경. title/location 은 ASSIGNING 까지,
     * deadline 은 DRAFT(미래 자유)·COLLECTING(연장만).
     */
    void updateRound(UpdateInterviewRoundCommand updateCommand);

    /**
     * 라운드 취소 (스펙 §9.1 API 12·§16-2) — CANCELLED 전이 + 활성 schedule 전부 정리.
     * 멤버는 전이 없이 자동 재큐잉, 알림 없음 (§8).
     */
    void cancelRound(Long roundId, Long currentUserId);
```

`GeneralInterviewRoundService` 에 구현 (의존 추가: `InterviewScheduleRepository` — cancel 의 §16-2 정리용. import `UpdateInterviewRoundCommand` 추가):

```java
    @Override
    @Transactional
    public void updateRound(UpdateInterviewRoundCommand updateCommand) {
        boolean nothingToUpdate = updateCommand.title() == null
                && updateCommand.location() == null
                && updateCommand.availabilityDeadline() == null;
        boolean blankTitle = updateCommand.title() != null && updateCommand.title().trim().isEmpty();
        if (nothingToUpdate || blankTitle) {
            throw new InterviewException.InvalidRoundUpdate();
        }

        // §16-7-4 — round writer 직렬화 (자동배정·확정·취소와 동일 잠금).
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(updateCommand.roundId())
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, updateCommand.currentUserId());

        if (updateCommand.title() != null || updateCommand.location() != null) {
            round.updateInfo(
                    updateCommand.title() == null ? null : updateCommand.title().trim(),
                    updateCommand.location());
        }
        if (updateCommand.availabilityDeadline() != null) {
            round.updateDeadline(updateCommand.availabilityDeadline(), LocalDateTime.now(clock));
        }
    }

    @Override
    @Transactional
    public void cancelRound(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);

        round.cancel();
        // §16-2 — 누락 시 취소된 라운드의 draft 배정이 새 라운드 배정과 병존해
        // findByApplicationId 류 Optional reader 가 NonUniqueResult 로 깨진다.
        interviewScheduleRepository.softDeleteByRoundId(roundId);
    }
```

(※ `GeneralInterviewRoundService` 에 `interviewRoundAccessor`·`clock` 이 기존 주입돼 있는지 확인 — BE#9 refactor 로 accessor 사용 중, clock 은 BE#5 부터. `softDeleteByRoundId` 는 plain @Modifying(BE#9) — 이 TX 의 round dirty 변경(cancel)은 JPQL 실행 전 auto-flush 대상이 아니어도 커밋 시 flush 되므로 무관하나, **round.cancel() 을 softDelete 보다 먼저** 호출하는 현재 순서가 안전하다 — BE#9 주석 참조.)

- [ ] **Step 3: Api + Controller**

`LeaderInterviewRoundApi` 에 추가 (import `UpdateInterviewRoundRequest`·`PatchMapping`·`Valid`·`RequestBody`):

```java
    @Operation(
            summary = "면접 라운드 수정",
            description = "제목·장소·마감을 부분 수정한다 (보내지 않은 필드는 유지). 제목·장소는 배정 검토 단계까지, "
                    + "마감은 발송 전(미래 시각 자유)·응답 수집 중(연장만) 변경할 수 있다. 확정·취소된 라운드는 수정 불가."
    )
    @PatchMapping("/leader/interview-rounds/{roundId}")
    ResponseEntity<ApiResponse<Void>> updateRound(
            @PathVariable Long roundId,
            @Valid @RequestBody UpdateInterviewRoundRequest updateInterviewRoundRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 취소",
            description = "라운드를 취소한다 (발송 전·응답 수집·배정 검토 단계). draft 배정이 정리되고 멤버 지원서는 "
                    + "면접 대상 상태 그대로 후보 대기열로 복귀한다 — 새 라운드에서 재선정하면 된다. "
                    + "확정된 라운드는 터미널이라 취소할 수 없다. 취소 알림은 발송되지 않는다."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/cancel")
    ResponseEntity<ApiResponse<Void>> cancelRound(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`LeaderInterviewRoundController` 에 구현:

```java
    @Override
    public ResponseEntity<ApiResponse<Void>> updateRound(
            @PathVariable Long roundId,
            @Valid @RequestBody UpdateInterviewRoundRequest updateInterviewRoundRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewRoundService.updateRound(
                updateInterviewRoundRequest.toCommand(roundId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> cancelRound(
            @PathVariable Long roundId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewRoundService.cancelRound(roundId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
```

- [ ] **Step 4: GREEN 확인** — 12건 PASS

---

### Task 5: 전체 검증 + 커밋

- [ ] **Step 1:** `./gradlew test` → BUILD SUCCESSFUL (853 + 7 + 12 = 872건 예상)

- [ ] **Step 2:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 면접 라운드 취소·수정 API"
```

---

### Task 6: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [ ] **Step 1: self-check 7항목** (기존 동일 명령)

- [ ] **Step 2: push + PR** (자동 머지 금지)

```bash
git push -u origin feat/interview-round-manage
gh pr create --base develop --title "feat(backend): 면접 라운드 취소·수정 API" --body "$(cat <<'EOF'
## 🚀 작업 내용

인터뷰 재설계 백엔드의 마지막 PR 입니다. 취소는 진행 중인 라운드(발송 전·응답 수집·배정 검토)를 접는 경로로 — draft 배정이 함께 정리되고(설계 문서 §16-2: 누락 시 취소된 라운드의 배정이 새 라운드 배정과 병존해 조회가 깨집니다), 멤버 지원서는 면접 대상 상태 그대로 후보 대기열로 복귀합니다. 멤버 상태는 일부러 건드리지 않습니다 — 배치 가능 술어가 취소된 라운드를 이미 제외하고, 지원자에게는 참여 이력으로 집계되어 "다음 회차 대기"로 보입니다. 제외와 취소의 운영 기록도 구분됩니다.

수정은 부분 PATCH 입니다(보내지 않은 필드 유지). 제목·장소는 배정 검토 단계까지 — 배정을 보면서 장소를 확정 입력하고 confirm 하는 것이 주 시나리오라서요. 마감은 발송 전엔 미래 시각으로 자유, 응답 수집 중엔 연장만 가능합니다.

직전 PR 이 짚었던 릴리스 시퀀싱 갭(전원 미응답 라운드를 종결할 방법이 없던 문제)이 이 PR 의 취소로 닫힙니다.

## 🤔 고민했던 내용

- 수집 중 마감 단축을 금지한 건 UX 만의 문제가 아닙니다 — 응답 API 가 라운드를 잠그지 않으므로, 마감 변경이 "기회를 넓히는 방향"뿐이어야 마감 검사와의 race 가 무해해집니다. 단축 금지가 곧 동시성 안전장치입니다.
- 취소 알림은 보내지 않습니다 — 설계 문서 §8 이 INTERVIEW_CANCELLED 발행 경로를 MVP 에서 제외했고(타입은 보존), 지원자 화면은 단계 변화로 자연 반영됩니다.
- 취소·수정 모두 라운드 행 잠금으로 자동배정·확정과 직렬화됩니다 — 확정과 취소가 동시에 오면 한쪽이 결정적으로 409 를 받습니다.
- 취소 후 같은 모집에 새 라운드를 만들어 같은 지원자를 재선정하는 흐름을 cross-API 테스트로 고정했습니다.

## 💬 리뷰 중점사항

- 취소의 §16-2 정리(활성 schedule soft delete)와 멤버 무변경 결정이 placement·이력 술어와 맞물리는지.
- 마감 정책(DRAFT 자유 / COLLECTING 연장만 / ASSIGNING 동결)의 phase 경계.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §5.1·§8·§9.1 API 7·12·§16-2·§16-7-4
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: API 12(취소 — DRAFT·COLLECTING·ASSIGNING 한정·멤버 재큐잉·application 롤백 없음) → cancel + 테스트 1·2·3, §16-2(schedule 정리) → softDeleteByRoundId + 테스트 1 단언, API 7(title/location/deadline·연장은 DRAFT·COLLECTING) → updateInfo/updateDeadline + 테스트 5~10, §8(취소 알림 없음) → 발행 코드 없음 + 헤더 주석, §16-7-4(round 잠금) → 두 경로 findByIdForUpdate.
- **플레이스홀더**: 없음.
- **타입 일관성**: `cancel()`/`updateInfo(String, String)`/`updateDeadline(LocalDateTime, LocalDateTime)` 시그니처가 도메인 테스트·서비스 호출부와 일치, `UpdateInterviewRoundCommand` 5필드 ↔ request toCommand 일치, `softDeleteByRoundId`(BE#9)·`findByIdForUpdate`(BE#9)·`findByRoundIdAndStatus`(BE#6) 기존재.
- **주의 메모**: ① 테스트 4(취소 후 재선정)의 createRound body 는 BE#11 E2E 가 검증한 실계약 그대로. ② 테스트 7 의 `data.availabilityDeadline` 직렬화 형식은 BE#7 응답 — 실제 형식이 다르면 단언만 보정. ③ `GeneralInterviewRoundService` 에 `InterviewScheduleRepository` 의존이 없으면 필드 추가 (BE#6 에서 추가됐을 수 있음 — 확인). ④ blank-title 테스트의 `HashMap` 사용은 `Map.of` 가 공백 값을 허용해도 명시성 위해 — 그대로 적용.

# BE#6 — 라운드 목록/상세 Dashboard API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 6 은 리뷰 후 컨트롤러가 수행한다.**

**Goal:** 라운드 목록(`GET /leader/recruitments/{recruitmentId}/interview-rounds` — 멤버 카운트 요약)과 상세 dashboard(`GET /leader/interview-rounds/{roundId}` — 카운트 카드·멤버 테이블·파생 미응답·슬롯별 선택/배정 수)를 구현하고, BE#4 슬롯 서비스의 controller DTO 역의존을 정리한다.

**Architecture:** 읽기 전용 PR. 상세는 5개 배치 쿼리(멤버 라인 projection / 멤버별 선택 수 groupBy / 슬롯 목록 / 슬롯별 선택 수 groupBy / 활성 schedule)를 서비스가 조립 — N+1 없음. **미응답은 저장하지 않고 서버가 파생**(`INVITED && now > deadline`, 스펙 §5.3)해 `members[].unresponded` 와 `counts.unrespondedCount` 로 내려준다. 운영진 dashboard 는 EXCLUDED 포함 raw 상태를 본다 (지원자 노출 술어와 무관).

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL(Projections.constructor·groupBy) / RestAssured + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.3(파생)·§9.1 API 3·§10.4(dashboard 구성)·§11
**리뷰 정책:** duing-code-reviewer + codex 기본

---

## 핵심 결정

1. **카운트 정의**: `totalMemberCount` = 비EXCLUDED 멤버 수(응답 가능 대상 N), `respondedMemberCount`(목록) = RESPONDED+NO_AVAILABLE_SLOT+ASSIGNED(응답 행위 완료 n — §10.5 "응답 대기 n/N"). 상세 counts 는 상태별 raw(invited/responded/noAvailableSlot/assigned/excluded) + 파생 `unrespondedCount`(마감 경과 시 invited 수, 아니면 0) + `deadlinePassed` 플래그.
2. **schedule 노출**: 활성(미삭제·ASSIGNED status) schedule 의 slotId 를 `members[].assignedSlotId` 와 `slots[].assignedCount` 로 — round 가 ASSIGNING(draft 검토)·SCHEDULED 일 때 §10.4 자동배정 검토 영역이 사용. 데이터가 없으면 null/0 (BE#9 전까지의 정상 상태).
3. **NO_AVAILABLE_SLOT 의 `alternativeAvailabilityText` 는 상세 멤버 라인에 그대로 노출** (§10.4 전용 섹션 데이터).
4. **BE#4 정리**: `InterviewSlotService.createSlots` 반환을 `service/dto/query/SlotsCreationResult` 로 교체, 컨트롤러가 `CreateInterviewSlotsResponse.from(result)` 변환 — BE#5 리뷰에서 합의된 계층 역전 해소(별도 refactor 커밋).
5. projection record 들은 `service/dto/query/` 에 배치 — QueryDSL `Projections.constructor` 대상.
6. 목록 가드는 BE#2 후보 조회와 동일(404→403→useInterview 400), 상세 가드는 `getRoundWithManagerAuth`(404→403).

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Create | `service/dto/query/SlotsCreationResult.java` | BE#4 정리 |
| Modify | `service/InterviewSlotService.java`+`GeneralInterviewSlotService.java`+`controller/dto/response/CreateInterviewSlotsResponse.java`+`controller/LeaderInterviewSlotController.java` | 반환 타입 교체 + from 변환 |
| Create | `service/dto/query/RoundSummaryQuery.java` / `RoundDetailQuery.java` / `RoundMemberLine.java` / `RoundMemberStatusCount.java` / `SlotSelectionCount.java` / `MemberSelectionCount.java` | 조회 DTO·projection |
| Modify | `repository/InterviewRoundRepository.java` | `findByRecruitmentIdOrderByCreatedAtDesc` |
| Modify | `repository/InterviewRoundMemberRepositoryCustom.java`+`Impl` | `findMemberLinesByRoundId`·`countMembersGroupedByStatus` |
| Modify | `repository/InterviewAvailabilityRepositoryCustom.java`+`Impl` | `countByRoundIdGroupedBySlot`·`countByRoundIdGroupedByApplication` |
| Modify | `repository/InterviewScheduleRepository.java` | `findByRoundId` |
| Modify | `repository/InterviewSlotRepository.java` | `findByRoundIdOrderByStartTimeAsc` |
| Modify | `service/InterviewRoundService.java`+`GeneralInterviewRoundService.java` | `getRounds`/`getRoundDetail` (+scheduleRepo·availabilityRepo·slotRepo 의존) |
| Create | `controller/dto/response/RoundSummaryResponse.java` / `RoundDetailResponse.java` | 응답 record |
| Modify | `api/LeaderInterviewRoundApi.java`+`controller/LeaderInterviewRoundController.java` | GET 2개 (200) |
| Test Create | `controller/LeaderInterviewRoundDashboardControllerTest.java` | RestAssured 13건 |

커밋 2개: ① refactor(BE#4 정리) ② feat(목록/상세).

---

### Task 1: 브랜치 생성

- [x] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-round-dashboard
```

---

### Task 2: BE#4 계층 정리 (refactor — 행동 무변경)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/interview/service/dto/query/SlotsCreationResult.java`
- Modify: `InterviewSlotService.java` / `GeneralInterviewSlotService.java` / `CreateInterviewSlotsResponse.java` / `LeaderInterviewSlotController.java`

- [x] **Step 1: query DTO 신설 + 반환 타입 교체**

`SlotsCreationResult.java`:

```java
package com.duing.domain.interview.service.dto.query;

import java.util.List;

public record SlotsCreationResult(List<Long> createdSlotIds, int reinvitedMemberCount) {}
```

`InterviewSlotService.createSlots`·`GeneralInterviewSlotService.createSlots` 반환 타입을 `CreateInterviewSlotsResponse` → `SlotsCreationResult` 로 교체 (`new SlotsCreationResult(...)` 생성, controller dto import 제거).

`CreateInterviewSlotsResponse.java` 전체 교체:

```java
package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.service.dto.query.SlotsCreationResult;
import java.util.List;

public record CreateInterviewSlotsResponse(List<Long> createdSlotIds, int reinvitedMemberCount) {
    public static CreateInterviewSlotsResponse from(SlotsCreationResult result) {
        return new CreateInterviewSlotsResponse(result.createdSlotIds(), result.reinvitedMemberCount());
    }
}
```

`LeaderInterviewSlotController.createSlots` 에서 `CreateInterviewSlotsResponse.from(...)` 변환.

- [x] **Step 2: 회귀 확인** — `./gradlew test --tests "com.duing.domain.interview.controller.LeaderInterviewSlotControllerTest"` → 18건 PASS (단언 무변경)

- [x] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "refactor(backend): 슬롯 생성 결과를 query DTO 로 분리 — 서비스의 controller DTO 역의존 해소"
```

---

### Task 3: 통합 테스트 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/LeaderInterviewRoundDashboardControllerTest.java`

- [x] **Step 1: 테스트 작성** (`InterviewControllerTestSupport` 상속)

```java
package com.duing.domain.interview.controller;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
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

// 라운드 목록(카운트 요약)과 상세 dashboard(카운트 카드·멤버 테이블·파생 미응답·슬롯 집계)를 검증한다.
// 미응답은 저장하지 않고 INVITED && now > deadline 로 파생한다 (스펙 §5.3·§9.1 API 3·§10.4).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewRoundDashboardControllerTest extends InterviewControllerTestSupport {

    private static final String LIST_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-rounds";
    private static final String DETAIL_PATH = "/api/v1/leader/interview-rounds/{roundId}";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("대시보드동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "대시보드모집");
    }

    // ── 목록 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("라운드 목록은 최신 생성 순으로 카운트 요약과 함께 반환된다")
    void roundListReturnsSummariesWithCounts() {
        InterviewRound older = saveRound(RoundStatus.SCHEDULED, LocalDateTime.now().minusDays(3));
        InterviewRound newer = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        Application respondedMember = saveInterviewPendingApplication(recruitment, "응답");
        Application invitedMember = saveInterviewPendingApplication(recruitment, "대기");
        Application excludedMember = saveInterviewPendingApplication(recruitment, "제외");
        saveMember(newer, respondedMember, RoundMemberStatus.RESPONDED, null);
        saveMember(newer, invitedMember, RoundMemberStatus.INVITED, null);
        saveMember(newer, excludedMember, RoundMemberStatus.EXCLUDED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(LIST_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data.roundId", contains(newer.getId().intValue(), older.getId().intValue()))
                // 총원은 EXCLUDED 를 제외한 응답 가능 대상 (N), 응답수는 응답 행위 완료 (n)
                .body("data[0].totalMemberCount", equalTo(2))
                .body("data[0].respondedMemberCount", equalTo(1))
                .body("data[0].status", equalTo("COLLECTING"))
                .body("data[1].totalMemberCount", equalTo(0));
    }

    @Test
    @DisplayName("라운드가 없는 모집의 목록은 빈 배열을 반환한다")
    void emptyRoundListReturnsEmptyArray() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(LIST_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집의 라운드 목록 조회는 400 으로 거부된다")
    void interviewNotUsedListIsRejected() {
        Club club = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment simpleRecruitment = saveSimpleRecruitment(club, "면접없는모집");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(LIST_PATH, simpleRecruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("해당 동아리 운영진이 아니면 라운드 목록을 볼 수 없다")
    void nonManagerCannotListRounds() {
        User outsider = saveUser("외부인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get(LIST_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 모집의 라운드 목록은 404 를 반환한다")
    void unknownRecruitmentListReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(LIST_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 상세 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("상세 dashboard 는 상태별 카운트 카드를 제공한다 — 총원은 제외 멤버를 빼고 센다")
    void detailProvidesStatusCounts() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, saveInterviewPendingApplication(recruitment, "초대"), RoundMemberStatus.INVITED, null);
        saveMember(round, saveInterviewPendingApplication(recruitment, "응답"), RoundMemberStatus.RESPONDED, null);
        saveMember(round, saveInterviewPendingApplication(recruitment, "불가"), RoundMemberStatus.NO_AVAILABLE_SLOT, "주말만");
        saveMember(round, saveInterviewPendingApplication(recruitment, "제외"), RoundMemberStatus.EXCLUDED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.title", equalTo("1차 면접"))
                .body("data.status", equalTo("COLLECTING"))
                .body("data.counts.totalMemberCount", equalTo(3))
                .body("data.counts.invitedCount", equalTo(1))
                .body("data.counts.respondedCount", equalTo(1))
                .body("data.counts.noAvailableSlotCount", equalTo(1))
                .body("data.counts.assignedCount", equalTo(0))
                .body("data.counts.excludedCount", equalTo(1))
                .body("data.members", hasSize(4));
    }

    @Test
    @DisplayName("마감 전에는 초대 상태 멤버가 미응답으로 집계되지 않는다")
    void beforeDeadlineInvitedIsNotUnresponded() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, saveInterviewPendingApplication(recruitment, "대기중"), RoundMemberStatus.INVITED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.deadlinePassed", equalTo(false))
                .body("data.counts.unrespondedCount", equalTo(0))
                .body("data.members[0].unresponded", equalTo(false));
    }

    @Test
    @DisplayName("마감이 지나면 초대 상태 멤버가 미응답으로 파생 집계된다")
    void afterDeadlineInvitedBecomesUnresponded() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().minusHours(1));
        saveMember(round, saveInterviewPendingApplication(recruitment, "미응답자"), RoundMemberStatus.INVITED, null);
        saveMember(round, saveInterviewPendingApplication(recruitment, "응답자"), RoundMemberStatus.RESPONDED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.deadlinePassed", equalTo(true))
                .body("data.counts.unrespondedCount", equalTo(1))
                .body("data.members.find { it.status == 'INVITED' }.unresponded", equalTo(true))
                .body("data.members.find { it.status == 'RESPONDED' }.unresponded", equalTo(false));
    }

    @Test
    @DisplayName("가능 슬롯 없음 멤버의 대체 가능시간 텍스트가 상세에 노출된다")
    void noAvailableSlotTextIsExposed() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, saveInterviewPendingApplication(recruitment, "불가자"),
                RoundMemberStatus.NO_AVAILABLE_SLOT, "평일 저녁만 가능합니다");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.members[0].alternativeAvailabilityText", equalTo("평일 저녁만 가능합니다"));
    }

    @Test
    @DisplayName("멤버별 선택 슬롯 수와 슬롯별 선택 수가 함께 집계된다")
    void selectionCountsAreAggregated() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        InterviewSlot slotA = saveSlot(round, "2026-06-20T14:00:00");
        InterviewSlot slotB = saveSlot(round, "2026-06-20T15:00:00");
        Application picky = saveInterviewPendingApplication(recruitment, "둘다선택");
        saveMember(round, picky, RoundMemberStatus.RESPONDED, null);
        interviewAvailabilityRepository.save(InterviewAvailability.create(picky.getId(), slotA.getId(), round.getId()));
        interviewAvailabilityRepository.save(InterviewAvailability.create(picky.getId(), slotB.getId(), round.getId()));
        Application single = saveInterviewPendingApplication(recruitment, "하나선택");
        saveMember(round, single, RoundMemberStatus.RESPONDED, null);
        interviewAvailabilityRepository.save(InterviewAvailability.create(single.getId(), slotA.getId(), round.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.members.find { it.applicationId == " + picky.getId() + " }.selectedSlotCount", equalTo(2))
                .body("data.members.find { it.applicationId == " + single.getId() + " }.selectedSlotCount", equalTo(1))
                .body("data.slots.find { it.slotId == " + slotA.getId() + " }.selectedCount", equalTo(2))
                .body("data.slots.find { it.slotId == " + slotB.getId() + " }.selectedCount", equalTo(1));
    }

    @Test
    @DisplayName("배정된 멤버의 슬롯과 슬롯별 배정 수가 상세에 노출된다")
    void assignedScheduleIsExposed() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusDays(1));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        Application assignee = saveInterviewPendingApplication(recruitment, "배정자");
        saveMember(round, assignee, RoundMemberStatus.RESPONDED, null);
        interviewScheduleRepository.save(InterviewSchedule.create(
                assignee.getId(), slot.getId(), round.getId(), LocalDateTime.now()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.members[0].assignedSlotId", equalTo(slot.getId().intValue()))
                .body("data.slots[0].assignedCount", equalTo(1));
    }

    @Test
    @DisplayName("슬롯은 시작 시각 오름차순으로 정렬되고 배정이 없으면 멤버의 배정 슬롯은 null 이다")
    void slotsAreSortedAndUnassignedMemberHasNullSlot() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        InterviewSlot late = saveSlot(round, "2026-06-20T16:00:00");
        InterviewSlot early = saveSlot(round, "2026-06-20T14:00:00");
        saveMember(round, saveInterviewPendingApplication(recruitment, "미배정"), RoundMemberStatus.INVITED, null);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.slots.slotId", contains(early.getId().intValue(), late.getId().intValue()))
                .body("data.members[0].assignedSlotId", nullValue());
    }

    @Test
    @DisplayName("존재하지 않는 라운드의 상세는 404, 타 동아리 운영진은 403 을 받는다")
    void detailGuards() {
        InterviewRound round = saveRound(RoundStatus.DRAFT, LocalDateTime.now().plusDays(3));
        User outsider = saveUser("타인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(DETAIL_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get(DETAIL_PATH, round.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private InterviewRound saveRound(RoundStatus status, LocalDateTime deadline) {
        return interviewRoundRepository.save(
                InterviewRoundFixture.withStatus(recruitment.getId(), deadline, null, status));
    }

    private InterviewSlot saveSlot(InterviewRound round, String start) {
        LocalDateTime startTime = LocalDateTime.parse(start);
        return interviewSlotRepository.save(InterviewSlot.create(
                round.getId(), startTime, startTime.plusMinutes(30), 2));
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
```

- [x] **Step 2: RED 확인** — `./gradlew test --tests "...LeaderInterviewRoundDashboardControllerTest"` → 컴파일 성공 + 대부분 FAIL. **커밋하지 않는다.**

---

### Task 4: 구현 (GREEN)

- [x] **Step 1: projection·query DTO 6종**

`service/dto/query/RoundMemberLine.java`:

```java
package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.RoundMemberStatus;

/**
 * 상세 dashboard 멤버 테이블 한 행 — member ⋈ application ⋈ user QueryDSL projection.
 */
public record RoundMemberLine(
        Long memberId,
        Long applicationId,
        String userName,
        String studentId,
        RoundMemberStatus status,
        String alternativeAvailabilityText
) {}
```

`service/dto/query/RoundMemberStatusCount.java`:

```java
package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.RoundMemberStatus;

public record RoundMemberStatusCount(Long roundId, RoundMemberStatus status, long count) {}
```

`service/dto/query/SlotSelectionCount.java`:

```java
package com.duing.domain.interview.service.dto.query;

public record SlotSelectionCount(Long slotId, long count) {}
```

`service/dto/query/MemberSelectionCount.java`:

```java
package com.duing.domain.interview.service.dto.query;

public record MemberSelectionCount(Long applicationId, long count) {}
```

`service/dto/query/RoundSummaryQuery.java`:

```java
package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import java.time.LocalDateTime;
import java.util.Map;

public record RoundSummaryQuery(
        Long roundId,
        String title,
        RoundStatus status,
        LocalDateTime availabilityDeadline,
        String location,
        long totalMemberCount,
        long respondedMemberCount
) {
    /**
     * totalMemberCount = 비EXCLUDED(응답 가능 대상 N),
     * respondedMemberCount = RESPONDED + NO_AVAILABLE_SLOT + ASSIGNED(응답 행위 완료 n) — §10.5 "응답 대기 n/N".
     */
    public static RoundSummaryQuery of(InterviewRound round, Map<RoundMemberStatus, Long> statusCounts) {
        long excluded = statusCounts.getOrDefault(RoundMemberStatus.EXCLUDED, 0L);
        long total = statusCounts.values().stream().mapToLong(Long::longValue).sum() - excluded;
        long responded = statusCounts.getOrDefault(RoundMemberStatus.RESPONDED, 0L)
                + statusCounts.getOrDefault(RoundMemberStatus.NO_AVAILABLE_SLOT, 0L)
                + statusCounts.getOrDefault(RoundMemberStatus.ASSIGNED, 0L);
        return new RoundSummaryQuery(round.getId(), round.getTitle(), round.getStatus(),
                round.getAvailabilityDeadline(), round.getLocation(), total, responded);
    }
}
```

`service/dto/query/RoundDetailQuery.java`:

```java
package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record RoundDetailQuery(
        Long roundId,
        String title,
        RoundStatus status,
        LocalDateTime availabilityDeadline,
        String location,
        int requestSequence,
        boolean deadlinePassed,
        MemberCounts counts,
        List<MemberLine> members,
        List<SlotLine> slots
) {
    public record MemberCounts(
            long totalMemberCount,
            long invitedCount,
            long respondedCount,
            long noAvailableSlotCount,
            long assignedCount,
            long excludedCount,
            long unrespondedCount
    ) {}

    public record MemberLine(
            Long memberId,
            Long applicationId,
            String userName,
            String studentId,
            RoundMemberStatus status,
            boolean unresponded,
            String alternativeAvailabilityText,
            long selectedSlotCount,
            Long assignedSlotId
    ) {}

    public record SlotLine(
            Long slotId,
            LocalDateTime startTime,
            LocalDateTime endTime,
            int capacity,
            long selectedCount,
            long assignedCount
    ) {}

    /**
     * 미응답은 저장하지 않는다 — INVITED && now > deadline 로 파생한다 (스펙 §5.3).
     * 운영진 dashboard 는 EXCLUDED 포함 raw 상태를 본다 (지원자 노출 술어 isVisibleToApplicant 와 무관 — §5.4).
     */
    public static RoundDetailQuery assemble(InterviewRound round,
                                            List<RoundMemberLine> memberLines,
                                            Map<Long, Long> selectionCountByApplicationId,
                                            Map<Long, Long> assignedSlotIdByApplicationId,
                                            List<InterviewSlot> slotEntities,
                                            Map<Long, Long> selectionCountBySlotId,
                                            Map<Long, Long> assignedCountBySlotId,
                                            LocalDateTime now) {
        boolean deadlinePassed = round.getAvailabilityDeadline() != null
                && now.isAfter(round.getAvailabilityDeadline());

        List<MemberLine> members = memberLines.stream()
                .map(line -> new MemberLine(
                        line.memberId(),
                        line.applicationId(),
                        line.userName(),
                        line.studentId(),
                        line.status(),
                        deadlinePassed && line.status() == RoundMemberStatus.INVITED,
                        line.alternativeAvailabilityText(),
                        selectionCountByApplicationId.getOrDefault(line.applicationId(), 0L),
                        assignedSlotIdByApplicationId.get(line.applicationId())))
                .toList();

        long invited = countByStatus(memberLines, RoundMemberStatus.INVITED);
        long excluded = countByStatus(memberLines, RoundMemberStatus.EXCLUDED);
        MemberCounts counts = new MemberCounts(
                memberLines.size() - excluded,
                invited,
                countByStatus(memberLines, RoundMemberStatus.RESPONDED),
                countByStatus(memberLines, RoundMemberStatus.NO_AVAILABLE_SLOT),
                countByStatus(memberLines, RoundMemberStatus.ASSIGNED),
                excluded,
                deadlinePassed ? invited : 0L);

        List<SlotLine> slots = slotEntities.stream()
                .map(slot -> new SlotLine(
                        slot.getId(),
                        slot.getStartTime(),
                        slot.getEndTime(),
                        slot.getCapacity(),
                        selectionCountBySlotId.getOrDefault(slot.getId(), 0L),
                        assignedCountBySlotId.getOrDefault(slot.getId(), 0L)))
                .toList();

        return new RoundDetailQuery(round.getId(), round.getTitle(), round.getStatus(),
                round.getAvailabilityDeadline(), round.getLocation(), round.getRequestSequence(),
                deadlinePassed, counts, members, slots);
    }

    private static long countByStatus(List<RoundMemberLine> lines, RoundMemberStatus status) {
        return lines.stream().filter(line -> line.status() == status).count();
    }
}
```

- [x] **Step 2: 레포 5건**

`InterviewRoundRepository` 에 추가:

```java
    List<InterviewRound> findByRecruitmentIdOrderByCreatedAtDesc(Long recruitmentId);
```

`InterviewScheduleRepository` 에 추가:

```java
    List<InterviewSchedule> findByRoundId(Long roundId);
```

`InterviewSlotRepository` 에 추가:

```java
    List<InterviewSlot> findByRoundIdOrderByStartTimeAsc(Long roundId);
```

`InterviewRoundMemberRepositoryCustom` 에 추가 (import `RoundMemberLine`·`RoundMemberStatusCount`):

```java
    /** 상세 dashboard 멤버 테이블 — member ⋈ application ⋈ user 한 방 projection. */
    List<RoundMemberLine> findMemberLinesByRoundId(Long roundId);

    /** 목록 카운트 요약 — round × status groupBy 집계. */
    List<RoundMemberStatusCount> countMembersGroupedByStatus(Collection<Long> roundIds);
```

`InterviewRoundMemberRepositoryImpl` 에 구현 추가 (import static `QApplication.application`·`QUser` — `com.duing.domain.user.entity.QUser.user`, `Projections`):

```java
    @Override
    public List<RoundMemberLine> findMemberLinesByRoundId(Long roundId) {
        return queryFactory
                .select(Projections.constructor(RoundMemberLine.class,
                        interviewRoundMember.id,
                        interviewRoundMember.applicationId,
                        user.name,
                        user.studentId,
                        interviewRoundMember.status,
                        interviewRoundMember.alternativeAvailabilityText))
                .from(interviewRoundMember)
                .join(application).on(application.id.eq(interviewRoundMember.applicationId))
                .join(application.user, user)
                .where(interviewRoundMember.roundId.eq(roundId))
                .orderBy(interviewRoundMember.id.asc())
                .fetch();
    }

    @Override
    public List<RoundMemberStatusCount> countMembersGroupedByStatus(Collection<Long> roundIds) {
        return queryFactory
                .select(Projections.constructor(RoundMemberStatusCount.class,
                        interviewRoundMember.roundId,
                        interviewRoundMember.status,
                        interviewRoundMember.count()))
                .from(interviewRoundMember)
                .where(interviewRoundMember.roundId.in(roundIds))
                .groupBy(interviewRoundMember.roundId, interviewRoundMember.status)
                .fetch();
    }
```

`InterviewAvailabilityRepositoryCustom` 에 추가 (import `SlotSelectionCount`·`MemberSelectionCount`):

```java
    /** 슬롯별 선택 수 — dashboard 슬롯 섹션. */
    List<SlotSelectionCount> countByRoundIdGroupedBySlot(Long roundId);

    /** 멤버별 선택 슬롯 수 — dashboard 멤버 테이블. */
    List<MemberSelectionCount> countByRoundIdGroupedByApplication(Long roundId);
```

`InterviewAvailabilityRepositoryImpl` 에 구현 추가 (기존 static import 활용, `Projections`):

```java
    @Override
    public List<SlotSelectionCount> countByRoundIdGroupedBySlot(Long roundId) {
        return queryFactory
                .select(Projections.constructor(SlotSelectionCount.class,
                        interviewAvailability.slotId,
                        interviewAvailability.count()))
                .from(interviewAvailability)
                .where(interviewAvailability.roundId.eq(roundId))
                .groupBy(interviewAvailability.slotId)
                .fetch();
    }

    @Override
    public List<MemberSelectionCount> countByRoundIdGroupedByApplication(Long roundId) {
        return queryFactory
                .select(Projections.constructor(MemberSelectionCount.class,
                        interviewAvailability.applicationId,
                        interviewAvailability.count()))
                .from(interviewAvailability)
                .where(interviewAvailability.roundId.eq(roundId))
                .groupBy(interviewAvailability.applicationId)
                .fetch();
    }
```

(주의: `InterviewAvailabilityRepositoryImpl` 의 기존 구조 — `JPAQueryFactory queryFactory` 필드와 Q-클래스 static import — 를 읽고 동일 스타일로 병합. `interviewAvailability` Q-인스턴스 import 가 없으면 추가.)

- [x] **Step 3: 서비스**

`InterviewRoundService` 에 추가:

```java
    /** 라운드 목록 — 최신 생성 순 + 멤버 카운트 요약 (스펙 §9.1 API 3). */
    List<RoundSummaryQuery> getRounds(Long recruitmentId, Long currentUserId);

    /** 라운드 상세 dashboard — 카운트 카드·멤버 테이블(파생 미응답)·슬롯 집계 (스펙 §10.4). */
    RoundDetailQuery getRoundDetail(Long roundId, Long currentUserId);
```

`GeneralInterviewRoundService` 에 추가 — 필드: `InterviewScheduleRepository interviewScheduleRepository`, `InterviewAvailabilityRepository interviewAvailabilityRepository` (slotRepo·clock 은 BE#5 에서 이미 주입됨). 메서드:

```java
    @Override
    public List<RoundSummaryQuery> getRounds(Long recruitmentId, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());
        if (!recruitment.isUseInterview()) {
            throw new InterviewException.InterviewNotUsed();
        }

        List<InterviewRound> rounds = interviewRoundRepository
                .findByRecruitmentIdOrderByCreatedAtDesc(recruitmentId);
        if (rounds.isEmpty()) {
            return List.of();
        }

        Map<Long, Map<RoundMemberStatus, Long>> countsByRoundId = interviewRoundMemberRepository
                .countMembersGroupedByStatus(rounds.stream().map(InterviewRound::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(RoundMemberStatusCount::roundId,
                        Collectors.toMap(RoundMemberStatusCount::status, RoundMemberStatusCount::count)));

        return rounds.stream()
                .map(round -> RoundSummaryQuery.of(round,
                        countsByRoundId.getOrDefault(round.getId(), Map.of())))
                .toList();
    }

    @Override
    public RoundDetailQuery getRoundDetail(Long roundId, Long currentUserId) {
        InterviewRound round = getRoundWithManagerAuth(roundId, currentUserId);

        List<RoundMemberLine> memberLines = interviewRoundMemberRepository
                .findMemberLinesByRoundId(round.getId());
        Map<Long, Long> selectionCountByApplicationId = interviewAvailabilityRepository
                .countByRoundIdGroupedByApplication(round.getId()).stream()
                .collect(Collectors.toMap(MemberSelectionCount::applicationId, MemberSelectionCount::count));
        Map<Long, Long> selectionCountBySlotId = interviewAvailabilityRepository
                .countByRoundIdGroupedBySlot(round.getId()).stream()
                .collect(Collectors.toMap(SlotSelectionCount::slotId, SlotSelectionCount::count));

        // 활성(ASSIGNED·미삭제) schedule — ASSIGNING(draft 검토)·SCHEDULED 에서 §10.4 검토 영역이 사용.
        List<InterviewSchedule> activeSchedules = interviewScheduleRepository
                .findByRoundId(round.getId()).stream()
                .filter(schedule -> schedule.getStatus() == InterviewScheduleStatus.ASSIGNED)
                .toList();
        Map<Long, Long> assignedSlotIdByApplicationId = activeSchedules.stream()
                .collect(Collectors.toMap(InterviewSchedule::getApplicationId, InterviewSchedule::getSlotId));
        Map<Long, Long> assignedCountBySlotId = activeSchedules.stream()
                .collect(Collectors.groupingBy(InterviewSchedule::getSlotId, Collectors.counting()));

        return RoundDetailQuery.assemble(round, memberLines,
                selectionCountByApplicationId, assignedSlotIdByApplicationId,
                interviewSlotRepository.findByRoundIdOrderByStartTimeAsc(round.getId()),
                selectionCountBySlotId, assignedCountBySlotId,
                LocalDateTime.now(clock));
    }
```

(import 추가: `RoundSummaryQuery`·`RoundDetailQuery`·`RoundMemberLine`·`RoundMemberStatusCount`·`SlotSelectionCount`·`MemberSelectionCount`·`InterviewSchedule`·`InterviewScheduleStatus`·`InterviewScheduleRepository`·`InterviewAvailabilityRepository`·`Map`·`Collectors`)

- [x] **Step 4: 응답 DTO + Api + Controller**

`controller/dto/response/RoundSummaryResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.service.dto.query.RoundSummaryQuery;
import java.time.LocalDateTime;

public record RoundSummaryResponse(
        Long roundId,
        String title,
        RoundStatus status,
        LocalDateTime availabilityDeadline,
        String location,
        long totalMemberCount,
        long respondedMemberCount
) {
    public static RoundSummaryResponse from(RoundSummaryQuery summaryQuery) {
        return new RoundSummaryResponse(
                summaryQuery.roundId(), summaryQuery.title(), summaryQuery.status(),
                summaryQuery.availabilityDeadline(), summaryQuery.location(),
                summaryQuery.totalMemberCount(), summaryQuery.respondedMemberCount());
    }
}
```

`controller/dto/response/RoundDetailResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.service.dto.query.RoundDetailQuery;
import java.time.LocalDateTime;
import java.util.List;

public record RoundDetailResponse(
        Long roundId,
        String title,
        RoundStatus status,
        LocalDateTime availabilityDeadline,
        String location,
        int requestSequence,
        boolean deadlinePassed,
        Counts counts,
        List<Member> members,
        List<Slot> slots
) {
    public record Counts(long totalMemberCount, long invitedCount, long respondedCount,
                         long noAvailableSlotCount, long assignedCount, long excludedCount,
                         long unrespondedCount) {}

    public record Member(Long memberId, Long applicationId, String userName, String studentId,
                         RoundMemberStatus status, boolean unresponded,
                         String alternativeAvailabilityText, long selectedSlotCount, Long assignedSlotId) {}

    public record Slot(Long slotId, LocalDateTime startTime, LocalDateTime endTime,
                       int capacity, long selectedCount, long assignedCount) {}

    public static RoundDetailResponse from(RoundDetailQuery detailQuery) {
        return new RoundDetailResponse(
                detailQuery.roundId(), detailQuery.title(), detailQuery.status(),
                detailQuery.availabilityDeadline(), detailQuery.location(), detailQuery.requestSequence(),
                detailQuery.deadlinePassed(),
                new Counts(detailQuery.counts().totalMemberCount(), detailQuery.counts().invitedCount(),
                        detailQuery.counts().respondedCount(), detailQuery.counts().noAvailableSlotCount(),
                        detailQuery.counts().assignedCount(), detailQuery.counts().excludedCount(),
                        detailQuery.counts().unrespondedCount()),
                detailQuery.members().stream()
                        .map(member -> new Member(member.memberId(), member.applicationId(),
                                member.userName(), member.studentId(), member.status(), member.unresponded(),
                                member.alternativeAvailabilityText(), member.selectedSlotCount(),
                                member.assignedSlotId()))
                        .toList(),
                detailQuery.slots().stream()
                        .map(slot -> new Slot(slot.slotId(), slot.startTime(), slot.endTime(),
                                slot.capacity(), slot.selectedCount(), slot.assignedCount()))
                        .toList());
    }
}
```

`LeaderInterviewRoundApi` 에 추가:

```java
    @Operation(
            summary = "면접 라운드 목록 조회",
            description = "모집의 라운드를 최신 생성 순으로 반환한다. 카드 요약용 카운트 포함 — "
                    + "totalMemberCount 는 제외(EXCLUDED) 멤버를 뺀 응답 가능 대상, "
                    + "respondedMemberCount 는 응답 행위를 완료한 수(슬롯 선택·가능 없음 응답·배정 확정)."
    )
    @GetMapping("/leader/recruitments/{recruitmentId}/interview-rounds")
    ResponseEntity<ApiResponse<List<RoundSummaryResponse>>> getRounds(
            @PathVariable Long recruitmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 상세 dashboard",
            description = "상태별 카운트 카드, 멤버 테이블(파생 미응답 — 마감 경과 && 초대 상태, 가능 슬롯 없음 멤버의 대체 가능시간 텍스트, "
                    + "선택 슬롯 수, 배정 슬롯), 슬롯 목록(시작 시각 오름차순, 슬롯별 선택/배정 수)을 반환한다."
    )
    @GetMapping("/leader/interview-rounds/{roundId}")
    ResponseEntity<ApiResponse<RoundDetailResponse>> getRoundDetail(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`LeaderInterviewRoundController` 에 추가:

```java
    @Override
    public ResponseEntity<ApiResponse<List<RoundSummaryResponse>>> getRounds(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<RoundSummaryResponse> rounds = interviewRoundService
                .getRounds(recruitmentId, currentUser.id()).stream()
                .map(RoundSummaryResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(rounds));
    }

    @Override
    public ResponseEntity<ApiResponse<RoundDetailResponse>> getRoundDetail(
            @PathVariable Long roundId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                RoundDetailResponse.from(interviewRoundService.getRoundDetail(roundId, currentUser.id()))));
    }
```

- [x] **Step 5: GREEN 확인** — 13건 PASS

---

### Task 5: 전체 검증 + 커밋

- [x] **Step 1:** `./gradlew test` → BUILD SUCCESSFUL (742 + 13 = 755건 예상)

- [x] **Step 2:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 면접 라운드 목록·상세 dashboard API"
```

---

### Task 6: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [x] **Step 1: self-check 7항목** (기존 동일 명령)

- [x] **Step 2: push + PR** (자동 머지 금지)

```bash
git push -u origin feat/interview-round-dashboard
gh pr create --base develop --title "feat(backend): 면접 라운드 목록·상세 dashboard API" --body "$(cat <<'EOF'
## 🚀 작업 내용

라운드 운영의 관제탑 — 목록과 상세 dashboard 조회를 구현했습니다. 목록은 모집의 라운드들을 최신순으로 카운트 요약(응답 n / 대상 N)과 함께 내려주고, 상세는 상태별 카운트 카드, 멤버 테이블, 슬롯 집계를 한 번에 제공합니다. 응답 수집·배정 검토·확정까지 모든 운영 화면이 이 API 위에 올라갑니다.

설계 문서의 "미응답은 저장하지 않는다" 원칙대로, 미응답 여부는 서버가 마감 경과와 초대 상태를 조합해 파생합니다 — 멤버별 플래그와 카운트 둘 다요. 가능 슬롯 없음으로 응답한 멤버의 대체 가능시간 텍스트, 멤버·슬롯별 선택 수, (배정이 생기면) 배정 슬롯과 슬롯별 배정 수까지 dashboard 전용 섹션들이 필요로 하는 데이터를 5개 배치 쿼리로 조립합니다 — N+1 없습니다.

직전 PR 리뷰에서 합의한 대로, 슬롯 생성 서비스가 컨트롤러 응답 DTO 를 반환하던 계층 역전도 이 PR 에서 정리했습니다.

## 🤔 고민했던 내용

- 목록의 "응답 수" 정의: 슬롯 선택뿐 아니라 "가능한 시간이 없다"는 응답과 배정 확정도 응답 행위로 셌습니다 — 응답 대기 n/N 표시의 N 은 제외 멤버를 뺀 응답 가능 대상입니다.
- 운영진 dashboard 는 제외(EXCLUDED) 멤버를 포함한 raw 상태를 봅니다 — 지원자 노출용 술어와는 무관한 영역이라 명확히 분리했습니다.
- 배정 정보(assignedSlotId·assignedCount)는 자동배정(후속 PR) 전까지 항상 null/0 이지만, 조회 계약을 지금 고정해 두면 배정 PR 이 쓰기만 추가하면 됩니다.

## 💬 리뷰 중점사항

- 파생 미응답(deadlinePassed && INVITED)의 경계 — 마감 전/후 테스트 두 건이 고정합니다.
- 상세 조립(RoundDetailQuery.assemble)의 카운트 정의가 §10.4 카운트 카드 요구와 일치하는지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §5.3·§9.1 API 3·§10.4
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §9.1 API 3(목록/상세·카운트·파생 미응답 QueryDSL) → Task 4, §5.3(미응답 파생·now 주입) → assemble + 테스트 7·8, §10.4(카운트 카드·멤버 테이블·NO_AVAILABLE_SLOT 섹션 데이터·슬롯 섹션·배정 검토 데이터) → 상세 응답 구조 + 테스트 6·9·10·11, BE#5 합의(BE#4 계층 정리) → Task 2.
- **플레이스홀더**: 없음.
- **타입 일관성**: `RoundMemberLine`/`RoundMemberStatusCount`/`SlotSelectionCount`/`MemberSelectionCount` 가 Custom 시그니처·Impl projection·서비스 조립·assemble 파라미터에서 일치. `RoundDetailQuery.assemble` 의 8개 파라미터 순서가 서비스 호출부와 일치. 테스트 JSON 경로(`data.counts.*`·`data.members[].unresponded` 등)가 Response record 필드명과 일치.
- **주의 메모**: ① `assignedSlotIdByApplicationId` 의 `Collectors.toMap` 은 활성 schedule 이 멤버당 1개(§16-1 불변식)임을 전제 — 중복 키면 loud 실패(의도, §16-6). ② member 테이블의 user join 은 `application.user` 연관 경로 사용 — `QUser` import 필요. ③ 목록 카운트 groupBy 는 EXCLUDED 포함 raw 집계 후 `RoundSummaryQuery.of` 가 가공.

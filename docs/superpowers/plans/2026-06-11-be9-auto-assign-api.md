# BE#9 — 자동배정 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 7 은 리뷰 후 컨트롤러가 수행한다.**

**Goal:** `POST /api/v1/leader/interview-rounds/{roundId}/auto-assign` — COLLECTING→ASSIGNING 전이(첫 실행) 또는 재실행으로, RESPONDED 멤버를 그리디 매칭해 draft schedule 을 생성한다 (스펙 §6.1·§6.2·§9.1 API 8).

**Architecture:** 기존 `InterviewMatchingService`(순수 함수)를 재사용하되 **슬롯 비교자를 스펙 §6.1 로 수정** — 현재 "배정 수 최소" → "**capacity 잔여 최대**" (동일 capacity 에선 두 기준이 일치해 기존 테스트 8건은 그대로 통과; 상이 capacity 차별 테스트를 신설). draft 는 round.status==ASSIGNING 으로 표현 — 멤버는 RESPONDED 유지, schedule 만 생성(§6.2). 동시성: round 행 `PESSIMISTIC_WRITE` (동시 자동배정·향후 확정/취소 직렬화) + RESPONDED 멤버 잠금 조회(§16-7-2 상속 — 진행 중 응답과 스냅샷 직렬화). 배정 계열(API 8·9·10·11)의 신규 `InterviewAssignmentService` 를 신설하고, 3번째 사용처가 된 round 인증 헬퍼를 `InterviewRoundAccessor` 로 추출한다 (rule of three 도달).

**Tech Stack:** Spring Boot 3.4 / Java 21 / RestAssured + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.1·§5.5 Rule 1·§6.1·§6.2·§7·§9.1 API 8·§16-7-2
**리뷰 정책:** duing-code-reviewer + codex 기본 + **codex adversarial 필수** (스펙 §12 명시 — 자동배정)

---

## 핵심 결정

1. **비교자 수정의 실체**: 멤버 순서(선택 적은 순→applicationId)는 이미 스펙과 일치. 슬롯 선택만 `min(assignedCount)` → `max(capacity - assigned)` 로 수정 (tie → startTime → slotId 유지). 기존 테스트 8건은 동일 capacity 시나리오라 무변경 통과 — 단 `fewestAssignedSlotIsChosen` 의 `@DisplayName` 문구를 스펙 §6.1 표현("잔여 수용 인원이 가장 많은 슬롯")으로 보정.
2. **가드·잠금 순서**: round `findByIdForUpdate`(404) → requireManager(403) → 상태 가드(COLLECTING→`openAssigning()` 전이 / ASSIGNING→재실행 / 그 외 `RoundTransitionNotAllowed` 409). 마감 전 COLLECTING 도 허용 — API 8 문언에 마감 조건 없음 (전원 조기 응답 시 조기 배정).
3. **멤버 스냅샷 잠금**: 대상(RESPONDED) 멤버를 `findAllByRoundIdAndStatusForUpdate` 로 잠가(§16-7-2) 배정 계산 중 멤버 상태 변경과 직렬화. **잠금 순서 감사**: auto-assign = round(W)→members(W, id 순) / 응답 = application→round 비잠금→member(단건)→slots / Rule 2 = members only — 사이클 없음.
4. **수용 윈도우 (스펙 §16-7-3 으로 명문화, Task 6)**: 응답 TX 가 기간 검사(COLLECTING)를 통과한 직후 auto-assign 이 전이·배정·커밋하면, 그 마지막 순간 응답 1건은 draft 에 미반영될 수 있다. 데이터 모순은 없고(availability·RESPONDED 일관) 재실행·확정 게이트(§6.3 respondedUnassigned)가 노출·흡수하므로 MVP 수용 — 응답 측 round 공유 잠금 도입은 과설계.
5. **재실행 = 활성 schedule 전체 soft delete 후 재계산**: `softDeleteByRoundId` 는 **plain `@Modifying`** — 이 TX 는 schedule 을 PC 에 로드하지 않으므로 `clearAutomatically` 불요. clear 를 쓰면 직전 `openAssigning()` 의 round dirty 변경이 flush 전에 유실될 수 있다 (BE#8 의 detached 사고 재발 방지 — 주석으로 근거 고정).
6. **unassigned 정의 = RESPONDED 인데 미배정** (§6.3 (b)와 동일 모집단). NO_AVAILABLE_SLOT(Rule 1)·INVITED·EXCLUDED 는 대상도 카운트도 아님. RESPONDED 0명이어도 200 `{0, 0}` (재실행 후 빈 라운드 허용 — 409 만들 이유 없음).
7. **응답 200 `{assignedMemberCount, unassignedMemberCount}`** — 상세 검토는 dashboard(BE#6)가 담당, FE 는 invalidate 후 재조회.
8. **`InterviewRoundAccessor` 추출** (rule of three): `getWithManagerAuth(roundId, userId)`(기존 두 서비스의 private 헬퍼 본문 그대로 이전) + `requireManager(round, userId)`(잠금 조회 뒤 인증용 분리) — 별도 refactor 커밋.

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Modify | `service/InterviewMatchingService.java` | 슬롯 비교자 — 잔여 capacity 최대 |
| Test Modify | `service/InterviewMatchingServiceTest.java` | DisplayName 보정 + 차별 테스트 2건 |
| Modify | `entity/InterviewRound.java` + `entity/InterviewRoundDomainTest.java` | `openAssigning()` TDD 2건 |
| Create | `service/InterviewRoundAccessor.java` | round 인증 헬퍼 추출 (rule of three) |
| Modify | `service/GeneralInterviewRoundService.java` + `GeneralInterviewSlotService.java` | private 헬퍼 제거 → accessor 사용 |
| Modify | `repository/InterviewRoundRepository.java` | `findByIdForUpdate` (PESSIMISTIC_WRITE) |
| Modify | `repository/InterviewScheduleRepository.java` | `softDeleteByRoundId` (plain @Modifying) |
| Modify | `repository/InterviewAvailabilityRepository.java` | `findByRoundId` derived |
| Create | `service/InterviewAssignmentService.java` + `GeneralInterviewAssignmentService.java` | autoAssign (BE#10·11 도 이 서비스로) |
| Create | `service/dto/query/AutoAssignResult.java` + `controller/dto/response/AutoAssignResponse.java` | 결과 요약 |
| Create | `api/LeaderInterviewAssignmentApi.java` + `controller/LeaderInterviewAssignmentController.java` | POST (200) |
| Test Create | `controller/LeaderInterviewAutoAssignControllerTest.java` | RestAssured 12건 |

커밋 3개: ① 비교자+openAssigning TDD ② refactor(accessor 추출) ③ auto-assign API.

---

### Task 1: 브랜치 생성

- [ ] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-auto-assign
```

---

### Task 2: 매칭 비교자 + `openAssigning` (TDD)

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/interview/service/InterviewMatchingServiceTest.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/InterviewMatchingService.java`
- Modify: `backend/src/test/java/com/duing/domain/interview/entity/InterviewRoundDomainTest.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/entity/InterviewRound.java`

- [ ] **Step 1: 차별 테스트 2건 추가 (RED)** — `InterviewMatchingServiceTest` 에 (기존 헬퍼·import 스타일 따라):

```java
    @Test
    @DisplayName("capacity 가 다른 슬롯들 중 잔여 수용 인원이 가장 많은 슬롯이 선택된다")
    void largestRemainingCapacityChosen() {
        // 슬롯800: capacity=1(잔여1, 시간 빠름), 슬롯801: capacity=3(잔여3, 시간 늦음)
        // 배정 수 최소 기준이면 동률(0)이라 빠른 슬롯800 — 잔여 최대 기준이면 슬롯801 이어야 한다
        MatchingInput input = new MatchingInput(
                List.of(new ApplicantSelection(1L, Set.of(800L, 801L))),
                List.of(
                        new SlotState(800L, LocalDateTime.parse("2026-06-20T10:00:00"), 1),
                        new SlotState(801L, LocalDateTime.parse("2026-06-20T15:00:00"), 3)));

        MatchingResult result = interviewMatchingService.match(input);

        assertThat(result.assigned()).containsExactly(new Assignment(1L, 801L));
    }

    @Test
    @DisplayName("배정이 진행될수록 잔여가 줄어든 슬롯 대신 여유 있는 슬롯으로 분산된다")
    void assignmentsSpreadByRemainingCapacity() {
        // 슬롯900: capacity=2, 슬롯901: capacity=2 — 두 명이 모두 양쪽 선택 시
        // 1번째: 잔여 동률(2,2) → 빠른 900. 2번째: 잔여 (1,2) → 901 로 분산
        MatchingInput input = new MatchingInput(
                List.of(
                        new ApplicantSelection(1L, Set.of(900L, 901L)),
                        new ApplicantSelection(2L, Set.of(900L, 901L))),
                List.of(
                        new SlotState(900L, LocalDateTime.parse("2026-06-20T10:00:00"), 2),
                        new SlotState(901L, LocalDateTime.parse("2026-06-20T11:00:00"), 2)));

        MatchingResult result = interviewMatchingService.match(input);

        assertThat(result.assigned()).containsExactlyInAnyOrder(
                new Assignment(1L, 900L), new Assignment(2L, 901L));
    }
```

- [ ] **Step 2: RED 확인** — `./gradlew test --tests "...InterviewMatchingServiceTest"` → `largestRemainingCapacityChosen` FAIL (현재 로직은 800 선택)

- [ ] **Step 3: 비교자 수정 (GREEN)** — `InterviewMatchingService.match` 의 슬롯 선택 비교자를:

```java
                    // 스펙 §6.1 — 본인이 고른 슬롯 중 잔여 수용 인원(capacity - assigned) 최대.
                    // tie → start_time, slot_id. (min + 음수화 = 잔여 최대)
                    .min(Comparator
                            .comparingInt((SlotState slot) ->
                                    -(slot.capacity() - assignedCount.getOrDefault(slot.slotId(), 0)))
                            .thenComparing(SlotState::startTime)
                            .thenComparing(SlotState::slotId))
```

그리고 `fewestAssignedSlotIsChosen` 의 `@DisplayName` 을 `"동일한 슬롯 후보 중 잔여 수용 인원이 가장 많은 슬롯이 선택된다"` 로, 메서드명을 `largestRemainingSlotIsChosenAmongEqualCapacity` 로 보정 (동일 capacity 라 시나리오·단언 무변경).

- [ ] **Step 4: GREEN 확인** — 10건(기존 8+신규 2) PASS

- [ ] **Step 5: `openAssigning` 단위 테스트 2건 (RED)** — `InterviewRoundDomainTest` 에:

```java
    @Test
    @DisplayName("응답 수집 중 라운드는 자동배정 실행으로 배정 검토 단계에 들어간다")
    void collectingRoundOpensAssigning() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);
        round.openCollecting(LocalDateTime.now());

        round.openAssigning();

        assertThat(round.getStatus()).isEqualTo(RoundStatus.ASSIGNING);
    }

    @Test
    @DisplayName("발송 전 라운드는 자동배정을 실행할 수 없다")
    void draftRoundCannotOpenAssigning() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);

        assertThatThrownBy(round::openAssigning)
                .isInstanceOf(InterviewException.RoundTransitionNotAllowed.class);
    }
```

- [ ] **Step 6: 구현 (GREEN)** — `InterviewRound` 의 `openCollecting` 아래에:

```java
    /**
     * 자동배정 실행: COLLECTING → ASSIGNING (스펙 §5.1·§6.2). 이미 ASSIGNING 인 재실행은
     * 전이가 아니므로 서비스가 분기한다 — 이 메서드는 첫 실행 전이만 담당한다.
     */
    public void openAssigning() {
        if (this.status != RoundStatus.COLLECTING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        this.status = RoundStatus.ASSIGNING;
    }
```

- [ ] **Step 7: GREEN 확인** — 도메인 14건(기존 12+신규 2) PASS

- [ ] **Step 8: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 매칭 슬롯 비교자를 잔여 capacity 최대로 수정 + openAssigning 전이"
```

---

### Task 3: `InterviewRoundAccessor` 추출 (refactor — 행동 무변경)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/interview/service/InterviewRoundAccessor.java`
- Modify: `GeneralInterviewRoundService.java` / `GeneralInterviewSlotService.java`

- [ ] **Step 1: 추출** — 두 서비스에 중복된 private `getRoundWithManagerAuth` 본문을 **그대로 이전**해 컴포넌트화 (기존 본문을 먼저 읽고 예외 타입·조회 메서드를 동일하게 유지):

```java
package com.duing.domain.interview.service;

import com.duing.domain.club.service.ClubAuthService;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 라운드 조회 + 운영진 권한 검증 헬퍼 — 3번째 사용처(배정 서비스)가 생겨 rule of three 로 추출.
 * 잠금 조회가 필요한 경로는 직접 잠금 조회 후 {@link #requireManager} 만 사용한다.
 */
@Component
@RequiredArgsConstructor
public class InterviewRoundAccessor {

    private final InterviewRoundRepository interviewRoundRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;

    public InterviewRound getWithManagerAuth(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findById(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        requireManager(round, currentUserId);
        return round;
    }

    public void requireManager(InterviewRound round, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(round.getRecruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());
    }
}
```

(※ 기존 private 헬퍼의 실제 본문이 위와 다르면 — 예: recruitment 조회 메서드명 — **기존 본문이 정답**이다. 이전 후 두 서비스의 private 헬퍼 삭제, 호출부를 `interviewRoundAccessor.getWithManagerAuth(...)` 로 교체, 불용 의존(필드·import) 정리.)

- [ ] **Step 2: 회귀 확인** — `./gradlew test --tests "com.duing.domain.interview.controller.*"` → 전체 PASS (단언 무변경)

- [ ] **Step 3: 커밋**

```bash
git add backend/src
git commit -m "refactor(backend): 라운드 인증 헬퍼를 InterviewRoundAccessor 로 추출 — rule of three"
```

---

### Task 4: 통합 테스트 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/LeaderInterviewAutoAssignControllerTest.java`

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
import java.time.LocalDateTime;
import java.util.List;
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

// 자동배정 — COLLECTING→ASSIGNING 전이(첫 실행)/재실행, RESPONDED 만 대상(Rule 1),
// 그리디(제약 큰 멤버 우선·잔여 capacity 최대 슬롯), draft = round 상태로 표현·멤버는 RESPONDED 유지 (스펙 §6.1·§6.2).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewAutoAssignControllerTest extends InterviewControllerTestSupport {

    private static final String AUTO_ASSIGN_PATH = "/api/v1/leader/interview-rounds/{roundId}/auto-assign";

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
        Club club = saveActiveClub("배정동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "배정모집");
    }

    @Test
    @DisplayName("응답 수집 중 라운드에 자동배정을 실행하면 배정 검토 단계로 넘어가고 응답자들이 배정된다")
    void firstRunTransitionsAndAssigns() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slotA = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewSlot slotB = saveSlot(round, "2026-06-20T15:00:00", 1);
        Application first = saveRespondedMember(round, "응답자1", slotA);
        Application second = saveRespondedMember(round, "응답자2", slotB);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(2))
                .body("data.unassignedMemberCount", equalTo(0));

        InterviewRound assigning = interviewRoundRepository.findById(round.getId()).orElseThrow();
        assertThat(assigning.getStatus()).isEqualTo(RoundStatus.ASSIGNING);
        List<InterviewSchedule> schedules = interviewScheduleRepository
                .findByRoundIdAndStatus(round.getId(), InterviewScheduleStatus.ASSIGNED);
        assertThat(schedules).extracting(InterviewSchedule::getApplicationId)
                .containsExactlyInAnyOrder(first.getId(), second.getId());
    }

    @Test
    @DisplayName("자동배정 후에도 멤버는 응답 완료 상태를 유지한다 — 확정 전 draft")
    void membersStayRespondedAfterAutoAssign() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveRespondedMember(round, "응답자", slot);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value());

        InterviewRoundMember member = interviewRoundMemberRepository
                .findByRoundIdAndApplicationId(round.getId(), application.getId()).orElseThrow();
        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.RESPONDED);
    }

    @Test
    @DisplayName("선택지가 적은(제약이 큰) 응답자가 먼저 배정된다")
    void leastFlexibleMemberWins() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot contested = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewSlot fallback = saveSlot(round, "2026-06-20T15:00:00", 1);
        Application flexible = saveRespondedMember(round, "여유", contested, fallback);
        Application constrained = saveRespondedMember(round, "한정", contested);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(2));

        assertThat(findAssignedSlotId(round, constrained)).isEqualTo(contested.getId());
        assertThat(findAssignedSlotId(round, flexible)).isEqualTo(fallback.getId());
    }

    @Test
    @DisplayName("선택한 슬롯 중 잔여 수용 인원이 가장 많은 슬롯으로 배정된다")
    void largestRemainingCapacitySlotIsChosen() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot tight = saveSlot(round, "2026-06-20T10:00:00", 1);
        InterviewSlot roomy = saveSlot(round, "2026-06-20T15:00:00", 3);
        Application application = saveRespondedMember(round, "분산대상", tight, roomy);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value());

        assertThat(findAssignedSlotId(round, application)).isEqualTo(roomy.getId());
    }

    @Test
    @DisplayName("선택한 슬롯이 모두 만석인 응답자는 미배정 카운트로 보고된다")
    void overflowIsReportedAsUnassigned() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot only = saveSlot(round, "2026-06-20T14:00:00", 1);
        saveRespondedMember(round, "선착", only);
        Application latecomer = saveRespondedMember(round, "만석", only);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.unassignedMemberCount", equalTo(1));

        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), latecomer.getId(),
                        InterviewScheduleStatus.ASSIGNED)).isEmpty();
    }

    @Test
    @DisplayName("가능한 시간이 없다고 응답한 멤버는 자동배정 대상이 아니다 — 카운트에도 들어가지 않는다")
    void noAvailableSlotMemberIsSkipped() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        saveRespondedMember(round, "정상응답", slot);
        Application reporter = saveInterviewPendingApplication(recruitment, "가능없음");
        saveMember(round, reporter, RoundMemberStatus.NO_AVAILABLE_SLOT);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.unassignedMemberCount", equalTo(0));

        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), reporter.getId(),
                        InterviewScheduleStatus.ASSIGNED)).isEmpty();
    }

    @Test
    @DisplayName("미응답(INVITED)·제외(EXCLUDED) 멤버는 자동배정 대상이 아니다")
    void invitedAndExcludedMembersAreSkipped() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 3);
        saveRespondedMember(round, "정상응답", slot);
        saveMember(round, saveInterviewPendingApplication(recruitment, "미응답"), RoundMemberStatus.INVITED);
        saveMember(round, saveInterviewPendingApplication(recruitment, "제외됨"), RoundMemberStatus.EXCLUDED);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1))
                .body("data.unassignedMemberCount", equalTo(0));
    }

    @Test
    @DisplayName("배정 검토 중 재실행하면 기존 draft 가 현재 멤버 상태 기준으로 재계산된다")
    void rerunRecalculatesFromCurrentState() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        Application keep = saveRespondedMember(round, "유지", slot);
        Application drop = saveRespondedMember(round, "제외예정", slot);
        givenLeader().when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(2));

        InterviewRoundMember dropMember = interviewRoundMemberRepository
                .findByRoundIdAndApplicationId(round.getId(), drop.getId()).orElseThrow();
        ReflectionTestUtils.setField(dropMember, "status", RoundMemberStatus.EXCLUDED);
        interviewRoundMemberRepository.save(dropMember);

        givenLeader().when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1));

        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), keep.getId(),
                        InterviewScheduleStatus.ASSIGNED)).isPresent();
        assertThat(interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), drop.getId(),
                        InterviewScheduleStatus.ASSIGNED)).isEmpty();
    }

    @Test
    @DisplayName("마감 전이라도 응답 수집 중이면 자동배정을 실행할 수 있다 — 조기 배정")
    void earlyAssignBeforeDeadlineIsAllowed() {
        InterviewRound round = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(3), null, RoundStatus.COLLECTING));
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        saveRespondedMember(round, "조기전원응답", slot);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(1));
    }

    @Test
    @DisplayName("발송 전이거나 이미 확정된 라운드에는 자동배정을 실행할 수 없다")
    void draftAndScheduledRoundsAreRejected() {
        InterviewRound draft = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        InterviewRound scheduled = saveRound(RoundStatus.SCHEDULED);

        givenLeader().when().post(AUTO_ASSIGN_PATH, draft.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
        givenLeader().when().post(AUTO_ASSIGN_PATH, scheduled.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("응답자가 없는 라운드의 자동배정은 빈 결과로 성공한다")
    void emptyRoundSucceedsWithZeroCounts() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        saveSlot(round, "2026-06-20T14:00:00", 1);

        givenLeader()
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.assignedMemberCount", equalTo(0))
                .body("data.unassignedMemberCount", equalTo(0));
    }

    @Test
    @DisplayName("존재하지 않는 라운드는 404, 타 동아리 운영진은 403 을 받는다")
    void notFoundAndForbiddenGuards() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        User outsider = saveUser("타인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        givenLeader().when().post(AUTO_ASSIGN_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().post(AUTO_ASSIGN_PATH, round.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private io.restassured.specification.RequestSpecification givenLeader() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken);
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

    private Application saveRespondedMember(InterviewRound round, String name, InterviewSlot... slots) {
        Application application = saveInterviewPendingApplication(recruitment, name);
        saveMember(round, application, RoundMemberStatus.RESPONDED);
        for (InterviewSlot slot : slots) {
            interviewAvailabilityRepository.save(
                    InterviewAvailability.create(application.getId(), slot.getId(), round.getId()));
        }
        return application;
    }

    private Long findAssignedSlotId(InterviewRound round, Application application) {
        return interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), application.getId(),
                        InterviewScheduleStatus.ASSIGNED)
                .orElseThrow().getSlotId();
    }
}
```

(※ `findByRoundIdAndApplicationId`(member) 가 레포에 없으면 derived 로 추가: `Optional<InterviewRoundMember> findByRoundIdAndApplicationId(Long roundId, Long applicationId);`)

- [ ] **Step 2: RED 확인** — 컴파일 성공(엔드포인트 블랙박스) + 대부분 FAIL. **커밋하지 않는다.**

---

### Task 5: 구현 (GREEN)

- [ ] **Step 1: 레포 3건**

`InterviewRoundRepository` (import `Lock`·`LockModeType`·`Query`·`Param`):

```java
    /** 자동배정·확정·취소 등 round writer 간 직렬화 (스펙 §7) — @Version 충돌 대신 선두에서 잠근다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM InterviewRound r WHERE r.id = :id")
    Optional<InterviewRound> findByIdForUpdate(@Param("id") Long id);
```

`InterviewScheduleRepository`:

```java
    /**
     * 자동배정 재실행의 draft 교체 (스펙 §6.2). plain @Modifying — 이 TX 는 schedule 을 PC 에
     * 로드하지 않으므로 clear 가 불필요하고, clear 를 쓰면 직전 openAssigning() 의 round dirty
     * 변경이 유실된다 (BE#8 detached 사고의 교훈).
     */
    @Modifying
    @Query("UPDATE InterviewSchedule s SET s.deletedAt = CURRENT_TIMESTAMP "
            + "WHERE s.roundId = :roundId AND s.deletedAt IS NULL")
    void softDeleteByRoundId(@Param("roundId") Long roundId);
```

`InterviewAvailabilityRepository`:

```java
    List<InterviewAvailability> findByRoundId(Long roundId);
```

- [ ] **Step 2: 결과 DTO 2개**

`service/dto/query/AutoAssignResult.java`:

```java
package com.duing.domain.interview.service.dto.query;

public record AutoAssignResult(int assignedMemberCount, int unassignedMemberCount) {}
```

`controller/dto/response/AutoAssignResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.service.dto.query.AutoAssignResult;

public record AutoAssignResponse(int assignedMemberCount, int unassignedMemberCount) {
    public static AutoAssignResponse from(AutoAssignResult result) {
        return new AutoAssignResponse(result.assignedMemberCount(), result.unassignedMemberCount());
    }
}
```

- [ ] **Step 3: 서비스**

`service/InterviewAssignmentService.java`:

```java
package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.query.AutoAssignResult;

public interface InterviewAssignmentService {

    /**
     * 자동배정 (스펙 §6.1·§6.2·§9.1 API 8) — COLLECTING 첫 실행은 ASSIGNING 전이 동반,
     * ASSIGNING 재실행은 활성 draft 전체를 현재 상태 기준으로 재계산한다. RESPONDED 만 대상(Rule 1).
     */
    AutoAssignResult autoAssign(Long roundId, Long currentUserId);
}
```

`service/GeneralInterviewAssignmentService.java`:

```java
package com.duing.domain.interview.service;

import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.MatchingInput;
import com.duing.domain.interview.service.dto.MatchingResult;
import com.duing.domain.interview.service.dto.query.AutoAssignResult;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GeneralInterviewAssignmentService implements InterviewAssignmentService {

    private final InterviewRoundRepository interviewRoundRepository;
    private final InterviewRoundMemberRepository interviewRoundMemberRepository;
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final InterviewRoundAccessor interviewRoundAccessor;
    private final InterviewMatchingService interviewMatchingService;
    private final Clock clock;

    @Override
    @Transactional
    public AutoAssignResult autoAssign(Long roundId, Long currentUserId) {
        // round writer(자동배정·확정·취소) 간 직렬화 — 잠금 조회가 404 를 먼저 판정한다 (스펙 §7).
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);

        if (round.getStatus() == RoundStatus.COLLECTING) {
            round.openAssigning();
        } else if (round.getStatus() != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        // §16-7-2 — 대상 멤버 잠금으로 배정 계산 중 상태 변경(경계 응답 등)과 직렬화한다.
        List<InterviewRoundMember> respondedMembers = interviewRoundMemberRepository
                .findAllByRoundIdAndStatusForUpdate(roundId, RoundMemberStatus.RESPONDED);

        Map<Long, Set<Long>> selectedSlotIdsByApplicationId = interviewAvailabilityRepository
                .findByRoundId(roundId).stream()
                .collect(Collectors.groupingBy(InterviewAvailability::getApplicationId,
                        Collectors.mapping(InterviewAvailability::getSlotId, Collectors.toSet())));

        MatchingInput matchingInput = new MatchingInput(
                respondedMembers.stream()
                        .map(member -> new MatchingInput.ApplicantSelection(
                                member.getApplicationId(),
                                selectedSlotIdsByApplicationId.getOrDefault(
                                        member.getApplicationId(), Set.of())))
                        .toList(),
                interviewSlotRepository.findByRoundIdOrderByStartTimeAsc(roundId).stream()
                        .map(slot -> new MatchingInput.SlotState(
                                slot.getId(), slot.getStartTime(), slot.getCapacity()))
                        .toList());

        // 재실행 교체 (§6.2) — 첫 실행에선 no-op 라 분기하지 않는다.
        interviewScheduleRepository.softDeleteByRoundId(roundId);

        MatchingResult matchingResult = interviewMatchingService.match(matchingInput);

        LocalDateTime now = LocalDateTime.now(clock);
        interviewScheduleRepository.saveAll(matchingResult.assigned().stream()
                .map(assignment -> InterviewSchedule.create(
                        assignment.applicationId(), assignment.slotId(), roundId, now))
                .toList());

        return new AutoAssignResult(
                matchingResult.assigned().size(),
                matchingResult.unassignedApplicationIds().size());
    }
}
```

(※ `InterviewSchedule.create` 의 실제 시그니처를 먼저 읽고 인자 순서를 맞출 것 — BE#6 테스트 전례: `create(applicationId, slotId, roundId, assignedAt)`.)

- [ ] **Step 4: Api + Controller**

`api/LeaderInterviewAssignmentApi.java`:

```java
package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.response.AutoAssignResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

@Tag(name = "면접 배정(운영진)", description = "면접 라운드 자동배정")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderInterviewAssignmentApi {

    @Operation(
            summary = "면접 자동배정 실행",
            description = "응답 완료(RESPONDED) 멤버를 그리디(선택지 적은 지원자 우선, 잔여 수용 인원 최대 슬롯)로 배정한다. "
                    + "응답 수집 중이면 배정 검토(ASSIGNING) 단계로 전이하며, 배정 검토 중 재실행하면 기존 draft 를 "
                    + "현재 상태 기준으로 재계산한다. 가능없음·미응답·제외 멤버는 대상이 아니다. "
                    + "멤버 확정(ASSIGNED 전이)·알림은 확정 API 에서만 일어난다."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/auto-assign")
    ResponseEntity<ApiResponse<AutoAssignResponse>> autoAssign(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

`controller/LeaderInterviewAssignmentController.java`:

```java
package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.LeaderInterviewAssignmentApi;
import com.duing.domain.interview.controller.dto.response.AutoAssignResponse;
import com.duing.domain.interview.service.InterviewAssignmentService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class LeaderInterviewAssignmentController implements LeaderInterviewAssignmentApi {

    private final InterviewAssignmentService interviewAssignmentService;

    @Override
    public ResponseEntity<ApiResponse<AutoAssignResponse>> autoAssign(
            @PathVariable Long roundId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(AutoAssignResponse.from(
                interviewAssignmentService.autoAssign(roundId, currentUser.id()))));
    }
}
```

- [ ] **Step 5: GREEN 확인** — 12건 PASS

---

### Task 6: 전체 검증 + 스펙 보정 + 커밋

- [ ] **Step 1:** `./gradlew test` → BUILD SUCCESSFUL (804 + 2 + 2 + 12 = 820건 예상)

- [ ] **Step 2: 스펙 §16-7-3 명문화** — `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` 의 `7-2.` 항목 아래에 추가:

```markdown
7-3. **수용된 잔여 윈도우 (경계 응답, BE#9 설계 판정)**: 응답 TX 가 기간 검사(COLLECTING)를 통과한 직후 자동배정이 전이·배정·커밋하면, 그 마지막 순간 응답 1건은 draft 에 미반영될 수 있다. availability·RESPONDED 데이터는 일관하므로 모순이 아니며, ASSIGNING 재실행과 확정 게이트(§6.3 respondedUnassigned)가 노출·흡수한다 — 응답 측 round 공유 잠금 도입은 과설계로 보류. ASSIGNING 진입 후 응답은 기존대로 409.
```

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src docs/superpowers/specs
git commit -m "feat(backend): 면접 자동배정 API — 그리디 draft 배정"
```

---

### Task 7: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [ ] **Step 1: self-check 7항목** (기존 동일 명령)

- [ ] **Step 2: push + PR** (자동 머지 금지. **리뷰 단계에서 codex adversarial 필수**)

```bash
git push -u origin feat/interview-auto-assign
gh pr create --base develop --title "feat(backend): 면접 자동배정 API" --body "$(cat <<'EOF'
## 🚀 작업 내용

운영진이 버튼 한 번으로 응답자들을 면접 슬롯에 배정하는 자동배정입니다. 응답 수집 중 라운드면 배정 검토 단계로 전이하면서 배정하고, 배정 검토 중이면 기존 draft 를 현재 상태 기준으로 갈아엎고 재계산합니다. 배정은 어디까지나 draft — 멤버는 응답 완료 상태를 유지하고, 확정(ASSIGNED 전이·알림)은 확정 API 의 몫입니다.

매칭은 기존 그리디 순수 함수를 재사용하되 슬롯 선택 기준을 설계 문서대로 고쳤습니다 — "현재 배정 수가 가장 적은 슬롯"이 아니라 "잔여 수용 인원이 가장 많은 슬롯"입니다. capacity 가 모두 같으면 두 기준이 일치해 기존 테스트는 그대로 통과하고, 다른 capacity 에서 갈라지는 차별 테스트를 추가해 고정했습니다. 가능없음 응답자(수동 처리 전용)·미응답·제외 멤버는 대상에서 빠지고, "응답했는데 만석으로 미배정"만 미배정 카운트로 보고됩니다 — 확정 게이트의 경고 모집단과 같은 정의입니다.

## 🤔 고민했던 내용

- 동시성: 라운드 행을 잠가 동시 자동배정·향후 확정/취소와 직렬화하고, 대상 멤버도 잠가(§16-7-2 상속) 배정 계산 중 상태 변경과 직렬화했습니다. 잠금 순서 감사(배정: 라운드→멤버 / 응답: 지원서→멤버→슬롯 / 재초대: 멤버만)로 교착 사이클이 없음을 확인했습니다.
- "기간 검사를 통과한 마지막 순간의 응답 1건이 draft 에 빠지는" 경계 윈도우는 수용하고 스펙에 명문화했습니다 — 데이터 모순이 없고 재실행·확정 게이트가 흡수하므로, 응답마다 라운드 공유 잠금을 잡는 건 과설계라 판단했습니다.
- draft 교체용 일괄 soft delete 는 의도적으로 plain @Modifying 입니다 — clear 를 쓰면 직전 라운드 전이의 dirty 변경이 유실됩니다(BE#8 detached 사고의 교훈을 주석으로 고정).
- 마감 전이라도 수집 중이면 실행 가능 — 전원 조기 응답 시 조기 배정 시나리오입니다.
- 라운드 인증 헬퍼가 3번째 사용처를 만나 rule of three 로 추출했습니다 (별도 refactor 커밋).

## 💬 리뷰 중점사항

- 그리디 비교자(멤버: 선택 적은 순 / 슬롯: 잔여 최대, tie 시간→id)가 §6.1 과 1:1 인지.
- 재실행의 soft delete → 재계산 순서와 round/멤버 잠금이 race 를 실제로 막는지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §5.1·§6.1·§6.2·§7·§9.1 API 8·§16-7-2 (이번 설계로 §16-7-3 수용 윈도우 명문화)
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §6.1(비교자 — 멤버 순서·슬롯 잔여 최대·tie) → Task 2 + 통합 3·4, §6.2(draft semantics — 전이·RESPONDED 유지·재실행 교체) → Task 5 + 통합 1·2·8, §5.5 Rule 1 → 통합 6, §9.1 API 8(허용 상태) → 가드 + 통합 9·10, §7(round 잠금) → findByIdForUpdate, §16-7-2(멤버 잠금) → findAllByRoundIdAndStatusForUpdate 재사용, 경계 윈도우 → §16-7-3 명문화(Task 6).
- **플레이스홀더**: 없음.
- **타입 일관성**: `MatchingInput.ApplicantSelection(Long, Set<Long>)`·`SlotState(Long, LocalDateTime, int)`·`MatchingResult.unassignedApplicationIds()` 가 기존 DTO 와 일치(소스 확인 완료), `AutoAssignResult` ↔ `AutoAssignResponse` 매핑 일치, `findByRoundIdAndApplicationIdAndStatus`(BE#7)·`findByRoundIdAndStatus`(BE#6)·`findAllByRoundIdAndStatusForUpdate`(BE#8) 기존재 확인.
- **주의 메모**: ① 멤버 단건 조회 `findByRoundIdAndApplicationId` 가 레포에 없으면 derived 추가 (Task 4 주석). ② `InterviewSchedule.create` 인자 순서는 구현 시 소스 확인. ③ 테스트 8(재실행)의 EXCLUDED 셋업은 리플렉션 — BE#10 의 제외 API 전이라 직접 상태 주입 (기존 전례). ④ accessor 추출 시 기존 본문이 정답 — 계획 코드와 다르면 기존 유지.

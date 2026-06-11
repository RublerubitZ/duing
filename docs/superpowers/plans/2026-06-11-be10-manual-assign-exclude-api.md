# BE#10 — 수동 배정/해제/제외 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 6 은 리뷰 후 컨트롤러가 수행한다.**

**Goal:** 멤버 단위 운영 3종 — 수동 배정/재배정(`PUT /leader/interview-rounds/{roundId}/members/{memberId}/schedule`, capacity 하드 체크), 배정 해제(`DELETE` 동일 경로), 제외(`POST .../members/{memberId}/exclude` — EXCLUDED 전이 + 활성 schedule 정리 + 대기열 즉시 복귀) (스펙 §9.1 API 9·10·§16-3).

**Architecture:** BE#9 의 `InterviewAssignmentService` 에 3 메서드를 추가하고 **§16-7-4 전역 잠금 순서를 상속**한다 — 배정 = round→slot→member, 해제/제외 = round→member. 수동 배정도 draft semantics(§6.2): 멤버 상태 불변, schedule 만 per-member 교체. 제외는 멤버 도메인 전이 `exclude()` (TDD — 허용 셋 {INVITED, RESPONDED, NO_AVAILABLE_SLOT}) + §16-3(활성 schedule soft delete — 누락 시 제외된 지원자에게 리마인더 발송·dashboard 잔존) + 대기열 복귀(placement-active 해제는 상태 전이 자체가 의미 — 후보 API 재노출을 cross-API 스모크로 고정).

**Tech Stack:** Spring Boot 3.4 / Java 21 / RestAssured + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.2(전이)·§6.2(draft·수동 수정)·§9.1 API 9·10·§16-3·§16-7-2·§16-7-4
**리뷰 정책:** duing-code-reviewer + codex 기본 + **codex adversarial 필수** (스펙 §12 — 권한·상태전이·동시성·데이터무결성)

---

## 핵심 결정

1. **수동 배정 허용 멤버 = 비EXCLUDED 화이트리스트 {INVITED, RESPONDED, NO_AVAILABLE_SLOT}**: 스펙 문언 "NO_AVAILABLE_SLOT 멤버 포함 가능"은 "응답 기반이 아닌 멤버도 가능"의 예시 — 마감 후 전화 조율한 미응답자(INVITED) 배정도 운영상 필요(§6.3 (a)의 FE 액션 [수동 배정]). ASSIGNED 는 확정 후(라운드 SCHEDULED)라 phase 가드가 선차단 — 멤버 검사는 EXCLUDED 거부로 표현.
2. **수동 배정 = per-member schedule 교체**: 본인 활성 schedule soft delete → capacity 카운트(잠금 하) → 신규 생성. **본인 삭제가 카운트보다 먼저**라 "만석 슬롯 내 본인 재배정(멱등)"이 자연 통과하고, 타 슬롯 만석은 `SlotCapacityExceeded`(409) 하드 체크.
3. **phase 가드**: 배정·해제는 **ASSIGNING 한정**(§9.1 API 9). 제외는 **DRAFT·COLLECTING·ASSIGNING**(§16-3 의 "ASSIGNING 중" 은 schedule 정리 의무의 맥락이고, 제외 자체는 발송 전 명단 정리·수집 중 이탈 통보 등 전 진행 단계에서 필요 — SCHEDULED 는 터미널·노쇼는 합불 처리(§14), CANCELLED 는 무의미). 위반은 `RoundTransitionNotAllowed`(409).
4. **잠금 (§16-7-4 상속)**: 세 경로 모두 round `findByIdForUpdate` 선두(자동배정 재실행·향후 확정/취소와 직렬화 — 재실행이 수동 배정을 갈아엎는 동작도 직렬화돼 결정적이 된다) → 배정만 slot `findByIdForUpdate`(capacity 체크 정합) → 멤버를 쓰는 배정·제외는 member `findByIdForUpdate`(§16-7-2 — 동시 "배정 vs 제외" 가 "제외된 멤버에 배정 잔존" 을 만들지 못하게 직렬화). 해제는 멤버를 쓰지 않으므로 member 잠금 불요(존재 검증만).
5. **application 잠금(§16-7) 불요 — 근거 명시**: §16-7 의 목적은 "합불 처리된 지원자가 활성 멤버십을 얻는" 모순 차단 — 멤버십을 **만들거나 재활성화**하는 writer 용이다. 제외는 멤버십을 **종결**하는 방향이라 그 모순을 만들 수 없고, 동시 createRound 의 placement-active 검증은 커밋된 상태만 보므로(미커밋 제외 = active 로 보임 = 보수적 누락) 어느 순서든 불변식이 깨지지 않는다.
6. **제외 시 availability 는 잔존 수용**: §16-3 은 schedule 만 명령한다. EXCLUDED 의 availability 는 자동배정 입력(RESPONDED 한정)에 안 들어가고 확정에도 무관 — dashboard 슬롯 selectedCount 노이즈만 있으며 멤버 테이블에서 EXCLUDED 가 보이므로 운영 혼란 없음.
7. **신규 예외 3종**: `SlotCapacityExceeded`(409)·`ScheduleNotFound`(404 — 해제할 활성 배정 없음, 멱등 204 대신 정직한 404)·`MemberNotFound`(404 — 라운드 무소속 memberId). 슬롯 타 라운드/부재는 `InvalidSlotSelection`(400) 재사용 (BE#8 전례).
8. **응답 전부 204** — 액션 + dashboard invalidate 패턴 (respond PUT 전례).
9. **알림 없음** — INTERVIEW_SCHEDULED 는 확정(§6.3) 전용, 제외 통지는 스펙 §8 에 없음.

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Modify | `entity/InterviewRoundMember.java` + `entity/InterviewRoundDomainTest.java` | `exclude()` TDD 3건 |
| Modify | `exception/InterviewException.java` | `SlotCapacityExceeded`(409)·`ScheduleNotFound`(404)·`MemberNotFound`(404) |
| Create | `controller/dto/request/AssignScheduleRequest.java` | `{slotId}` |
| Modify | `service/InterviewAssignmentService.java` + `GeneralInterviewAssignmentService.java` | `assignSchedule`/`unassignSchedule`/`excludeMember` |
| Modify | `api/LeaderInterviewAssignmentApi.java` + `controller/LeaderInterviewAssignmentController.java` | PUT·DELETE·POST (204) |
| Test Create | `controller/LeaderInterviewMemberManageControllerTest.java` | RestAssured 16건 |

신규 레포 메서드 0건 — round/slot/member `findByIdForUpdate`·`countBySlotIdAndStatus`·`findByRoundIdAndApplicationIdAndStatus` 전부 기존재. 커밋 2개: ① exclude 도메인 TDD ② 운영 3종 API.

---

### Task 1: 브랜치 생성

- [x] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-member-manage
```

---

### Task 2: `exclude()` 도메인 전이 (TDD)

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/interview/entity/InterviewRoundDomainTest.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/entity/InterviewRoundMember.java`

- [x] **Step 1: 단위 테스트 3건 추가 (RED)**

```java
    @Test
    @DisplayName("초대·응답·가능없음 상태의 멤버는 제외할 수 있다")
    void nonTerminalMembersCanBeExcluded() {
        InterviewRoundMember invited = InterviewRoundMember.invite(1L, 10L);
        InterviewRoundMember responded = InterviewRoundMember.invite(1L, 11L);
        responded.markResponded();
        InterviewRoundMember noSlot = InterviewRoundMember.invite(1L, 12L);
        noSlot.reportNoAvailableSlot("주말만");

        invited.exclude();
        responded.exclude();
        noSlot.exclude();

        assertThat(invited.getStatus()).isEqualTo(RoundMemberStatus.EXCLUDED);
        assertThat(responded.getStatus()).isEqualTo(RoundMemberStatus.EXCLUDED);
        assertThat(noSlot.getStatus()).isEqualTo(RoundMemberStatus.EXCLUDED);
    }

    @Test
    @DisplayName("제외해도 가능없음 멤버가 남긴 대체 가능시간 텍스트는 보존된다")
    void excludePreservesAlternativeText() {
        InterviewRoundMember member = InterviewRoundMember.invite(1L, 10L);
        member.reportNoAvailableSlot("평일 저녁만 가능합니다");

        member.exclude();

        assertThat(member.getAlternativeAvailabilityText()).isEqualTo("평일 저녁만 가능합니다");
    }

    @Test
    @DisplayName("이미 제외됐거나 배정 확정된 멤버는 다시 제외할 수 없다")
    void terminalMembersCannotBeExcluded() {
        InterviewRoundMember excluded = InterviewRoundMember.invite(1L, 10L);
        excluded.exclude();
        InterviewRoundMember assigned = InterviewRoundMember.invite(1L, 11L);
        ReflectionTestUtils.setField(assigned, "status", RoundMemberStatus.ASSIGNED);

        assertThatThrownBy(excluded::exclude)
                .isInstanceOf(InterviewException.MemberTransitionNotAllowed.class);
        assertThatThrownBy(assigned::exclude)
                .isInstanceOf(InterviewException.MemberTransitionNotAllowed.class);
    }
```

- [x] **Step 2: RED 확인** — `./gradlew test --tests "com.duing.domain.interview.entity.InterviewRoundDomainTest"` → 컴파일 실패

- [x] **Step 3: 구현 (GREEN)** — `InterviewRoundMember` 의 `reportNoAvailableSlot` 아래에:

```java
    /**
     * 제외: 라운드 종결의 유일한 멤버 경로 (§5.2 — soft delete 미사용, §16-5). 지원자에겐
     * 중립 phase(WAITING_NEXT_ROUND)로만 보이고 application 은 INTERVIEW_PENDING 유지라
     * 즉시 대기열 복귀한다. 가능없음 텍스트는 운영 기록으로 보존한다.
     */
    public void exclude() {
        if (this.status == RoundMemberStatus.ASSIGNED || this.status == RoundMemberStatus.EXCLUDED) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }
        this.status = RoundMemberStatus.EXCLUDED;
    }
```

- [x] **Step 4: GREEN 확인** — 도메인 17건(기존 14+신규 3) PASS

- [x] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 라운드 멤버 제외 전이(exclude) 추가"
```

---

### Task 3: 통합 테스트 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/LeaderInterviewMemberManageControllerTest.java`

- [x] **Step 1: 테스트 작성** (`InterviewControllerTestSupport` 상속)

```java
package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

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

// 멤버 단위 운영 3종 — 수동 배정/재배정(capacity 하드 체크·draft semantics), 해제, 제외(§16-3
// schedule 정리 + 대기열 즉시 복귀). 잠금은 §16-7-4 순서(round→slot→member)를 상속한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewMemberManageControllerTest extends InterviewControllerTestSupport {

    private static final String SCHEDULE_PATH =
            "/api/v1/leader/interview-rounds/{roundId}/members/{memberId}/schedule";
    private static final String EXCLUDE_PATH =
            "/api/v1/leader/interview-rounds/{roundId}/members/{memberId}/exclude";
    private static final String CANDIDATES_PATH =
            "/api/v1/leader/recruitments/{recruitmentId}/interview-round-candidates";

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
        Club club = saveActiveClub("운영동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "운영모집");
    }

    // ── 수동 배정 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("응답한 멤버를 슬롯에 수동 배정하면 schedule 이 생기고 멤버 상태는 그대로다")
    void respondedMemberCanBeManuallyAssigned() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "응답자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);

        assignSlot(round, member, slot).statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(findActiveSchedule(round, application)).isPresent();
        assertThat(interviewRoundMemberRepository.findById(member.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundMemberStatus.RESPONDED);
    }

    @Test
    @DisplayName("가능없음·미응답 멤버도 운영진 재량으로 수동 배정할 수 있다")
    void noSlotAndInvitedMembersCanBeAssigned() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 2);
        InterviewRoundMember noSlotMember = saveMember(round,
                saveInterviewPendingApplication(recruitment, "가능없음"), RoundMemberStatus.NO_AVAILABLE_SLOT);
        InterviewRoundMember invitedMember = saveMember(round,
                saveInterviewPendingApplication(recruitment, "미응답"), RoundMemberStatus.INVITED);

        assignSlot(round, noSlotMember, slot).statusCode(HttpStatus.NO_CONTENT.value());
        assignSlot(round, invitedMember, slot).statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("다른 슬롯으로 재배정하면 기존 배정이 교체된다")
    void reassignReplacesExistingSchedule() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot oldSlot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewSlot newSlot = saveSlot(round, "2026-06-20T15:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "재배정자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);
        assignSlot(round, member, oldSlot).statusCode(HttpStatus.NO_CONTENT.value());

        assignSlot(round, member, newSlot).statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(findActiveSchedule(round, application).orElseThrow().getSlotId())
                .isEqualTo(newSlot.getId());
    }

    @Test
    @DisplayName("정원이 찬 슬롯에는 수동 배정할 수 없다 — capacity 하드 체크")
    void fullSlotRejectsManualAssign() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewRoundMember occupant = saveMember(round,
                saveInterviewPendingApplication(recruitment, "선점자"), RoundMemberStatus.RESPONDED);
        assignSlot(round, occupant, slot).statusCode(HttpStatus.NO_CONTENT.value());
        InterviewRoundMember latecomer = saveMember(round,
                saveInterviewPendingApplication(recruitment, "후발"), RoundMemberStatus.RESPONDED);

        assignSlot(round, latecomer, slot).statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("만석 슬롯이라도 그 자리에 이미 배정된 본인의 재배정은 허용된다 — 멱등")
    void reassignToSameFullSlotIsIdempotent() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "본인");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);
        assignSlot(round, member, slot).statusCode(HttpStatus.NO_CONTENT.value());

        assignSlot(round, member, slot).statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(findActiveSchedule(round, application).orElseThrow().getSlotId())
                .isEqualTo(slot.getId());
    }

    @Test
    @DisplayName("다른 라운드의 슬롯으로는 배정할 수 없다")
    void slotFromOtherRoundIsRejected() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewRound otherRound = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot foreignSlot = saveSlot(otherRound, "2026-06-20T14:00:00", 1);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "엉뚱"), RoundMemberStatus.RESPONDED);

        assignSlot(round, member, foreignSlot).statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("배정 검토 단계가 아닌 라운드에는 수동 배정할 수 없다")
    void nonAssigningRoundRejectsManualAssign() {
        InterviewRound round = saveRound(RoundStatus.COLLECTING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "수집중"), RoundMemberStatus.RESPONDED);

        assignSlot(round, member, slot).statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("제외된 멤버는 수동 배정할 수 없다")
    void excludedMemberCannotBeAssigned() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "제외자"), RoundMemberStatus.EXCLUDED);

        assignSlot(round, member, slot).statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("라운드에 속하지 않은 멤버 ID 로는 배정할 수 없다")
    void memberOfOtherRoundIsNotFound() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        InterviewRound otherRound = saveRound(RoundStatus.ASSIGNING);
        InterviewRoundMember foreignMember = saveMember(otherRound,
                saveInterviewPendingApplication(recruitment, "남의멤버"), RoundMemberStatus.RESPONDED);

        assignSlot(round, foreignMember, slot).statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 해제 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("배정을 해제하면 활성 schedule 이 사라진다")
    void unassignRemovesActiveSchedule() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "해제자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);
        assignSlot(round, member, slot).statusCode(HttpStatus.NO_CONTENT.value());

        givenLeader()
                .when().delete(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(findActiveSchedule(round, application)).isEmpty();
    }

    @Test
    @DisplayName("배정이 없는 멤버의 해제는 404 를 반환한다")
    void unassignWithoutScheduleReturnsNotFound() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "무배정"), RoundMemberStatus.RESPONDED);

        givenLeader()
                .when().delete(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("확정된 라운드의 배정은 해제할 수 없다")
    void scheduledRoundRejectsUnassign() {
        InterviewRound round = saveRound(RoundStatus.SCHEDULED);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "확정후"), RoundMemberStatus.ASSIGNED);

        givenLeader()
                .when().delete(SCHEDULE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    // ── 제외 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("배정 검토 중 멤버를 제외하면 활성 배정이 정리되고 후보 대기열로 즉시 복귀한다")
    void excludeCleansScheduleAndReturnsToQueue() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00", 1);
        Application application = saveInterviewPendingApplication(recruitment, "복귀자");
        InterviewRoundMember member = saveMember(round, application, RoundMemberStatus.RESPONDED);
        assignSlot(round, member, slot).statusCode(HttpStatus.NO_CONTENT.value());

        givenLeader()
                .when().post(EXCLUDE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        InterviewRoundMember excluded = interviewRoundMemberRepository
                .findById(member.getId()).orElseThrow();
        assertThat(excluded.getStatus()).isEqualTo(RoundMemberStatus.EXCLUDED);
        // §16-3 — 제외된 지원자에게 리마인더가 가거나 dashboard 에 배정이 잔존하면 안 된다.
        assertThat(findActiveSchedule(round, application)).isEmpty();
        // 대기열 즉시 복귀 — 후보 API 에 다시 노출된다 (placement-active 해제의 cross-API 검증).
        givenLeader()
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.applicationId", hasItem(application.getId().intValue()));
    }

    @Test
    @DisplayName("발송 전·응답 수집 중에도 멤버를 제외할 수 있다")
    void draftAndCollectingRoundsAllowExclude() {
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        InterviewRoundMember draftMember = saveMember(draftRound,
                saveInterviewPendingApplication(recruitment, "명단정리"), RoundMemberStatus.INVITED);
        InterviewRound collectingRound = saveRound(RoundStatus.COLLECTING);
        InterviewRoundMember collectingMember = saveMember(collectingRound,
                saveInterviewPendingApplication(recruitment, "수집중이탈"), RoundMemberStatus.INVITED);

        givenLeader().when().post(EXCLUDE_PATH, draftRound.getId(), draftMember.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        givenLeader().when().post(EXCLUDE_PATH, collectingRound.getId(), collectingMember.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("이미 제외된 멤버를 다시 제외하거나 확정된 라운드에서 제외할 수 없다")
    void terminalExcludeIsRejected() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewRoundMember excluded = saveMember(round,
                saveInterviewPendingApplication(recruitment, "이미제외"), RoundMemberStatus.EXCLUDED);
        InterviewRound scheduledRound = saveRound(RoundStatus.SCHEDULED);
        InterviewRoundMember assignedMember = saveMember(scheduledRound,
                saveInterviewPendingApplication(recruitment, "확정자"), RoundMemberStatus.ASSIGNED);

        givenLeader().when().post(EXCLUDE_PATH, round.getId(), excluded.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
        givenLeader().when().post(EXCLUDE_PATH, scheduledRound.getId(), assignedMember.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("존재하지 않는 라운드는 404, 타 동아리 운영진은 403 을 받는다")
    void notFoundAndForbiddenGuards() {
        InterviewRound round = saveRound(RoundStatus.ASSIGNING);
        InterviewRoundMember member = saveMember(round,
                saveInterviewPendingApplication(recruitment, "본인"), RoundMemberStatus.RESPONDED);
        User outsider = saveUser("타인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        givenLeader().when().post(EXCLUDE_PATH, 999_999L, member.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().post(EXCLUDE_PATH, round.getId(), member.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private io.restassured.specification.RequestSpecification givenLeader() {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken);
    }

    private io.restassured.response.ValidatableResponse assignSlot(
            InterviewRound round, InterviewRoundMember member, InterviewSlot slot) {
        return givenLeader()
                .contentType(ContentType.JSON)
                .body(Map.of("slotId", slot.getId()))
                .when().put(SCHEDULE_PATH, round.getId(), member.getId())
                .then();
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

    private java.util.Optional<InterviewSchedule> findActiveSchedule(
            InterviewRound round, Application application) {
        return interviewScheduleRepository.findByRoundIdAndApplicationIdAndStatus(
                round.getId(), application.getId(), InterviewScheduleStatus.ASSIGNED);
    }
}
```

- [x] **Step 2: RED 확인** — 컴파일 성공 + 대부분 FAIL. **커밋하지 않는다.**

---

### Task 4: 구현 (GREEN)

- [x] **Step 1: 예외 3종** (`InterviewException`)

409 섹션:

```java
    public static final class SlotCapacityExceeded extends InterviewException {
        private static final String MESSAGE = "해당 슬롯의 수용 인원이 가득 찼습니다.";
        public SlotCapacityExceeded() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
```

404 섹션:

```java
    public static final class ScheduleNotFound extends InterviewException {
        private static final String MESSAGE = "해제할 면접 배정이 없습니다.";
        public ScheduleNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static final class MemberNotFound extends InterviewException {
        private static final String MESSAGE = "해당 면접 라운드의 멤버가 아닙니다.";
        public MemberNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
```

- [x] **Step 2: request DTO**

`controller/dto/request/AssignScheduleRequest.java`:

```java
package com.duing.domain.interview.controller.dto.request;

import jakarta.validation.constraints.NotNull;

public record AssignScheduleRequest(
        @NotNull(message = "배정할 슬롯을 선택해야 합니다.")
        Long slotId
) {}
```

- [x] **Step 3: 서비스**

`InterviewAssignmentService` 에 추가:

```java
    /**
     * 수동 배정/재배정 (스펙 §9.1 API 9) — ASSIGNING 한정, 비제외 멤버 전부 가능
     * (가능없음·미응답 포함 — 운영진 재량), capacity 하드 체크, per-member schedule 교체.
     * 멤버 상태는 불변 (draft semantics — ASSIGNED 전이는 확정 전용).
     */
    void assignSchedule(Long roundId, Long memberId, Long slotId, Long currentUserId);

    /** 배정 해제 (스펙 §9.1 API 9) — ASSIGNING 한정, 활성 배정이 없으면 404. */
    void unassignSchedule(Long roundId, Long memberId, Long currentUserId);

    /**
     * 멤버 제외 (스펙 §9.1 API 10) — DRAFT·COLLECTING·ASSIGNING 에서 EXCLUDED 전이 +
     * 활성 schedule 정리(§16-3) + 대기열 즉시 복귀 (application 은 INTERVIEW_PENDING 유지).
     */
    void excludeMember(Long roundId, Long memberId, Long currentUserId);
```

`GeneralInterviewAssignmentService` 에 구현 추가 (import `InterviewRoundMember`·`InterviewSlot`(기존재)·`InterviewScheduleStatus`·`Set` 추가분):

```java
    private static final Set<RoundStatus> EXCLUDABLE_ROUND_STATUSES =
            Set.of(RoundStatus.DRAFT, RoundStatus.COLLECTING, RoundStatus.ASSIGNING);

    @Override
    @Transactional
    public void assignSchedule(Long roundId, Long memberId, Long slotId, Long currentUserId) {
        // 잠금 순서 §16-7-4: round → slot → member.
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);
        if (round.getStatus() != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        InterviewSlot slot = interviewSlotRepository.findByIdForUpdate(slotId)
                .filter(found -> found.getRoundId().equals(roundId))
                .orElseThrow(InterviewException.InvalidSlotSelection::new);
        InterviewRoundMember member = getLockedMemberOfRound(roundId, memberId);
        if (member.getStatus() == RoundMemberStatus.EXCLUDED) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }

        // 본인 기존 배정을 먼저 비워야 "만석 슬롯 내 본인 재배정(멱등)" 이 자연 통과한다.
        removeActiveSchedule(roundId, member.getApplicationId());
        long assignedCount = interviewScheduleRepository
                .countBySlotIdAndStatus(slotId, InterviewScheduleStatus.ASSIGNED);
        if (assignedCount >= slot.getCapacity()) {
            throw new InterviewException.SlotCapacityExceeded();
        }
        interviewScheduleRepository.save(InterviewSchedule.create(
                member.getApplicationId(), slotId, roundId, LocalDateTime.now(clock)));
    }

    @Override
    @Transactional
    public void unassignSchedule(Long roundId, Long memberId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);
        if (round.getStatus() != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        // 멤버 행을 쓰지 않으므로 멤버 잠금은 불요 — 존재·소속 검증만 한다.
        InterviewRoundMember member = interviewRoundMemberRepository.findById(memberId)
                .filter(found -> found.getRoundId().equals(roundId))
                .orElseThrow(InterviewException.MemberNotFound::new);
        InterviewSchedule schedule = interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(roundId, member.getApplicationId(),
                        InterviewScheduleStatus.ASSIGNED)
                .orElseThrow(InterviewException.ScheduleNotFound::new);
        interviewScheduleRepository.delete(schedule);
    }

    @Override
    @Transactional
    public void excludeMember(Long roundId, Long memberId, Long currentUserId) {
        // 잠금 순서 §16-7-4: round → member. round 잠금이 자동배정 재실행·향후 확정/취소와
        // 직렬화하고, 멤버 잠금(§16-7-2)이 동시 "배정 vs 제외" 의 잔존 배정을 차단한다.
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);
        if (!EXCLUDABLE_ROUND_STATUSES.contains(round.getStatus())) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        InterviewRoundMember member = getLockedMemberOfRound(roundId, memberId);
        member.exclude();
        // §16-3 — 누락 시 제외된 지원자에게 리마인더가 발송되고 dashboard 에 배정이 잔존한다.
        removeActiveSchedule(roundId, member.getApplicationId());
    }

    private InterviewRoundMember getLockedMemberOfRound(Long roundId, Long memberId) {
        return interviewRoundMemberRepository.findByIdForUpdate(memberId)
                .filter(found -> found.getRoundId().equals(roundId))
                .orElseThrow(InterviewException.MemberNotFound::new);
    }

    private void removeActiveSchedule(Long roundId, Long applicationId) {
        interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(roundId, applicationId,
                        InterviewScheduleStatus.ASSIGNED)
                .ifPresent(interviewScheduleRepository::delete);
    }
```

(※ `delete` 는 `@SQLDelete` soft delete 경로 — BE#0~1 의 엔티티 설정 그대로. `InterviewScheduleStatus`·`Set` import 추가, 필드 추가 없음 — 전부 기존 의존.)

- [x] **Step 4: Api + Controller**

`LeaderInterviewAssignmentApi` 에 추가 (import `AssignScheduleRequest`·`Valid`·`RequestBody`·`PutMapping`·`DeleteMapping`):

```java
    @Operation(
            summary = "면접 수동 배정/재배정",
            description = "멤버를 지정 슬롯에 배정한다 (배정 검토 단계 한정). 가능없음·미응답 멤버도 운영진 재량으로 "
                    + "배정할 수 있고, 기존 배정은 교체된다. 정원이 찬 슬롯은 409 — 단 같은 슬롯 내 본인 재배정은 허용된다. "
                    + "멤버 상태는 바뀌지 않는다 (확정 시점에만 ASSIGNED 전이)."
    )
    @PutMapping("/leader/interview-rounds/{roundId}/members/{memberId}/schedule")
    ResponseEntity<ApiResponse<Void>> assignSchedule(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @Valid @RequestBody AssignScheduleRequest assignScheduleRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 배정 해제",
            description = "멤버의 활성 배정을 해제한다 (배정 검토 단계 한정). 활성 배정이 없으면 404."
    )
    @DeleteMapping("/leader/interview-rounds/{roundId}/members/{memberId}/schedule")
    ResponseEntity<ApiResponse<Void>> unassignSchedule(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 라운드 멤버 제외",
            description = "멤버를 라운드에서 제외한다 (발송 전·응답 수집·배정 검토 단계). 활성 배정이 함께 정리되고, "
                    + "지원서는 면접 대상 상태를 유지해 후보 대기열로 즉시 복귀한다. 지원자에게는 제외 사실이 "
                    + "노출되지 않는다 (중립 단계로 표시)."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/members/{memberId}/exclude")
    ResponseEntity<ApiResponse<Void>> excludeMember(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`LeaderInterviewAssignmentController` 에 구현 추가:

```java
    @Override
    public ResponseEntity<ApiResponse<Void>> assignSchedule(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @Valid @RequestBody AssignScheduleRequest assignScheduleRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewAssignmentService.assignSchedule(
                roundId, memberId, assignScheduleRequest.slotId(), currentUser.id());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> unassignSchedule(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewAssignmentService.unassignSchedule(roundId, memberId, currentUser.id());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> excludeMember(
            @PathVariable Long roundId,
            @PathVariable Long memberId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewAssignmentService.excludeMember(roundId, memberId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
```

- [x] **Step 5: GREEN 확인** — 16건 PASS

---

### Task 5: 전체 검증 + 커밋

- [x] **Step 1:** `./gradlew test` → BUILD SUCCESSFUL (820 + 3 + 16 = 839건 예상)

- [x] **Step 2:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 면접 수동 배정·해제·멤버 제외 API"
```

---

### Task 6: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [x] **Step 1: self-check 7항목** (기존 동일 명령)

- [x] **Step 2: push + PR** (자동 머지 금지. **리뷰 단계에서 codex adversarial 필수**)

```bash
git push -u origin feat/interview-member-manage
gh pr create --base develop --title "feat(backend): 면접 수동 배정·해제·멤버 제외 API" --body "$(cat <<'EOF'
## 🚀 작업 내용

자동배정이 채우지 못하는 빈틈을 운영진이 직접 메우는 멤버 단위 운영 3종입니다. 수동 배정은 배정 검토 단계에서 멤버를 지정 슬롯에 넣거나 옮기고 — "가능한 시간이 없다"고 답한 지원자나 미응답자도 전화로 조율했다면 배정할 수 있습니다 — 정원이 찬 슬롯은 거부하되 같은 자리의 본인 재배정은 멱등 통과합니다. 해제는 배정을 비우고, 제외는 멤버를 라운드에서 내보냅니다.

제외가 이 PR 의 핵심 흐름입니다: 멤버는 EXCLUDED 로 종결되지만 지원서는 면접 대상 상태를 유지해 후보 대기열로 즉시 복귀하고(다음 라운드에서 재선정 가능), 설계 문서 §16-3 대로 활성 배정이 함께 정리되어 제외된 지원자에게 리마인더가 가거나 dashboard 에 배정이 잔존하는 일이 없습니다. 대기열 복귀는 후보 조회 API 재노출까지 cross-API 테스트로 고정했습니다.

## 🤔 고민했던 내용

- 수동 배정도 멤버 상태를 바꾸지 않습니다 — draft semantics 를 끝까지 유지하고 ASSIGNED 전이는 확정 API 한 곳에만 둡니다.
- 잠금은 BE#9 에서 확정한 전역 순서(라운드→슬롯→멤버)를 그대로 상속합니다. 라운드 잠금이 자동배정 재실행과 직렬화해 "수동 배정 직후 재실행이 갈아엎는" 동작을 결정적으로 만들고, 멤버 잠금이 동시 "배정 vs 제외"로 제외된 멤버에게 배정이 남는 틈을 막습니다.
- 제외에 지원서 행 잠금(§16-7)은 걸지 않았습니다 — 그 규칙의 목적은 멤버십을 만들거나 재활성화하는 쪽의 모순 차단인데, 제외는 종결 방향이라 모순을 만들 수 없고 후보 검증은 커밋된 상태만 보므로 어느 순서든 안전합니다 (근거를 계획에 명시).
- 제외된 멤버의 슬롯 선택 기록(availability)은 의도적으로 남깁니다 — 배정·확정에 영향이 없고, 스펙도 schedule 정리만 명령합니다.

## 💬 리뷰 중점사항

- 제외의 phase 허용 범위(발송 전·수집·배정 검토)와 멤버 전이 화이트리스트가 §5.2 와 일치하는지.
- 수동 배정의 "본인 삭제 → 카운트 → 생성" 순서가 만석 멱등과 capacity 하드 체크를 동시에 만족하는지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §5.2·§6.2·§9.1 API 9·10·§16-3·§16-7-2·§16-7-4
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: API 9(수동 배정·재배정 capacity 하드 체크·해제·ASSIGNING 한정·NO_AVAILABLE_SLOT 포함) → Task 4 + 테스트 1~13, API 10(EXCLUDED 전이·즉시 대기열 복귀) → exclude + 테스트 14(cross-API), §16-3(활성 schedule 정리) → removeActiveSchedule + 테스트 14, §5.2(전이 허용 셋) → 도메인 TDD 3건, §16-7-2/7-4(잠금) → 구현 주석 + 핵심 결정 4, §16-7 비적용 근거 → 핵심 결정 5.
- **플레이스홀더**: 없음.
- **타입 일관성**: `exclude()` 시그니처 도메인/서비스/테스트 일치, `assignSchedule(roundId, memberId, slotId, userId)` 4-인자 인터페이스/구현/컨트롤러 일치, `AssignScheduleRequest.slotId()` 사용 일치, 헬퍼 `getLockedMemberOfRound`/`removeActiveSchedule` 정의·호출 일치, 기존 레포 메서드 5종 모두 BE#6~9 에서 기존재 확인.
- **주의 메모**: ① 테스트 14 의 candidates 응답 JSON 경로(`data.applicationId`)는 BE#2 후보 조회 응답 구조 — 구현 시 실제 필드명 확인, 다르면 단언만 보정. ② `delete(schedule)` 는 `@SQLDelete` soft delete — hard delete 아님 (엔티티 설정 확인). ③ exclude 후 availability 잔존은 의도 (핵심 결정 6).

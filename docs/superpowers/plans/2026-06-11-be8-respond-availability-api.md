# BE#8 — 지원자 응답 API (슬롯 선택 / 가능없음) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 6 은 리뷰 후 컨트롤러가 수행한다.**

**Goal:** `PUT /api/v1/applications/{applicationId}/interview-availability` — 슬롯 선택(`slotIds`) 또는 가능없음(`noAvailableSlot`+`alternativeText`)을 전체 교체 방식으로 응답/재응답한다 (COLLECTING && 마감 전 한정, 상호 전환 가능 — 스펙 §5.2·§9.2 API 14).

**Architecture:** 스펙 §16 의 잠금 규칙 2개를 상속하는 지원자 writer. **§16-7**: 응답 TX 는 application 행을 `PESSIMISTIC_FORCE_INCREMENT` 로 잠가 동시 합불 처리(`updateStatus`)·동시 자기 응답(self-race)을 직렬화한다. **§16-7-1**: 선택 슬롯 행을 `PESSIMISTIC_WRITE` 로 잠가 슬롯 시간변경/삭제의 read-check 와 직렬화한다. upsert 는 라운드 한정 soft delete 후 재삽입(V46 partial unique 패턴). 멤버 전이(`markResponded`/`reportNoAvailableSlot`)는 도메인 메서드 TDD — 허용 상태 {INVITED, RESPONDED, NO_AVAILABLE_SLOT} 상호 전환.

**Tech Stack:** Spring Boot 3.4 / Java 21 / RestAssured + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.2(전이)·§9.2 API 14·§9.3(마감 경계 strict)·§16-7·§16-7-1
**리뷰 정책:** duing-code-reviewer + codex 기본 + **codex adversarial** (writer + 잠금 2종 — 스펙 §12 의 동시성·상태전이 기준 충족)

---

## 핵심 결정

1. **가드 순서**: 404(application)→403(본인)→400(useInterview) → **§16-7 잠금** → 409(`ApplicationAlreadyDecided` — INTERVIEW_PENDING 아님) → 404(`RoundMembershipNotFound` — visible 멤버십 없음, DRAFT 포함 비노출) → 409(`AvailabilityPeriodClosed` — round≠COLLECTING ∨ now>deadline, §9.3 strict 경계: 정각은 열림) → 400(XOR) → 슬롯 경로면 **§16-7-1 슬롯 잠금** + 검증.
2. **XOR 계약**: `slotIds 비어있지 않음` XOR `noAvailableSlot == true` — 둘 다/둘 다 아님 → 400 `InvalidAvailabilityRequest`. `alternativeText` 는 가능없음 경로에서만 의미(슬롯 경로에서 오면 무시가 아니라 400 — 명확한 계약).
3. **upsert = 라운드 한정 soft delete 후 재삽입**: `softDeleteByRoundIdAndApplicationId`(@Modifying) — partial unique `WHERE deleted_at IS NULL` 가 재삽입을 허용(V46 패턴). self-race 는 §16-7 잠금이 직렬화하므로 23505 catch 불요.
4. **슬롯 검증은 잠금 후**: `findAllByIdInForUpdate`(ORDER BY id — 교착 방지, JPQL 이라 `@SQLRestriction` 적용 → soft-deleted 슬롯은 조회 누락 = size 불일치) → size 불일치 ∨ 타 라운드 슬롯 → 400 `InvalidSlotSelection`.
5. **전이 도메인 메서드**: `markResponded()`(→RESPONDED, text null 초기화) / `reportNoAvailableSlot(text)`(→NO_AVAILABLE_SLOT, trim·blank→null) — 허용 상태 셋 밖(ASSIGNED/EXCLUDED)이면 `MemberTransitionNotAllowed`(기존 409 재사용).
6. **응답은 `ApplicantInterviewService` 에 추가** — "지원자 면접 상호작용(조회+응답)" 단일 책임 유지.
7. 응답 204. PUT 멱등(같은 선택 재전송 = 같은 결과).

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Modify | `entity/InterviewRoundMember.java` | `markResponded`/`reportNoAvailableSlot` |
| Test Modify | `entity/InterviewRoundDomainTest.java` | 전이 4건 추가 |
| Modify | `exception/InterviewException.java` | `RoundMembershipNotFound`(404)·`AvailabilityPeriodClosed`(409)·`ApplicationAlreadyDecided`(409)·`InvalidSlotSelection`(400)·`InvalidAvailabilityRequest`(400) |
| Modify | `repository/InterviewSlotRepository.java` | `findAllByIdInForUpdate` (PESSIMISTIC_WRITE) |
| Modify | `repository/InterviewAvailabilityRepository.java` | `softDeleteByRoundIdAndApplicationId` |
| Create | `service/dto/command/RespondInterviewAvailabilityCommand.java` | 커맨드 |
| Modify | `service/ApplicantInterviewService.java` + `GeneralApplicantInterviewService.java` | `respondAvailability` (+slotRepo 잠금·applicationRepo 잠금 의존) |
| Create | `controller/dto/request/RespondInterviewAvailabilityRequest.java` | 검증 + toCommand |
| Modify | `api/ApplicantInterviewApi.java` + `controller/ApplicantInterviewController.java` | PUT (204) |
| Test Create | `controller/ApplicantInterviewRespondControllerTest.java` | RestAssured 15건 |

커밋 2개: ① 멤버 응답 전이 TDD ② 응답 API.

---

### Task 1: 브랜치 생성

- [x] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-respond-availability
```

---

### Task 2: 멤버 응답 전이 (TDD)

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/interview/entity/InterviewRoundDomainTest.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/entity/InterviewRoundMember.java`

- [x] **Step 1: 단위 테스트 4건 추가 (RED)** — `InterviewRoundDomainTest` 에:

```java
    @Test
    @DisplayName("초대된 멤버가 슬롯을 선택하면 RESPONDED 가 되고, 가능없음 텍스트는 비워진다")
    void invitedMemberMarksResponded() {
        InterviewRoundMember member = InterviewRoundMember.invite(1L, 10L);
        ReflectionTestUtils.setField(member, "status", RoundMemberStatus.NO_AVAILABLE_SLOT);
        ReflectionTestUtils.setField(member, "alternativeAvailabilityText", "주말만");

        member.markResponded();

        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.RESPONDED);
        assertThat(member.getAlternativeAvailabilityText()).isNull();
    }

    @Test
    @DisplayName("초대된 멤버가 가능한 슬롯이 없다고 응답하면 NO_AVAILABLE_SLOT 과 대체 가능시간 텍스트가 기록된다")
    void invitedMemberReportsNoAvailableSlot() {
        InterviewRoundMember member = InterviewRoundMember.invite(1L, 10L);

        member.reportNoAvailableSlot("  평일 저녁만 가능합니다  ");

        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.NO_AVAILABLE_SLOT);
        assertThat(member.getAlternativeAvailabilityText()).isEqualTo("평일 저녁만 가능합니다");
    }

    @Test
    @DisplayName("응답 완료 멤버는 마감 전 가능없음으로 다시 응답할 수 있다 — 상호 전환")
    void respondedMemberCanSwitchToNoAvailableSlot() {
        InterviewRoundMember member = InterviewRoundMember.invite(1L, 10L);
        member.markResponded();

        member.reportNoAvailableSlot(null);

        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.NO_AVAILABLE_SLOT);
        assertThat(member.getAlternativeAvailabilityText()).isNull();
    }

    @Test
    @DisplayName("배정 확정·제외된 멤버는 응답을 변경할 수 없다")
    void terminalMembersCannotRespond() {
        InterviewRoundMember assigned = InterviewRoundMember.invite(1L, 10L);
        ReflectionTestUtils.setField(assigned, "status", RoundMemberStatus.ASSIGNED);
        InterviewRoundMember excluded = InterviewRoundMember.invite(1L, 11L);
        ReflectionTestUtils.setField(excluded, "status", RoundMemberStatus.EXCLUDED);

        assertThatThrownBy(assigned::markResponded)
                .isInstanceOf(InterviewException.MemberTransitionNotAllowed.class);
        assertThatThrownBy(() -> excluded.reportNoAvailableSlot("아무때나"))
                .isInstanceOf(InterviewException.MemberTransitionNotAllowed.class);
    }
```

- [x] **Step 2: RED 확인** — `./gradlew test --tests "com.duing.domain.interview.entity.InterviewRoundDomainTest"` → 컴파일 실패

- [x] **Step 3: 구현 (GREEN)** — `InterviewRoundMember` 의 `reinviteAfterSlotAdded()` 아래에:

```java
    /**
     * 응답(슬롯 선택) — INVITED·RESPONDED·NO_AVAILABLE_SLOT 상호 전환 가능 (스펙 §5.2,
     * COLLECTING && 마감 전 가드는 서비스 담당). 이전 가능없음 텍스트는 stale 이므로 비운다.
     */
    public void markResponded() {
        requireRespondableStatus();
        this.status = RoundMemberStatus.RESPONDED;
        this.alternativeAvailabilityText = null;
    }

    /**
     * 응답(가능한 슬롯 없음) — Rule 1 (스펙 §5.5): 자동배정 대상에서 빠지고 수동 처리 전용이 된다.
     * 텍스트는 비구조 자유텍스트로 매칭에 쓰이지 않는다.
     */
    public void reportNoAvailableSlot(String alternativeText) {
        requireRespondableStatus();
        this.status = RoundMemberStatus.NO_AVAILABLE_SLOT;
        this.alternativeAvailabilityText = normalizeNullable(alternativeText);
    }

    private void requireRespondableStatus() {
        if (this.status != RoundMemberStatus.INVITED
                && this.status != RoundMemberStatus.RESPONDED
                && this.status != RoundMemberStatus.NO_AVAILABLE_SLOT) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
```

- [x] **Step 4: GREEN 확인** — 11건(기존 7+신규 4) PASS

- [x] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 라운드 멤버 응답 전이(markResponded·reportNoAvailableSlot) 추가"
```

---

### Task 3: 통합 테스트 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/ApplicantInterviewRespondControllerTest.java`

- [x] **Step 1: 테스트 작성** (`InterviewControllerTestSupport` 상속)

```java
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
```

- [x] **Step 2: RED 확인** — `./gradlew test --tests "...ApplicantInterviewRespondControllerTest"` → 컴파일 성공(엔드포인트 블랙박스) + 대부분 FAIL. **커밋하지 않는다.**

---

### Task 4: 구현 (GREEN)

- [x] **Step 1: 예외 5개 추가** (`InterviewException`)

404 섹션에:

```java
    public static final class RoundMembershipNotFound extends InterviewException {
        private static final String MESSAGE = "응답할 수 있는 면접 라운드가 없습니다.";
        public RoundMembershipNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
```

409 섹션에:

```java
    public static final class AvailabilityPeriodClosed extends InterviewException {
        private static final String MESSAGE = "면접 가능 시간 응답 기간이 아닙니다.";
        public AvailabilityPeriodClosed() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class ApplicationAlreadyDecided extends InterviewException {
        private static final String MESSAGE = "이미 합격/불합격 처리된 지원입니다.";
        public ApplicationAlreadyDecided() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
```

400 섹션에:

```java
    public static final class InvalidSlotSelection extends InterviewException {
        private static final String MESSAGE = "선택한 슬롯이 유효하지 않습니다.";
        public InvalidSlotSelection() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class InvalidAvailabilityRequest extends InterviewException {
        private static final String MESSAGE = "슬롯 선택과 '가능한 시간 없음' 중 하나만 보내야 합니다.";
        public InvalidAvailabilityRequest() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
```

- [x] **Step 2: 레포 2건**

`InterviewSlotRepository` 에 추가 (import `LockModeType`·`Lock`·`Query`·`Param`·`Collection`):

```java
    /**
     * 응답 시 선택 슬롯 행을 잠가 슬롯 시간변경/삭제의 참조 검사와 직렬화한다 (스펙 §16-7-1).
     * ORDER BY id 고정으로 잠금 순서를 일관시켜 교착을 방지한다. JPQL 이므로 @SQLRestriction 이
     * 적용되어 soft-deleted 슬롯은 결과에서 빠진다 — 호출자는 size 불일치로 감지한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM InterviewSlot s WHERE s.id IN :ids ORDER BY s.id ASC")
    List<InterviewSlot> findAllByIdInForUpdate(@Param("ids") Collection<Long> ids);
```

`InterviewAvailabilityRepository` 에 추가 (import `Modifying`·`Query`·`Param`):

```java
    /** 응답 upsert — 라운드 한정 전체 교체의 삭제 단계 (V46 partial unique 패턴으로 재삽입 허용). */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE InterviewAvailability a SET a.deletedAt = CURRENT_TIMESTAMP "
            + "WHERE a.roundId = :roundId AND a.applicationId = :applicationId AND a.deletedAt IS NULL")
    void softDeleteByRoundIdAndApplicationId(@Param("roundId") Long roundId,
                                             @Param("applicationId") Long applicationId);
```

- [x] **Step 3: command + request DTO**

`service/dto/command/RespondInterviewAvailabilityCommand.java`:

```java
package com.duing.domain.interview.service.dto.command;

import java.util.List;

public record RespondInterviewAvailabilityCommand(
        Long applicationId,
        Long currentUserId,
        List<Long> slotIds,
        boolean noAvailableSlot,
        String alternativeText
) {}
```

`controller/dto/request/RespondInterviewAvailabilityRequest.java`:

```java
package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.RespondInterviewAvailabilityCommand;
import jakarta.validation.constraints.Size;
import java.util.List;

public record RespondInterviewAvailabilityRequest(
        // 슬롯 선택 경로. noAvailableSlot 과 XOR — 위반은 서비스가 400 으로 거부한다.
        List<Long> slotIds,
        Boolean noAvailableSlot,
        @Size(max = 500, message = "대체 가능시간은 500자 이하여야 합니다.")
        String alternativeText
) {
    public RespondInterviewAvailabilityCommand toCommand(Long applicationId, Long currentUserId) {
        return new RespondInterviewAvailabilityCommand(
                applicationId, currentUserId, slotIds,
                Boolean.TRUE.equals(noAvailableSlot), alternativeText);
    }
}
```

- [x] **Step 4: 서비스**

`ApplicantInterviewService` 에 추가:

```java
    /**
     * 슬롯 선택 또는 '가능한 시간 없음' 응답 — 전체 교체 upsert, COLLECTING && 마감 전 한정,
     * 재응답·상호 전환 가능 (스펙 §9.2 API 14·§5.2).
     */
    void respondAvailability(RespondInterviewAvailabilityCommand respondCommand);
```

`GeneralApplicantInterviewService` 에 추가 — 의존 2개 추가(`ApplicationRepository` 기존재, `InterviewRoundRepository` 불요 — `VisibleMembership` 으로 충분; 신규: 없음 — slotRepo·availabilityRepo 기존재) + 메서드 (import `RespondInterviewAvailabilityCommand`·`LinkedHashSet`·`Set` 추가):

```java
    @Override
    @Transactional
    public void respondAvailability(RespondInterviewAvailabilityCommand respondCommand) {
        Application application = applicationRepository
                .findWithRecruitmentAndClubById(respondCommand.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        if (!application.getUser().getId().equals(respondCommand.currentUserId())) {
            throw new ApplicationDomainException.ForbiddenApplicationAccessException();
        }
        if (!application.getRecruitment().isUseInterview()) {
            throw new InterviewException.InterviewNotUsed();
        }

        // §16-7: 동시 합불 처리·동시 자기 응답을 application 행에서 직렬화한다.
        // FORCE_INCREMENT 로 version 이 올라 잠금 없는 updateStatus 가 커밋 시 409 로 충돌한다.
        applicationRepository.findAllByIdInForUpdate(List.of(application.getId()));
        if (application.getStatus() != ApplicationStatus.INTERVIEW_PENDING) {
            throw new InterviewException.ApplicationAlreadyDecided();
        }

        VisibleMembership visibleMembership = interviewRoundMemberRepository
                .findVisibleMembershipByApplicationId(respondCommand.applicationId())
                .orElseThrow(InterviewException.RoundMembershipNotFound::new);
        InterviewRound round = visibleMembership.round();
        InterviewRoundMember member = visibleMembership.member();

        LocalDateTime now = LocalDateTime.now(clock);
        // §9.3 strict 경계 — 정각(now == deadline)은 아직 열려 있다. COLLECTING 의 deadline 은
        // 발송 가드가 보장하므로 null 은 도달 불가지만 방어적으로 닫힘 처리한다.
        boolean periodOpen = round.getStatus() == RoundStatus.COLLECTING
                && round.getAvailabilityDeadline() != null
                && !now.isAfter(round.getAvailabilityDeadline());
        if (!periodOpen) {
            throw new InterviewException.AvailabilityPeriodClosed();
        }

        boolean slotsGiven = respondCommand.slotIds() != null && !respondCommand.slotIds().isEmpty();
        if (slotsGiven == respondCommand.noAvailableSlot()) {
            throw new InterviewException.InvalidAvailabilityRequest();
        }
        if (slotsGiven && respondCommand.alternativeText() != null) {
            throw new InterviewException.InvalidAvailabilityRequest();
        }

        interviewAvailabilityRepository.softDeleteByRoundIdAndApplicationId(
                round.getId(), respondCommand.applicationId());

        if (slotsGiven) {
            // 입력 중복은 클라이언트 실수 보호 차원에서 제거하되 순서는 유지한다 (bulkUpdateStatus 전례).
            Set<Long> slotIds = new LinkedHashSet<>(respondCommand.slotIds());
            // §16-7-1: 선택 슬롯 행을 잠가 슬롯 시간변경/삭제의 참조 검사와 직렬화한다.
            List<InterviewSlot> slots = interviewSlotRepository.findAllByIdInForUpdate(slotIds);
            if (slots.size() != slotIds.size()
                    || slots.stream().anyMatch(slot -> !slot.getRoundId().equals(round.getId()))) {
                throw new InterviewException.InvalidSlotSelection();
            }
            interviewAvailabilityRepository.saveAll(slotIds.stream()
                    .map(slotId -> InterviewAvailability.create(
                            respondCommand.applicationId(), slotId, round.getId()))
                    .toList());
            member.markResponded();
        } else {
            member.reportNoAvailableSlot(respondCommand.alternativeText());
        }
    }
```

(import 추가: `ApplicationStatus`·`RespondInterviewAvailabilityCommand`·`LinkedHashSet`·`Set` — `ApplicationStatus` 는 BE#7 에서 이미 import 됨)

- [x] **Step 5: Api + Controller**

`ApplicantInterviewApi` 에 추가 (import `RespondInterviewAvailabilityRequest`·`Valid`·`PutMapping`·`RequestBody`):

```java
    @Operation(
            summary = "면접 가능 시간 응답",
            description = "슬롯 선택(slotIds) 또는 '가능한 시간 없음'(noAvailableSlot + alternativeText) 중 하나로 응답한다 — 둘은 동시에 보낼 수 없다. "
                    + "전체 교체 방식이라 재응답하면 이전 선택이 사라지며, 응답 수집 중(마감 전) 라운드에서만 가능하다. "
                    + "마감 후·배정 단계 진입 후에는 409, 응답할 라운드가 없으면 404."
    )
    @PutMapping("/applications/{applicationId}/interview-availability")
    ResponseEntity<ApiResponse<Void>> respondAvailability(
            @PathVariable Long applicationId,
            @Valid @RequestBody RespondInterviewAvailabilityRequest respondInterviewAvailabilityRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`ApplicantInterviewController` 에 추가:

```java
    @Override
    public ResponseEntity<ApiResponse<Void>> respondAvailability(
            @PathVariable Long applicationId,
            @Valid @RequestBody RespondInterviewAvailabilityRequest respondInterviewAvailabilityRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        applicantInterviewService.respondAvailability(
                respondInterviewAvailabilityRequest.toCommand(applicationId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
```

- [x] **Step 6: GREEN 확인** — 15건 PASS

---

### Task 5: 전체 검증 + 커밋

- [x] **Step 1:** `./gradlew test` → BUILD SUCCESSFUL (784 + 4 + 15 = 803건 예상)

- [x] **Step 2:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 지원자 면접 가능 시간 응답 API — 전체 교체 upsert"
```

---

### Task 6: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [x] **Step 1: self-check 7항목** (기존 동일 명령)

- [x] **Step 2: push + PR** (자동 머지 금지. **리뷰 단계에서 codex adversarial — 잠금 2종·상태전이 — 포함**)

```bash
git push -u origin feat/interview-respond-availability
gh pr create --base develop --title "feat(backend): 지원자 면접 가능 시간 응답 API" --body "$(cat <<'EOF'
## 🚀 작업 내용

지원자가 면접 가능 시간을 응답하는 API 입니다. 슬롯을 고르거나 "가능한 시간이 없다"고 답할 수 있고(+자유 텍스트), 마감 전이라면 몇 번이든 다시 응답하거나 두 방식 사이를 오갈 수 있습니다 — 전체 교체 방식이라 마지막 응답만 남습니다. 가능없음 응답은 자동배정 대상에서 빠지고 운영진 수동 처리 전용이 됩니다(Rule 1).

설계 문서 §16 의 잠금 규칙 두 개를 상속하는 지원자 쪽 첫 쓰기 경로입니다. 응답 트랜잭션은 지원서 행을 잠가(버전 강제 증가) 동시 합불 처리와 충돌하게 만들고 — 합격 처리된 지원자가 응답하는 틈을 막습니다 — 선택한 슬롯 행도 잠가 운영진의 슬롯 시간변경·삭제와 직렬화합니다.

## 🤔 고민했던 내용

- 마감 경계는 §9.3 표기 통일대로 strict — 마감 정각의 응답은 아직 유효합니다.
- 슬롯 경로에 alternativeText 가 같이 오면 무시하지 않고 400 으로 거부합니다 — 모호한 요청을 조용히 받아주면 클라이언트 버그가 늦게 발견됩니다.
- 동시 자기 응답(더블클릭/두 탭)은 별도 처리 없이 지원서 행 잠금이 직렬화합니다 — 같은 행을 잡으므로 두 번째 요청은 첫 커밋 후의 상태를 보고 정상 진행(전체 교체라 멱등적 결과)됩니다.

## 💬 리뷰 중점사항

- 가드 순서(잠금 → 합불 검증 → 멤버십 → 기간 → XOR → 슬롯 잠금·검증)의 빈틈.
- 멤버 전이(markResponded/reportNoAvailableSlot)의 허용 상태 셋이 스펙 §5.2 상호 전환과 일치하는지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §5.2·§9.2 API 14·§16-7·§16-7-1
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §9.2 API 14(upsert·COLLECTING+마감 전·재응답) → Task 4 + 테스트 1~5, §5.2 상호 전환 → 도메인 TDD 4건 + 테스트 3·4, §16-7(FORCE_INCREMENT) → 잠금 + 테스트 13(합불 후 응답 409), §16-7-1(슬롯 행 잠금) → findAllByIdInForUpdate + 주석, Rule 1 의미 → reportNoAvailableSlot Javadoc, §9.3 strict 경계 → periodOpen 조건.
- **플레이스홀더**: 없음.
- **타입 일관성**: `markResponded()`/`reportNoAvailableSlot(String)` 시그니처가 도메인/서비스/테스트 일치, `RespondInterviewAvailabilityCommand` 5필드가 request toCommand 와 일치, `findAllByIdInForUpdate(Collection<Long>)` 호출부(Set 전달) 호환, `softDeleteByRoundIdAndApplicationId(Long, Long)` 시그니처 일치.
- **주의 메모**: ① 테스트 13 의 ACCEPTED 셋업은 ReflectionTestUtils — 전이 규칙상 RESPONDED 멤버 보유 지원자의 ACCEPTED 전이는 가능(INTERVIEW_PENDING→ACCEPTED)하나 셋업 단순화를 위해 리플렉션 사용(기존 전례). ② `findAllByIdInForUpdate`(application) 반환값은 잠금 목적이라 미사용 — 변수 할당 없이 호출 (리뷰어 지적 가능성 — 의도 주석 있음). ③ XOR 검증이 기간 검증 뒤인 이유: 닫힌 기간엔 요청 형식과 무관하게 409 가 사용자에게 더 유용한 신호다.

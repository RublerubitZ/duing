# BE#7 — 지원자 인터뷰 조회 API (applicantPhase SSOT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 6 은 리뷰 후 컨트롤러가 수행한다.**

**Goal:** `GET /api/v1/applications/{applicationId}/interview` — 서버가 단독 파생한 `applicantPhase` 와 phase 별 화면 데이터(COLLECTING 슬롯+내 선택+마감 / SCHEDULED 확정 일정)를 반환한다. **raw member/round status 는 절대 노출하지 않는다** (SSOT — EXCLUDED 누출 원천 차단, 스펙 §9.3).

**Architecture:** phase 파생은 **순수 정적 함수** `ApplicantInterviewPhase.derive(...)` 로 분리해 진리표 TDD 로 고정한다. 평가 순서는 스펙 §9.3 그대로 — ① `isVisibleToApplicant` 멤버십(DRAFT 제외) 유무 ② 없으면 application 상태 분기(참여 이력 = CANCELLED 라운드 또는 EXCLUDED 멤버십) ③ 있으면 표 순서대로 조합. 표 밖 상태(SUBMITTED/ACCEPTED/REJECTED)는 `NOT_APPLICABLE` — §9.3 경계 조항("application 결과 뷰가 담당")의 API 계약 표현.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / RestAssured + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.4(visible 술어)·§9.2 API 13·§9.3(파생 표·평가 순서·경계)
**리뷰 정책:** duing-code-reviewer + codex 기본 (+ 리뷰 프롬프트에 EXCLUDED 누출 검증 명시)

---

## 핵심 결정

1. **`derive` 는 primitive 입력의 순수 함수**: `derive(ApplicationStatus, RoundStatus visibleRoundStatus, RoundMemberStatus, boolean hasConcludedMembership, boolean deadlinePassed)` — visible 멤버십이 없으면 round/member 인자는 null. 쿼리(visible 판정·이력 판정)와 파생(표)을 분리해 진리표를 단위 테스트로 못박는다.
2. **표 순서 = 평가 순서** (§9.3): `NO_AVAILABLE_SLOT → NO_SLOT_REPORTED` 행이 `ASSIGNING → SCHEDULING` 행보다 위 — ASSIGNING 중에도 가능슬롯없음 멤버는 "운영진이 조율 중" 카피가 정확하므로 멤버 상태 행을 먼저 평가한다.
3. **방어 디폴트**: visible 멤버십이 있는데 표의 어느 행에도 안 걸리는 조합(예: SCHEDULED 라운드의 INVITED — 강제확정 시 자동 EXCLUDED 라 정상 경로론 도달 불가)은 중립 카피인 `SCHEDULING` 으로 — 내부 상태를 새 phase 로 만들어 누출하지 않는다.
4. **표 밖 상태는 `NOT_APPLICABLE`** (400 이 아니라 200) — 합격/불합격 화면에서 interview 카드 비표시는 FE 분기지만, 방어적 호출에도 안전한 계약.
5. **COLLECTING 화면 데이터는 phase 무관하게 visible round 가 COLLECTING 이면 포함** (§9.2 — RESPONDED/NO_SLOT_REPORTED 도 마감 전 재응답 화면이 필요). `slots[].selected` 로 내 선택 표시. `myAlternativeText` 는 본인 응답이므로 노출 OK (§9.3).
6. **본인 검증은 `ApplicationDomainException.ForbiddenApplicationAccessException` 재사용** (getMyApplicationDetail 전례), useInterview=false → 400 `InterviewNotUsed` (일관).
7. **신규 `ApplicantInterviewService`/`GeneralApplicantInterviewService`** — `GeneralInterviewRoundService` 비대화(6메서드) 방지 + 지원자 노출이라는 단일 책임. `getRoundWithManagerAuth` 헬퍼는 운영진 전용이라 공유 대상 아님 (rule-of-three 카운트에 포함되지 않음).
8. visible 멤버십 쿼리는 round+member 쌍이 필요 — 기존 `findVisibleToApplicantRoundByApplicationId`(round 만)와 별개로 `VisibleMembership(round, member)` projection custom 추가. 기존 JPQL 은 stepper(deadline)가 계속 사용하므로 유지.

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Create | `service/dto/query/ApplicantInterviewPhase.java` | 노출 전용 enum + `derive` 순수 함수 |
| Create | `service/dto/query/VisibleMembership.java` | (round, member) projection |
| Create | `service/dto/query/ApplicantInterviewView.java` | phase + 화면 데이터 조립 |
| Modify | `repository/InterviewRoundMemberRepositoryCustom.java`+`Impl` | `findVisibleMembershipByApplicationId`·`existsConcludedMembershipByApplicationId` |
| Modify | `repository/InterviewAvailabilityRepository.java` | `findByRoundIdAndApplicationId` |
| Modify | `repository/InterviewScheduleRepository.java` | `findByRoundIdAndApplicationIdAndStatus` |
| Create | `service/ApplicantInterviewService.java` + `service/GeneralApplicantInterviewService.java` | 본인 검증 + 파생 + 조립 |
| Create | `controller/dto/response/ApplicantInterviewResponse.java` | phase + nested 화면 데이터 |
| Create | `api/ApplicantInterviewApi.java` + `controller/ApplicantInterviewController.java` | GET (200) |
| Test Create | `service/dto/query/ApplicantInterviewPhaseTest.java` | 진리표 단위 12건 |
| Test Create | `controller/ApplicantInterviewControllerTest.java` | RestAssured 통합 15건 |

커밋 2개: ① phase 진리표 TDD ② 조회 API.

---

### Task 1: 브랜치 생성

- [x] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/applicant-interview-view
```

---

### Task 2: `ApplicantInterviewPhase.derive` 진리표 (TDD)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/service/dto/query/ApplicantInterviewPhaseTest.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/dto/query/ApplicantInterviewPhase.java`

- [x] **Step 1: 진리표 단위 테스트 작성 (RED)**

```java
package com.duing.domain.interview.service.dto.query;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

// applicantPhase 파생 진리표 (스펙 §9.3 — 평가 순서: visible 유무 → 무소속 분기 → 표 순서 조합).
// raw 내부 상태(EXCLUDED 등)가 phase 로 노출되지 않는 것이 SSOT 의 핵심이다.
class ApplicantInterviewPhaseTest {

    @Test
    @DisplayName("서류 검토 중인 지원자는 DOCUMENT_REVIEW 로 파생된다")
    void underReviewDerivesDocumentReview() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.UNDER_REVIEW, null, null, false, false))
                .isEqualTo(ApplicantInterviewPhase.DOCUMENT_REVIEW);
    }

    @Test
    @DisplayName("면접 대상이지만 라운드 참여 이력이 없으면 WAITING_ROUND 로 파생된다")
    void pendingWithoutHistoryDerivesWaitingRound() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, null, null, false, false))
                .isEqualTo(ApplicantInterviewPhase.WAITING_ROUND);
    }

    @Test
    @DisplayName("취소·제외로 라운드를 거쳐온 면접 대상은 WAITING_NEXT_ROUND 로 파생된다")
    void pendingWithConcludedHistoryDerivesWaitingNextRound() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, null, null, true, false))
                .isEqualTo(ApplicantInterviewPhase.WAITING_NEXT_ROUND);
    }

    @Test
    @DisplayName("평가 구간 밖 상태(제출됨·합격·불합격)는 NOT_APPLICABLE 로 파생된다")
    void outOfScopeStatusesDeriveNotApplicable() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.SUBMITTED, null, null, false, false))
                .isEqualTo(ApplicantInterviewPhase.NOT_APPLICABLE);
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.ACCEPTED, null, null, false, false))
                .isEqualTo(ApplicantInterviewPhase.NOT_APPLICABLE);
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.REJECTED, null, null, true, false))
                .isEqualTo(ApplicantInterviewPhase.NOT_APPLICABLE);
    }

    @Test
    @DisplayName("응답 수집 중 초대 상태이고 마감 전이면 AVAILABILITY_REQUESTED 로 파생된다")
    void invitedCollectingBeforeDeadline() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.COLLECTING,
                RoundMemberStatus.INVITED, false, false))
                .isEqualTo(ApplicantInterviewPhase.AVAILABILITY_REQUESTED);
    }

    @Test
    @DisplayName("응답 수집 중 초대 상태이고 마감이 지났으면 AVAILABILITY_CLOSED 로 파생된다")
    void invitedCollectingAfterDeadline() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.COLLECTING,
                RoundMemberStatus.INVITED, false, true))
                .isEqualTo(ApplicantInterviewPhase.AVAILABILITY_CLOSED);
    }

    @Test
    @DisplayName("응답을 완료한 멤버는 RESPONDED 로 파생된다")
    void respondedCollecting() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.COLLECTING,
                RoundMemberStatus.RESPONDED, false, false))
                .isEqualTo(ApplicantInterviewPhase.RESPONDED);
    }

    @Test
    @DisplayName("가능한 슬롯이 없다고 응답한 멤버는 라운드 단계와 무관하게 NO_SLOT_REPORTED 로 파생된다")
    void noAvailableSlotWinsOverRoundPhase() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.COLLECTING,
                RoundMemberStatus.NO_AVAILABLE_SLOT, false, false))
                .isEqualTo(ApplicantInterviewPhase.NO_SLOT_REPORTED);
        // 표 순서: NO_AVAILABLE_SLOT 행이 ASSIGNING 행보다 위 — 배정 검토 중에도 "조율 중" 카피가 정확하다.
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.ASSIGNING,
                RoundMemberStatus.NO_AVAILABLE_SLOT, false, true))
                .isEqualTo(ApplicantInterviewPhase.NO_SLOT_REPORTED);
    }

    @Test
    @DisplayName("배정 검토 중(ASSIGNING) 라운드의 응답 멤버는 SCHEDULING 로 파생된다")
    void assigningDerivesScheduling() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.ASSIGNING,
                RoundMemberStatus.RESPONDED, false, true))
                .isEqualTo(ApplicantInterviewPhase.SCHEDULING);
    }

    @Test
    @DisplayName("일정이 확정된 라운드의 배정 멤버는 SCHEDULED 로 파생된다")
    void assignedInScheduledRound() {
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.SCHEDULED,
                RoundMemberStatus.ASSIGNED, false, true))
                .isEqualTo(ApplicantInterviewPhase.SCHEDULED);
    }

    @Test
    @DisplayName("정상 경로로 도달할 수 없는 조합은 중립 카피인 SCHEDULING 으로 방어한다")
    void unreachableCombinationFallsBackToScheduling() {
        // SCHEDULED 라운드의 INVITED — 강제확정 시 자동 EXCLUDED 라 도달 불가, 내부 상태 누출 없는 중립값으로.
        assertThat(ApplicantInterviewPhase.derive(
                ApplicationStatus.INTERVIEW_PENDING, RoundStatus.SCHEDULED,
                RoundMemberStatus.INVITED, false, true))
                .isEqualTo(ApplicantInterviewPhase.SCHEDULING);
    }

    @Test
    @DisplayName("어떤 입력 조합도 내부 멤버 상태명(EXCLUDED 등)을 phase 로 노출하지 않는다")
    void phaseNamesNeverLeakInternalStatuses() {
        for (ApplicantInterviewPhase phase : ApplicantInterviewPhase.values()) {
            assertThat(phase.name()).doesNotContain("EXCLUDED");
            assertThat(phase.name()).doesNotContain("INVITED");
        }
    }
}
```

- [x] **Step 2: RED 확인** — `./gradlew test --tests "com.duing.domain.interview.service.dto.query.ApplicantInterviewPhaseTest"` → 컴파일 실패

- [x] **Step 3: 구현 (GREEN)**

```java
package com.duing.domain.interview.service.dto.query;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;

/**
 * 지원자에게 노출되는 면접 진행 단계 — 서버 단독 파생(SSOT, 스펙 §9.3).
 * raw member/round status 는 이 enum 으로만 변환되어 나가며, FE 재파생은 금지다.
 * EXCLUDED 등 내부 상태는 어떤 조합에서도 노출되지 않는다 (WAITING_NEXT_ROUND·SCHEDULING 중립 카피).
 */
public enum ApplicantInterviewPhase {
    NOT_APPLICABLE,
    DOCUMENT_REVIEW,
    WAITING_ROUND,
    WAITING_NEXT_ROUND,
    AVAILABILITY_REQUESTED,
    AVAILABILITY_CLOSED,
    RESPONDED,
    NO_SLOT_REPORTED,
    SCHEDULING,
    SCHEDULED;

    /**
     * 평가 순서 (스펙 §9.3):
     * 1) visible 멤버십(DRAFT 제외 — §5.4 isVisibleToApplicant) 유무 — 호출자가 쿼리로 판정해
     *    visibleRoundStatus/memberStatus 를 null 또는 non-null 로 전달한다.
     * 2) visible 없음 → application 상태 분기. 참여 이력(CANCELLED 라운드 또는 EXCLUDED 멤버십)이
     *    있으면 "다음 회차 안내 대기" — DRAFT 멤버십만 있는 경우는 이력이 아니다.
     * 3) visible 있음 → 표 순서대로: INVITED 의 마감 전/후 → RESPONDED → NO_AVAILABLE_SLOT(라운드
     *    단계 무관) → ASSIGNING → SCHEDULED+ASSIGNED. 도달 불가 조합은 중립값 SCHEDULING.
     * 평가~면접 구간 밖(SUBMITTED/ACCEPTED/REJECTED)은 NOT_APPLICABLE — application 결과 뷰가 담당.
     */
    public static ApplicantInterviewPhase derive(ApplicationStatus applicationStatus,
                                                 RoundStatus visibleRoundStatus,
                                                 RoundMemberStatus memberStatus,
                                                 boolean hasConcludedMembership,
                                                 boolean deadlinePassed) {
        if (visibleRoundStatus == null) {
            return switch (applicationStatus) {
                case UNDER_REVIEW -> DOCUMENT_REVIEW;
                case INTERVIEW_PENDING -> hasConcludedMembership ? WAITING_NEXT_ROUND : WAITING_ROUND;
                default -> NOT_APPLICABLE;
            };
        }
        if (memberStatus == RoundMemberStatus.INVITED && visibleRoundStatus == RoundStatus.COLLECTING) {
            return deadlinePassed ? AVAILABILITY_CLOSED : AVAILABILITY_REQUESTED;
        }
        if (memberStatus == RoundMemberStatus.RESPONDED && visibleRoundStatus == RoundStatus.COLLECTING) {
            return RESPONDED;
        }
        if (memberStatus == RoundMemberStatus.NO_AVAILABLE_SLOT) {
            return NO_SLOT_REPORTED;
        }
        if (visibleRoundStatus == RoundStatus.ASSIGNING) {
            return SCHEDULING;
        }
        if (memberStatus == RoundMemberStatus.ASSIGNED && visibleRoundStatus == RoundStatus.SCHEDULED) {
            return SCHEDULED;
        }
        return SCHEDULING;
    }
}
```

- [x] **Step 4: GREEN 확인** — 12건 PASS

- [x] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): applicantPhase 파생 enum — SSOT 진리표"
```

---

### Task 3: 통합 테스트 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/ApplicantInterviewControllerTest.java`

- [x] **Step 1: 테스트 작성** (`InterviewControllerTestSupport` 상속 — 지원자 본인 토큰 사용)

```java
package com.duing.domain.interview.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
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

// 지원자 인터뷰 조회 — 서버 파생 applicantPhase 만 노출하고 raw 상태는 절대 노출하지 않는다 (스펙 §9.2·§9.3).
// EXCLUDED 멤버가 중립 카피(WAITING_NEXT_ROUND)로 가려지는 것이 SSOT 의 존재 이유다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApplicantInterviewControllerTest extends InterviewControllerTestSupport {

    private static final String INTERVIEW_PATH = "/api/v1/applications/{applicationId}/interview";

    @LocalServerPort
    private int port;

    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;

    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User leader = saveUser("리더");
        Club club = saveActiveClub("지원자뷰동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "지원자뷰모집");
    }

    @Test
    @DisplayName("서류 검토 중인 지원자는 DOCUMENT_REVIEW 단계를 받는다")
    void underReviewSeesDocumentReview() {
        Application application = saveUnderReviewApplication(recruitment, "서류중");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("DOCUMENT_REVIEW"))
                .body("data.slots", nullValue())
                .body("data.scheduledInterview", nullValue());
    }

    @Test
    @DisplayName("면접 대상으로 선정됐지만 라운드가 없는 지원자는 WAITING_ROUND 단계를 받는다")
    void pendingWithoutRoundSeesWaitingRound() {
        Application application = saveInterviewPendingApplication(recruitment, "대기중");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("WAITING_ROUND"));
    }

    @Test
    @DisplayName("발송 전(DRAFT) 라운드 멤버십은 지원자에게 보이지 않는다 — WAITING_ROUND 로 표시된다")
    void draftMembershipIsHiddenAsWaitingRound() {
        Application application = saveInterviewPendingApplication(recruitment, "드래프트소속");
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        interviewRoundMemberRepository.save(
                InterviewRoundMember.invite(draftRound.getId(), application.getId()));

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("WAITING_ROUND"))
                .body("data.availabilityDeadline", nullValue());
    }

    @Test
    @DisplayName("취소된 라운드를 거친 지원자는 WAITING_NEXT_ROUND 단계를 받는다")
    void cancelledRoundHistorySeesWaitingNextRound() {
        Application application = saveInterviewPendingApplication(recruitment, "취소이력");
        InterviewRound cancelledRound = saveRound(RoundStatus.CANCELLED, LocalDateTime.now().plusDays(3));
        interviewRoundMemberRepository.save(
                InterviewRoundMember.invite(cancelledRound.getId(), application.getId()));

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("WAITING_NEXT_ROUND"));
    }

    @Test
    @DisplayName("진행 중 라운드에서 제외된 지원자는 제외 사실이 드러나지 않는 WAITING_NEXT_ROUND 를 받는다")
    void excludedMemberIsMaskedAsWaitingNextRound() {
        Application application = saveInterviewPendingApplication(recruitment, "제외이력");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, application, RoundMemberStatus.EXCLUDED, null);

        String responseBody = givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("WAITING_NEXT_ROUND"))
                .extract().body().asString();

        // EXCLUDED 라는 내부 상태 문자열이 응답 어디에도 없어야 한다 (SSOT 누출 차단).
        org.assertj.core.api.Assertions.assertThat(responseBody).doesNotContain("EXCLUDED");
    }

    @Test
    @DisplayName("응답 요청을 받은 지원자는 선택 가능한 슬롯 목록·마감과 함께 AVAILABILITY_REQUESTED 를 받는다")
    void invitedSeesRequestedWithSlots() {
        Application application = saveInterviewPendingApplication(recruitment, "초대됨");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        InterviewSlot slotA = saveSlot(round, "2026-06-20T14:00:00");
        saveSlot(round, "2026-06-20T15:00:00");
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slotA.getId(), round.getId()));

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("AVAILABILITY_REQUESTED"))
                .body("data.availabilityDeadline", org.hamcrest.Matchers.notNullValue())
                .body("data.slots", hasSize(2))
                .body("data.slots[0].selected", equalTo(true))
                .body("data.slots[1].selected", equalTo(false));
    }

    @Test
    @DisplayName("마감이 지난 뒤 미응답 지원자는 AVAILABILITY_CLOSED 를 받는다")
    void invitedAfterDeadlineSeesClosed() {
        Application application = saveInterviewPendingApplication(recruitment, "마감놓침");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().minusHours(1));
        saveMember(round, application, RoundMemberStatus.INVITED, null);
        saveSlot(round, "2026-06-20T14:00:00");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("AVAILABILITY_CLOSED"));
    }

    @Test
    @DisplayName("응답을 완료한 지원자는 자신의 선택이 표시된 슬롯 목록과 함께 RESPONDED 를 받는다")
    void respondedSeesOwnSelection() {
        Application application = saveInterviewPendingApplication(recruitment, "응답완료");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, application, RoundMemberStatus.RESPONDED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slot.getId(), round.getId()));

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("RESPONDED"))
                .body("data.slots", hasSize(1))
                .body("data.slots[0].selected", equalTo(true));
    }

    @Test
    @DisplayName("가능한 시간이 없다고 응답한 지원자는 자신이 남긴 텍스트와 함께 NO_SLOT_REPORTED 를 받는다")
    void noSlotReporterSeesOwnText() {
        Application application = saveInterviewPendingApplication(recruitment, "가능없음");
        InterviewRound round = saveRound(RoundStatus.COLLECTING, LocalDateTime.now().plusDays(3));
        saveMember(round, application, RoundMemberStatus.NO_AVAILABLE_SLOT, "주말 오전만 가능합니다");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("NO_SLOT_REPORTED"))
                .body("data.myAlternativeText", equalTo("주말 오전만 가능합니다"));
    }

    @Test
    @DisplayName("배정 검토 중인 라운드의 지원자는 SCHEDULING 를 받고 슬롯 목록은 보이지 않는다")
    void assigningSeesScheduling() {
        Application application = saveInterviewPendingApplication(recruitment, "조율중");
        InterviewRound round = saveRound(RoundStatus.ASSIGNING, LocalDateTime.now().minusDays(1));
        saveMember(round, application, RoundMemberStatus.RESPONDED, null);
        saveSlot(round, "2026-06-20T14:00:00");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("SCHEDULING"))
                .body("data.slots", nullValue());
    }

    @Test
    @DisplayName("일정이 확정된 지원자는 면접 일시와 장소가 담긴 SCHEDULED 를 받는다")
    void assignedSeesScheduledInterview() {
        Application application = saveInterviewPendingApplication(recruitment, "확정자");
        InterviewRound round = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().minusDays(1), "본관 201호", RoundStatus.SCHEDULED));
        saveMember(round, application, RoundMemberStatus.ASSIGNED, null);
        InterviewSlot slot = saveSlot(round, "2026-06-20T14:00:00");
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), round.getId(), LocalDateTime.now()));

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("SCHEDULED"))
                .body("data.scheduledInterview.startTime", equalTo("2026-06-20T14:00:00"))
                .body("data.scheduledInterview.location", equalTo("본관 201호"));
    }

    @Test
    @DisplayName("합격 처리된 지원자의 인터뷰 조회는 NOT_APPLICABLE 를 받는다")
    void acceptedSeesNotApplicable() {
        Application application = saveApplicationWithStatus(recruitment, "합격자", ApplicationStatus.ACCEPTED);

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.phase", equalTo("NOT_APPLICABLE"));
    }

    @Test
    @DisplayName("다른 지원자의 인터뷰 정보는 조회할 수 없다")
    void othersInterviewIsForbidden() {
        Application application = saveInterviewPendingApplication(recruitment, "본인");
        User stranger = saveUser("타인");
        String strangerToken = jwtTokenProvider.createToken(stranger.getId(), stranger.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 지원서의 인터뷰 조회는 404 를 반환한다")
    void unknownApplicationReturnsNotFound() {
        Application application = saveInterviewPendingApplication(recruitment, "아무나");

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집의 인터뷰 조회는 400 으로 거부된다")
    void interviewNotUsedIsRejected() {
        Club club = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, saveUser("리더2")));
        Recruitment simpleRecruitment = saveSimpleRecruitment(club, "면접없는모집");
        Application application = saveSubmittedApplication(simpleRecruitment, "일반지원자");
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, false);
        applicationRepository.save(application);

        givenApplicant(application)
                .when().get(INTERVIEW_PATH, application.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    private io.restassured.specification.RequestSpecification givenApplicant(Application application) {
        String token = jwtTokenProvider.createToken(
                application.getUser().getId(), application.getUser().getRole().name());
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
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

- [x] **Step 2: RED 확인** — `./gradlew test --tests "...ApplicantInterviewControllerTest"` → 컴파일 성공 + 대부분 FAIL. **커밋하지 않는다.**

---

### Task 4: 구현 (GREEN)

- [x] **Step 1: projection·view DTO**

`service/dto/query/VisibleMembership.java`:

```java
package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;

/** isVisibleToApplicant 술어(§5.4)를 통과한 라운드-멤버십 쌍. */
public record VisibleMembership(InterviewRound round, InterviewRoundMember member) {}
```

`service/dto/query/ApplicantInterviewView.java`:

```java
package com.duing.domain.interview.service.dto.query;

import java.time.LocalDateTime;
import java.util.List;

public record ApplicantInterviewView(
        ApplicantInterviewPhase phase,
        LocalDateTime availabilityDeadline,
        List<SelectableSlot> slots,
        String myAlternativeText,
        ScheduledInterview scheduledInterview
) {
    public record SelectableSlot(Long slotId, LocalDateTime startTime, LocalDateTime endTime,
                                 boolean selected) {}

    public record ScheduledInterview(LocalDateTime startTime, LocalDateTime endTime, String location) {}

    public static ApplicantInterviewView phaseOnly(ApplicantInterviewPhase phase) {
        return new ApplicantInterviewView(phase, null, null, null, null);
    }
}
```

- [x] **Step 2: 레포 4건**

`InterviewRoundMemberRepositoryCustom` 에 추가 (import `VisibleMembership`·`Optional`):

```java
    /**
     * 지원자 노출용 visible 멤버십 — isVisibleToApplicant 술어(§5.4, DRAFT 제외).
     * 불변식상 최대 1건 (placement-active ⊇ visible).
     */
    Optional<VisibleMembership> findVisibleMembershipByApplicationId(Long applicationId);

    /**
     * 참여 이력 — CANCELLED 라운드 멤버십 또는 EXCLUDED 멤버십 존재 (§9.3 보정: DRAFT-only 는 이력 아님).
     */
    boolean existsConcludedMembershipByApplicationId(Long applicationId);
```

`InterviewRoundMemberRepositoryImpl` 에 구현 (기존 static import 활용, `Projections.constructor`):

```java
    @Override
    public Optional<VisibleMembership> findVisibleMembershipByApplicationId(Long applicationId) {
        return Optional.ofNullable(queryFactory
                .select(Projections.constructor(VisibleMembership.class, interviewRound, interviewRoundMember))
                .from(interviewRoundMember)
                .join(interviewRound).on(interviewRound.id.eq(interviewRoundMember.roundId)
                        .and(interviewRound.deletedAt.isNull()))
                .where(
                        interviewRoundMember.applicationId.eq(applicationId),
                        interviewRoundMember.status.ne(RoundMemberStatus.EXCLUDED),
                        interviewRound.status.in(
                                RoundStatus.COLLECTING, RoundStatus.ASSIGNING, RoundStatus.SCHEDULED)
                )
                .fetchOne());
    }

    @Override
    public boolean existsConcludedMembershipByApplicationId(Long applicationId) {
        Integer found = queryFactory
                .selectOne()
                .from(interviewRoundMember)
                .join(interviewRound).on(interviewRound.id.eq(interviewRoundMember.roundId)
                        .and(interviewRound.deletedAt.isNull()))
                .where(
                        interviewRoundMember.applicationId.eq(applicationId),
                        interviewRoundMember.status.eq(RoundMemberStatus.EXCLUDED)
                                .or(interviewRound.status.eq(RoundStatus.CANCELLED))
                )
                .fetchFirst();
        return found != null;
    }
```

`InterviewAvailabilityRepository` 에 `List<InterviewAvailability> findByRoundIdAndApplicationId(Long roundId, Long applicationId);` 추가.
`InterviewScheduleRepository` 에 `Optional<InterviewSchedule> findByRoundIdAndApplicationIdAndStatus(Long roundId, Long applicationId, InterviewScheduleStatus status);` 추가 (import `Optional` 기존재).

- [x] **Step 3: 서비스**

`service/ApplicantInterviewService.java`:

```java
package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.query.ApplicantInterviewView;

public interface ApplicantInterviewService {

    /**
     * 지원자 본인의 면접 진행 단계(applicantPhase)와 phase 별 화면 데이터를 조회한다 (스펙 §9.2 API 13).
     * raw member/round status 는 노출하지 않는다 — 파생은 서버 단독(SSOT, §9.3).
     */
    ApplicantInterviewView getMyInterview(Long applicationId, Long currentUserId);
}
```

`service/GeneralApplicantInterviewService.java`:

```java
package com.duing.domain.interview.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewPhase;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewView;
import com.duing.domain.interview.service.dto.query.VisibleMembership;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralApplicantInterviewService implements ApplicantInterviewService {

    private final ApplicationRepository applicationRepository;
    private final InterviewRoundMemberRepository interviewRoundMemberRepository;
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final Clock clock;

    @Override
    public ApplicantInterviewView getMyInterview(Long applicationId, Long currentUserId) {
        Application application = applicationRepository.findById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        if (!application.getUser().getId().equals(currentUserId)) {
            throw new ApplicationDomainException.ForbiddenApplicationAccessException();
        }
        if (!application.getRecruitment().isUseInterview()) {
            throw new InterviewException.InterviewNotUsed();
        }

        LocalDateTime now = LocalDateTime.now(clock);
        Optional<VisibleMembership> visibleMembership = interviewRoundMemberRepository
                .findVisibleMembershipByApplicationId(applicationId);

        if (visibleMembership.isEmpty()) {
            // 이력 조회는 visible 부재 + INTERVIEW_PENDING 분기에서만 필요하다.
            boolean hasConcludedMembership = application.getStatus() == com.duing.domain.application.entity.ApplicationStatus.INTERVIEW_PENDING
                    && interviewRoundMemberRepository.existsConcludedMembershipByApplicationId(applicationId);
            return ApplicantInterviewView.phaseOnly(ApplicantInterviewPhase.derive(
                    application.getStatus(), null, null, hasConcludedMembership, false));
        }

        InterviewRound round = visibleMembership.get().round();
        InterviewRoundMember member = visibleMembership.get().member();
        boolean deadlinePassed = round.getAvailabilityDeadline() != null
                && now.isAfter(round.getAvailabilityDeadline());

        ApplicantInterviewPhase phase = ApplicantInterviewPhase.derive(
                application.getStatus(), round.getStatus(), member.getStatus(), false, deadlinePassed);

        return new ApplicantInterviewView(
                phase,
                round.getStatus() == RoundStatus.COLLECTING ? round.getAvailabilityDeadline() : null,
                round.getStatus() == RoundStatus.COLLECTING ? selectableSlots(round, applicationId) : null,
                member.getStatus() == RoundMemberStatus.NO_AVAILABLE_SLOT
                        ? member.getAlternativeAvailabilityText() : null,
                phase == ApplicantInterviewPhase.SCHEDULED ? scheduledInterview(round, applicationId) : null);
    }

    /** 재응답 화면용 — COLLECTING 라운드의 슬롯 전체에 내 선택 여부를 표시한다 (§9.2). */
    private List<ApplicantInterviewView.SelectableSlot> selectableSlots(InterviewRound round, Long applicationId) {
        Set<Long> selectedSlotIds = interviewAvailabilityRepository
                .findByRoundIdAndApplicationId(round.getId(), applicationId).stream()
                .map(InterviewAvailability::getSlotId)
                .collect(Collectors.toSet());
        return interviewSlotRepository.findByRoundIdOrderByStartTimeAsc(round.getId()).stream()
                .map(slot -> new ApplicantInterviewView.SelectableSlot(
                        slot.getId(), slot.getStartTime(), slot.getEndTime(),
                        selectedSlotIds.contains(slot.getId())))
                .toList();
    }

    private ApplicantInterviewView.ScheduledInterview scheduledInterview(InterviewRound round, Long applicationId) {
        return interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), applicationId, InterviewScheduleStatus.ASSIGNED)
                .flatMap(schedule -> interviewSlotRepository.findById(schedule.getSlotId()))
                .map(slot -> new ApplicantInterviewView.ScheduledInterview(
                        slot.getStartTime(), slot.getEndTime(), round.getLocation()))
                .orElse(null);
    }
}
```

(주의: `ApplicationStatus` 는 FQCN 인라인 대신 import 로 정리 — 구현 시 import 문에 추가하고 본문은 `ApplicationStatus.INTERVIEW_PENDING` 사용)

- [x] **Step 4: 응답 DTO + Api + Controller**

`controller/dto/response/ApplicantInterviewResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.service.dto.query.ApplicantInterviewPhase;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewView;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicantInterviewResponse(
        ApplicantInterviewPhase phase,
        LocalDateTime availabilityDeadline,
        List<SelectableSlot> slots,
        String myAlternativeText,
        ScheduledInterview scheduledInterview
) {
    public record SelectableSlot(Long slotId, LocalDateTime startTime, LocalDateTime endTime,
                                 boolean selected) {
        public static SelectableSlot from(ApplicantInterviewView.SelectableSlot slot) {
            return new SelectableSlot(slot.slotId(), slot.startTime(), slot.endTime(), slot.selected());
        }
    }

    public record ScheduledInterview(LocalDateTime startTime, LocalDateTime endTime, String location) {
        public static ScheduledInterview from(ApplicantInterviewView.ScheduledInterview interview) {
            return new ScheduledInterview(interview.startTime(), interview.endTime(), interview.location());
        }
    }

    public static ApplicantInterviewResponse from(ApplicantInterviewView view) {
        return new ApplicantInterviewResponse(
                view.phase(),
                view.availabilityDeadline(),
                view.slots() == null ? null : view.slots().stream().map(SelectableSlot::from).toList(),
                view.myAlternativeText(),
                view.scheduledInterview() == null ? null : ScheduledInterview.from(view.scheduledInterview()));
    }
}
```

`api/ApplicantInterviewApi.java`:

```java
package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.response.ApplicantInterviewResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "면접(지원자)", description = "지원자 본인의 면접 진행 조회")
@SecurityRequirement(name = "BearerAuth")
public interface ApplicantInterviewApi {

    @Operation(
            summary = "내 면접 진행 단계 조회",
            description = "서버가 파생한 진행 단계(applicantPhase)와 단계별 화면 데이터를 반환한다. "
                    + "응답 수집 중이면 선택 가능한 슬롯 목록(내 선택 표시)·마감 시각, 일정 확정 후면 면접 일시·장소가 포함된다. "
                    + "내부 상태(라운드/멤버 raw status)는 노출되지 않는다 — 진행 표시는 반드시 phase 만 사용할 것. "
                    + "평가~면접 구간 밖(제출됨·합격·불합격)은 NOT_APPLICABLE."
    )
    @GetMapping("/applications/{applicationId}/interview")
    ResponseEntity<ApiResponse<ApplicantInterviewResponse>> getMyInterview(
            @PathVariable Long applicationId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

`controller/ApplicantInterviewController.java`:

```java
package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.ApplicantInterviewApi;
import com.duing.domain.interview.controller.dto.response.ApplicantInterviewResponse;
import com.duing.domain.interview.service.ApplicantInterviewService;
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
public class ApplicantInterviewController implements ApplicantInterviewApi {

    private final ApplicantInterviewService applicantInterviewService;

    @Override
    public ResponseEntity<ApiResponse<ApplicantInterviewResponse>> getMyInterview(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(ApplicantInterviewResponse.from(
                applicantInterviewService.getMyInterview(applicationId, currentUser.id()))));
    }
}
```

- [x] **Step 5: GREEN 확인** — 15건 PASS

---

### Task 5: 전체 검증 + 커밋

- [x] **Step 1:** `./gradlew test` → BUILD SUCCESSFUL (755 + 12 + 15 = 782건 예상)

- [x] **Step 2:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 지원자 인터뷰 조회 API — applicantPhase SSOT 파생"
```

---

### Task 6: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [x] **Step 1: self-check 7항목** (기존 동일 명령)

- [x] **Step 2: push + PR** (자동 머지 금지)

```bash
git push -u origin feat/applicant-interview-view
gh pr create --base develop --title "feat(backend): 지원자 인터뷰 조회 API — applicantPhase SSOT" --body "$(cat <<'EOF'
## 🚀 작업 내용

지원자가 자기 지원서에서 보는 면접 진행 화면의 데이터 소스입니다. 서버가 라운드·멤버십·마감 상태를 조합해 진행 단계(applicantPhase)를 단독으로 파생하고, 프론트는 이 값만 소비합니다 — 내부 상태(제외 처리 등)가 화면 분기 어디에서도 새지 않게 하는 단일 진실 원천(SSOT) 설계입니다. 제외된 지원자는 "다음 면접 회차 안내 대기 중"이라는 중립 단계로만 보이고, 응답 본문 어디에도 내부 상태 문자열이 없음을 테스트로 고정했습니다.

발송 전(DRAFT) 라운드 멤버십도 지원자에게 보이지 않습니다 — 노출 술어가 DRAFT 를 제외하므로 "면접 회차 배정 대기 중"으로 표시됩니다. 응답 수집 중이면 선택 가능한 슬롯 목록(내 선택 표시)과 마감 시각이, 일정 확정 후면 면접 일시·장소가 함께 내려갑니다. 파생 로직은 순수 함수로 분리해 진리표 단위 테스트 12건으로 못박았습니다.

## 🤔 고민했던 내용

- 평가~면접 구간 밖 상태(제출됨·합격·불합격)는 400 대신 NOT_APPLICABLE(200)로 — 방어적 호출에도 안전한 계약이 낫다고 판단했습니다. 설계 문서의 경계 조항("application 결과 뷰가 담당")의 API 표현입니다.
- "가능한 시간 없음" 응답자는 배정 검토 단계에서도 NO_SLOT_REPORTED 로 보입니다 — 표 순서상 멤버 상태 행이 라운드 단계 행보다 우선이고, "운영진이 조율 중" 카피가 그 상황에 더 정확해서요.
- 정상 경로로 도달할 수 없는 조합(확정 라운드의 미응답자 등)은 새 단계를 만들지 않고 중립값(SCHEDULING)으로 방어합니다.

## 💬 리뷰 중점사항

- 파생 진리표가 스펙 §9.3 표·평가 순서와 1:1 인지.
- 응답 어디에도 raw 상태가 노출되지 않는지 (EXCLUDED 마스킹 테스트 포함).

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §5.4·§9.2 API 13·§9.3
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §9.3 표 9행 전부 → derive switch + 진리표 12건 + 통합 11건, 평가 순서(visible 우선) → 서비스 구조, 참여 이력 보정(DRAFT-only 제외) → existsConcludedMembership 쿼리(CANCELLED∨EXCLUDED) + DRAFT 테스트, §9.2(COLLECTING 데이터·SCHEDULED 일정·본인 검증) → 서비스 조립 + 통합 6·8·11·13, SSOT(누출 차단) → EXCLUDED 마스킹 테스트 + enum 이름 테스트.
- **플레이스홀더**: 없음. (서비스 코드의 FQCN 인라인 1곳은 구현 시 import 정리 지침 명시)
- **타입 일관성**: `derive` 5-인자 시그니처가 enum·테스트·서비스에서 일치, `VisibleMembership(round, member)` 순서가 Projections 와 일치, View↔Response 중첩 record 매핑 일치, 테스트 JSON 경로(`data.phase`·`data.slots[].selected` 등)가 Response 필드와 일치.
- **주의 메모**: ① `findVisibleMembershipByApplicationId` 의 `fetchOne` 은 불변식 위반 시 loud 실패(§16-6 일관). ② 통합 테스트 11(SCHEDULED)의 시간 단언은 ISO 직렬화 형식 의존 — 기존 응답 직렬화가 `2026-06-20T14:00:00` 형식임을 구현 중 확인하고 다르면 단언만 보정(의미 무변경). ③ EXCLUDED 마스킹 테스트는 응답 본문 전체 문자열 검사.

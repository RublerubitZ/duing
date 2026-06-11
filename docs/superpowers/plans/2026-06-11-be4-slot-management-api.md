# BE#4 — 슬롯 관리 API + Rule 2 + 알림 인프라 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라운드 슬롯 일괄 생성/수정/삭제 API 와 Rule 2(추가 슬롯 생성 시 NO_AVAILABLE_SLOT 멤버 자동 복귀+재알림), 그리고 발송(BE#5)이 재사용할 `INTERVIEW_AVAILABILITY_REQUESTED` 알림 인프라를 구현한다.

**Architecture:** 슬롯 변경(생성·수정·삭제)의 phase 가드는 **DRAFT·COLLECTING 한정** (§9.1 API 4 문언 — ASSIGNING 슬롯 추가 허용은 수동 배정 PR(BE#10)이 필요해질 때 완화, 좁게 시작). Rule 2 는 **COLLECTING && 마감 전**에만 발동: `round.increaseRequestSequence()`(1회) → 대상 멤버 `reinviteAfterSlotAdded()` → 멤버당 이벤트 발행 → AFTER_COMMIT 리스너가 dedupKey 로 알림 생성 (`InterviewScheduledListener` 패턴). 멤버 상태 전이 도메인 메서드의 첫 도입이며, 테스트 헬퍼 3중 복사를 `InterviewControllerTestSupport` 로 해소한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Spring Events / RestAssured + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.5(Rule 1·2)·§8(알림·dedupKey)·§9.1 API 4·§10.3(wizard Step3)
**리뷰 정책:** duing-code-reviewer + codex 기본 (BE#4 는 adversarial 필수 목록 아님)

---

## 핵심 결정

1. **phase 가드 = DRAFT·COLLECTING (생성 포함)**: §9.1 문언 그대로. §5.5 의 "ASSIGNING 중 슬롯 추가(수동 배정용)" 는 BE#10 이 소비자가 생길 때 가드를 완화한다 — 지금 열어두면 죽은 경로.
2. **Rule 2 발동 조건**: `round.status == COLLECTING && availabilityDeadline != null && now < deadline`. DRAFT 생성(wizard Step3)·마감 후 생성은 복귀/알림 없음. `now` 는 서비스가 주입.
3. **`reinviteAfterSlotAdded()` 는 alternativeAvailabilityText 를 초기화한다** — INVITED 로 돌아온 멤버에 이전 "가능 없음" 텍스트가 남으면 dashboard 표시가 오염되고, 재응답 시 어차피 새로 쓰인다.
4. **requestSequence 는 발동당 1회 증가** (멤버 수 무관) — dedupKey 에 applicationId 가 포함되어 대상자별로 분리된다 (스펙 §8). `increaseRequestSequence()` 는 BE#5 발송/재알림과 공용.
5. **이벤트는 `domain/interview/event/`** (InterviewScheduledEvent 전례), **리스너는 `domain/notification/listener/`** (InterviewScheduledListener 패턴: AFTER_COMMIT + REQUIRES_NEW + createIfAbsent + 예외 격리).
6. **PATCH 부분 수정**: startTime/endTime 은 쌍으로만 (한쪽만 오면 400), capacity 는 독립. 모든 필드 null 이면 no-op 204 (관용).
7. **테스트 헬퍼 공통화는 같은 패키지의 abstract `InterviewControllerTestSupport`** — repository 의존 헬퍼라 `common/fixture` static 으로는 불가, 도메인-로컬 base class 가 오염 최소. 기존 2개 컨트롤러 테스트를 상속으로 리팩토링 (단언 무변경).

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Modify | `domain/notification/entity/NotificationType.java` | `INTERVIEW_AVAILABILITY_REQUESTED` 추가 |
| Create | `domain/interview/event/InterviewAvailabilityRequestedEvent.java` | `(roundId, applicationId, requestSequence)` |
| Create | `domain/notification/listener/InterviewAvailabilityRequestedListener.java` | AFTER_COMMIT 알림 생성 |
| Modify | `domain/interview/entity/InterviewRound.java` | `increaseRequestSequence()` |
| Modify | `domain/interview/entity/InterviewRoundMember.java` | `reinviteAfterSlotAdded()` |
| Modify | `domain/interview/exception/InterviewException.java` | 신규 6: RoundNotFound·SlotNotFound·SlotChangeNotAllowedInCurrentPhase·SlotHasAvailability·SlotTimeChangeForbiddenForSelectedSlot·MemberTransitionNotAllowed + InvalidSlotTime |
| Modify | `domain/interview/repository/InterviewAvailabilityRepository.java` | `countBySlotId` 재추가 |
| Modify | `domain/interview/repository/InterviewRoundMemberRepository.java` | `findByRoundIdAndStatus` |
| Create | `controller/dto/request/CreateInterviewSlotsRequest.java` / `UpdateInterviewSlotRequest.java` | 검증 + toCommand |
| Create | `controller/dto/response/CreateInterviewSlotsResponse.java` | `createdSlotIds + reinvitedMemberCount` |
| Create | `service/dto/command/CreateInterviewSlotsCommand.java` / `UpdateInterviewSlotCommand.java` | 커맨드 |
| Create | `service/InterviewSlotService.java` + `service/GeneralInterviewSlotService.java` | 슬롯 도메인 서비스 |
| Create | `api/LeaderInterviewSlotApi.java` + `controller/LeaderInterviewSlotController.java` | POST 201 / PATCH 204 / DELETE 204 |
| Test Create | `entity/InterviewRoundDomainTest.java` (단위) | 전이 2메서드 TDD |
| Test Create | `controller/InterviewControllerTestSupport.java` | 공통 헬퍼 base |
| Test Modify | `LeaderInterviewRoundCandidateControllerTest` / `LeaderInterviewRoundCreateControllerTest` | 상속 리팩토링 (단언 무변경) |
| Test Create | `controller/LeaderInterviewSlotControllerTest.java` | RestAssured 16건 |

커밋 3개: ① 도메인 전이 메서드 ② 테스트 support 추출 ③ 슬롯 API+알림 인프라.

---

### Task 1: 브랜치 생성

- [ ] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-slot-management
```

---

### Task 2: 도메인 전이 메서드 (TDD 단위 사이클)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/entity/InterviewRoundDomainTest.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/entity/InterviewRound.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/entity/InterviewRoundMember.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/exception/InterviewException.java` (MemberTransitionNotAllowed 만 선반영)

- [ ] **Step 1: 단위 테스트 작성 (RED)**

```java
package com.duing.domain.interview.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.interview.exception.InterviewException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class InterviewRoundDomainTest {

    @Test
    @DisplayName("요청 회차는 0 에서 시작해 발동마다 1 씩 증가한다")
    void requestSequenceStartsAtZeroAndIncreases() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);

        assertThat(round.getRequestSequence()).isZero();
        round.increaseRequestSequence();
        round.increaseRequestSequence();
        assertThat(round.getRequestSequence()).isEqualTo(2);
    }

    @Test
    @DisplayName("가능 슬롯이 없다고 응답했던 멤버는 추가 슬롯 생성 시 INVITED 로 복귀하고 대체 가능시간 텍스트가 비워진다")
    void noAvailableSlotMemberIsReinvitedWithClearedText() {
        InterviewRoundMember member = InterviewRoundMember.invite(1L, 10L);
        ReflectionTestUtils.setField(member, "status", RoundMemberStatus.NO_AVAILABLE_SLOT);
        ReflectionTestUtils.setField(member, "alternativeAvailabilityText", "주말만 가능합니다");

        member.reinviteAfterSlotAdded();

        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.INVITED);
        assertThat(member.getAlternativeAvailabilityText()).isNull();
    }

    @Test
    @DisplayName("가능 슬롯 없음 상태가 아닌 멤버를 복귀시키려 하면 예외가 발생한다")
    void reinviteRequiresNoAvailableSlotStatus() {
        InterviewRoundMember invited = InterviewRoundMember.invite(1L, 10L);

        assertThatThrownBy(invited::reinviteAfterSlotAdded)
                .isInstanceOf(InterviewException.MemberTransitionNotAllowed.class);
    }
}
```

- [ ] **Step 2: RED 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests "com.duing.domain.interview.entity.InterviewRoundDomainTest"
```

Expected: 컴파일 실패 (메서드/예외 미존재) — TDD 의 RED.

- [ ] **Step 3: 구현 (GREEN)**

`InterviewException` 에 추가 (`CandidateAlreadyInActiveRound` 아래 409 섹션):

```java
    public static final class MemberTransitionNotAllowed extends InterviewException {
        private static final String MESSAGE = "현재 상태에서 허용되지 않는 멤버 상태 변경입니다.";
        public MemberTransitionNotAllowed() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
```

`InterviewRound` 의 `create` 아래에 추가:

```java
    /**
     * Availability 요청 회차를 1 올린다 — 발송·재알림·Rule 2 재초대 모두 발동 직전에 호출한다.
     * 안 올리면 직전 발송과 dedupKey 가 같아져 재알림이 deduped 되어 소실된다 (스펙 §8).
     */
    public void increaseRequestSequence() {
        this.requestSequence++;
    }
```

`InterviewRoundMember` 의 `invite` 아래에 추가 (import `InterviewException`):

```java
    /**
     * Rule 2 (스펙 §5.5): COLLECTING && 마감 전 추가 슬롯 생성 시 NO_AVAILABLE_SLOT → INVITED 복귀.
     * 대체 가능시간 텍스트는 비운다 — INVITED 상태에 이전 응답이 남으면 dashboard 표시가 오염되고,
     * 재응답 시 어차피 새로 쓰인다.
     */
    public void reinviteAfterSlotAdded() {
        if (this.status != RoundMemberStatus.NO_AVAILABLE_SLOT) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }
        this.status = RoundMemberStatus.INVITED;
        this.alternativeAvailabilityText = null;
    }
```

- [ ] **Step 4: GREEN 확인** — 같은 명령, 3건 PASS

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 라운드 요청 회차 증가·멤버 재초대 도메인 전이 추가"
```

---

### Task 3: 테스트 헬퍼 공통화 (리팩토링 — 단언 무변경)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/InterviewControllerTestSupport.java`
- Modify: `LeaderInterviewRoundCandidateControllerTest.java` / `LeaderInterviewRoundCreateControllerTest.java` (헬퍼 삭제 + 상속)

- [ ] **Step 1: support base 작성**

```java
package com.duing.domain.interview.controller;

import com.duing.common.IntegrationTestBase;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 면접 컨트롤러 통합 테스트 공통 헬퍼.
 * <p>
 * 헬퍼가 repository 저장까지 수행하므로 {@code common/fixture} 의 static 패턴으로는 옮길 수 없어
 * 도메인-로컬 base class 로 공통화한다 (BE#2~3 에서 3중 복사된 헬퍼의 단일화).
 * 셋업(@BeforeEach)은 테스트마다 다르므로 각 테스트가 유지한다.
 */
public abstract class InterviewControllerTestSupport extends IntegrationTestBase {

    @Autowired protected UserRepository userRepository;
    @Autowired protected ClubRepository clubRepository;
    @Autowired protected ClubMemberRepository clubMemberRepository;
    @Autowired protected RecruitmentRepository recruitmentRepository;
    @Autowired protected ApplicationRepository applicationRepository;
    @Autowired protected InterviewRoundRepository interviewRoundRepository;
    @Autowired protected InterviewRoundMemberRepository interviewRoundMemberRepository;
    @Autowired protected JwtTokenProvider jwtTokenProvider;

    protected final AtomicLong sequence = new AtomicLong(System.nanoTime());

    protected User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "interview" + unique + "@daegu.ac.kr",
                "hash",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    protected Club saveActiveClub(String name) {
        Club club = Club.create(name + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, "공학계열", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    protected Recruitment saveInterviewRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(Recruitment.createWithOptions(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10,
                ApplicationMode.SELF, null,
                true, TargetRole.MEMBER,
                today.plusDays(7), today.plusDays(14),
                false));
    }

    protected Recruitment saveSimpleRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(Recruitment.create(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10));
    }

    protected Application saveSubmittedApplication(Recruitment recruitment, String applicantSuffix) {
        User applicant = saveUser(applicantSuffix);
        return applicationRepository.save(Application.submit(recruitment, applicant, List.of()));
    }

    protected Application saveUnderReviewApplication(Recruitment recruitment, String applicantSuffix) {
        Application application = saveSubmittedApplication(recruitment, applicantSuffix);
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        return applicationRepository.save(application);
    }

    protected Application saveInterviewPendingApplication(Recruitment recruitment, String applicantSuffix) {
        Application application = saveUnderReviewApplication(recruitment, applicantSuffix);
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
        return applicationRepository.save(application);
    }

    protected Application saveApplicationWithStatus(Recruitment recruitment, String applicantSuffix,
                                                    ApplicationStatus status) {
        Application application = saveSubmittedApplication(recruitment, applicantSuffix);
        if (status != ApplicationStatus.SUBMITTED) {
            // 전이 규칙을 우회하는 셋업 한정 리플렉션 (saveActiveClub 의 ClubStatus 전례).
            ReflectionTestUtils.setField(application, "status", status);
            application = applicationRepository.save(application);
        }
        return application;
    }
}
```

- [ ] **Step 2: 기존 2개 테스트 리팩토링**

각 테스트에서: `extends IntegrationTestBase` → `extends InterviewControllerTestSupport`, 중복 `@Autowired` 필드(베이스에 있는 것)·`sequence`·헬퍼 메서드 삭제, 헬퍼 시그니처 차이 보정 — 기존 테스트의 `saveInterviewRecruitment(club, title)` 호출은 그대로, recruitment-필드 기반이던 `saveUnderReviewApplication("suffix")` 류는 `saveUnderReviewApplication(recruitment, "suffix")` 로 인자 추가. **단언·시나리오 무변경. import 정리.**

- [ ] **Step 3: 리팩토링 검증 (두 테스트 클래스 전체 PASS)**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests "com.duing.domain.interview.controller.*"
```

Expected: 25건 (10+15) PASS

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "test(backend): 면접 컨트롤러 테스트 헬퍼 공통화 (InterviewControllerTestSupport)"
```

---

### Task 4: 슬롯 API 통합 테스트 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/LeaderInterviewSlotControllerTest.java`

- [ ] **Step 1: 테스트 작성** (support 상속 — 슬롯/availability/notification 레포는 이 테스트만 쓰므로 자체 @Autowired)

```java
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
```

- [ ] **Step 2: RED 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests "com.duing.domain.interview.controller.LeaderInterviewSlotControllerTest"
```

Expected: 컴파일 성공 + 대부분 FAIL (엔드포인트 미존재 — 404 기대 케이스 2건은 우연 PASS 가능). **커밋하지 않는다.**

---

### Task 5: 구현 (GREEN)

- [ ] **Step 1: NotificationType + 이벤트 + 리스너**

`NotificationType` 의 `INTERVIEW_CANCELLED` 다음에 `INTERVIEW_AVAILABILITY_REQUESTED,` 추가.

`backend/src/main/java/com/duing/domain/interview/event/InterviewAvailabilityRequestedEvent.java`:

```java
package com.duing.domain.interview.event;

public record InterviewAvailabilityRequestedEvent(Long roundId, Long applicationId, int requestSequence) {}
```

`backend/src/main/java/com/duing/domain/notification/listener/InterviewAvailabilityRequestedListener.java` (InterviewScheduledListener 패턴):

```java
package com.duing.domain.notification.listener;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.event.InterviewAvailabilityRequestedEvent;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Availability 요청(발송·재알림·Rule 2 재초대) 시 지원자에게 알림을 생성한다.
 * dedupKey 에 요청 회차(q)가 포함되어 회차마다 새 알림이 가고, 같은 회차의 중복 발행은 걸러진다 (스펙 §8).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InterviewAvailabilityRequestedListener {

    private static final DateTimeFormatter DEADLINE_FORMATTER =
            DateTimeFormatter.ofPattern("MM/dd HH:mm");

    private final NotificationService notificationService;
    private final ApplicationRepository applicationRepository;
    private final InterviewRoundRepository interviewRoundRepository;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(InterviewAvailabilityRequestedEvent event) {
        try {
            Application application = applicationRepository.findWithRecruitmentAndClubById(event.applicationId())
                    .orElse(null);
            if (application == null) {
                log.warn("INTERVIEW_AVAILABILITY_REQUESTED 알림 생략 — application 없음: applicationId={}",
                        event.applicationId());
                return;
            }

            InterviewRound round = interviewRoundRepository.findById(event.roundId())
                    .orElse(null);
            if (round == null) {
                log.warn("INTERVIEW_AVAILABILITY_REQUESTED 알림 생략 — round 없음: roundId={}", event.roundId());
                return;
            }

            String clubName = application.getRecruitment().getClub().getName();
            // 요청이 발화되는 라운드는 COLLECTING(발송 가드가 deadline 을 요구)이라 null 이 아닌 게 정상 —
            // 방어적으로 null 이면 마감 없이 본문을 구성한다.
            String body = round.getAvailabilityDeadline() == null
                    ? "면접 가능 시간을 선택해주세요"
                    : round.getAvailabilityDeadline().format(DEADLINE_FORMATTER) + " 까지 선택해주세요";

            String dedupKey = "INTERVIEW_AVAILABILITY_REQUESTED:r=" + event.roundId()
                    + ":a=" + event.applicationId() + ":q=" + event.requestSequence();

            notificationService.createIfAbsent(new CreateNotificationCommand(
                    application.getUser().getId(),
                    NotificationType.INTERVIEW_AVAILABILITY_REQUESTED,
                    clubName + " 면접 가능 시간을 선택해주세요",
                    body,
                    "/me/applications/" + event.applicationId(),
                    Map.of("applicationId", event.applicationId(), "roundId", event.roundId()),
                    dedupKey));
        } catch (Exception failure) {
            log.warn("INTERVIEW_AVAILABILITY_REQUESTED 알림 처리 실패: roundId={}, applicationId={}",
                    event.roundId(), event.applicationId(), failure);
        }
    }
}
```

- [ ] **Step 2: 예외 6개 추가** (`InterviewException` — 404 섹션 신설 + 409 섹션에 추가, `InvalidDeadline` 아래 400 에 `InvalidSlotTime`)

```java
    // ── 404 Not Found ─────────────────────────────────────────────────────────

    public static final class RoundNotFound extends InterviewException {
        private static final String MESSAGE = "면접 라운드를 찾을 수 없습니다.";
        public RoundNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static final class SlotNotFound extends InterviewException {
        private static final String MESSAGE = "면접 슬롯을 찾을 수 없습니다.";
        public SlotNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
```

```java
    public static final class SlotChangeNotAllowedInCurrentPhase extends InterviewException {
        private static final String MESSAGE = "현재 단계에서는 슬롯을 변경할 수 없습니다.";
        public SlotChangeNotAllowedInCurrentPhase() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class SlotHasAvailability extends InterviewException {
        private static final String MESSAGE = "해당 슬롯을 선택한 지원자가 있어 삭제할 수 없습니다.";
        public SlotHasAvailability() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class SlotTimeChangeForbiddenForSelectedSlot extends InterviewException {
        private static final String MESSAGE = "지원자가 선택한 슬롯의 시간은 변경할 수 없습니다. 정원만 변경할 수 있습니다.";
        public SlotTimeChangeForbiddenForSelectedSlot() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
```

```java
    public static final class InvalidSlotTime extends InterviewException {
        private static final String MESSAGE = "슬롯 종료 시각은 시작 시각 이후여야 합니다.";
        public InvalidSlotTime() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
```

- [ ] **Step 3: 레포 2건** — `InterviewAvailabilityRepository` 에 `long countBySlotId(Long slotId);`, `InterviewRoundMemberRepository` 에 `List<InterviewRoundMember> findByRoundIdAndStatus(Long roundId, RoundMemberStatus status);` (import 추가)

- [ ] **Step 4: DTO 4종**

`CreateInterviewSlotsCommand.java`:

```java
package com.duing.domain.interview.service.dto.command;

import java.time.LocalDateTime;
import java.util.List;

public record CreateInterviewSlotsCommand(
        Long roundId,
        Long currentUserId,
        List<SlotItem> slots
) {
    public record SlotItem(LocalDateTime startTime, LocalDateTime endTime, int capacity) {}
}
```

`UpdateInterviewSlotCommand.java`:

```java
package com.duing.domain.interview.service.dto.command;

import java.time.LocalDateTime;

public record UpdateInterviewSlotCommand(
        Long slotId,
        Long currentUserId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        Integer capacity
) {}
```

`CreateInterviewSlotsRequest.java`:

```java
package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.List;

public record CreateInterviewSlotsRequest(
        @NotEmpty(message = "슬롯 목록은 필수 입력값입니다.")
        List<@Valid SlotItem> slots
) {
    public record SlotItem(
            @NotNull(message = "슬롯 시작 시각은 필수 입력값입니다.")
            LocalDateTime startTime,
            @NotNull(message = "슬롯 종료 시각은 필수 입력값입니다.")
            LocalDateTime endTime,
            @Min(value = 1, message = "동시 면접 인원은 1 이상이어야 합니다.")
            int capacity
    ) {}

    public CreateInterviewSlotsCommand toCommand(Long roundId, Long currentUserId) {
        List<CreateInterviewSlotsCommand.SlotItem> slotItems = slots.stream()
                .map(slot -> new CreateInterviewSlotsCommand.SlotItem(
                        slot.startTime(), slot.endTime(), slot.capacity()))
                .toList();
        return new CreateInterviewSlotsCommand(roundId, currentUserId, slotItems);
    }
}
```

`UpdateInterviewSlotRequest.java`:

```java
package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;
import jakarta.validation.constraints.Min;
import java.time.LocalDateTime;

public record UpdateInterviewSlotRequest(
        // startTime/endTime 은 쌍으로만 변경할 수 있다 — 한쪽만 오면 400 (서비스 검증).
        LocalDateTime startTime,
        LocalDateTime endTime,
        @Min(value = 1, message = "동시 면접 인원은 1 이상이어야 합니다.")
        Integer capacity
) {
    public UpdateInterviewSlotCommand toCommand(Long slotId, Long currentUserId) {
        return new UpdateInterviewSlotCommand(slotId, currentUserId, startTime, endTime, capacity);
    }
}
```

`CreateInterviewSlotsResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

import java.util.List;

public record CreateInterviewSlotsResponse(List<Long> createdSlotIds, int reinvitedMemberCount) {}
```

- [ ] **Step 5: 서비스**

`InterviewSlotService.java`:

```java
package com.duing.domain.interview.service;

import com.duing.domain.interview.controller.dto.response.CreateInterviewSlotsResponse;
import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;

public interface InterviewSlotService {

    /**
     * 라운드에 슬롯을 일괄 생성한다 (DRAFT·COLLECTING 한정 — 스펙 §9.1 API 4).
     * COLLECTING && 마감 전이면 Rule 2: NO_AVAILABLE_SLOT 멤버를 INVITED 로 복귀시키고 재알림을 발화한다 (스펙 §5.5).
     */
    CreateInterviewSlotsResponse createSlots(CreateInterviewSlotsCommand createCommand);

    /**
     * 슬롯을 부분 수정한다. 시간은 아무도 선택하지 않은 슬롯만, 정원은 선택 여부와 무관하게 변경 가능.
     */
    void updateSlot(UpdateInterviewSlotCommand updateCommand);

    /**
     * 슬롯을 삭제한다 (soft delete). 선택한 지원자가 있으면 409.
     */
    void deleteSlot(Long slotId, Long currentUserId);
}
```

`GeneralInterviewSlotService.java`:

```java
package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.controller.dto.response.CreateInterviewSlotsResponse;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.event.InterviewAvailabilityRequestedEvent;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewSlotService implements InterviewSlotService {

    private final InterviewRoundRepository interviewRoundRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewRoundMemberRepository interviewRoundMemberRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;
    private final ApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public CreateInterviewSlotsResponse createSlots(CreateInterviewSlotsCommand createCommand) {
        InterviewRound round = getRoundWithManagerAuth(createCommand.roundId(), createCommand.currentUserId());
        requireSlotChangeablePhase(round);

        for (CreateInterviewSlotsCommand.SlotItem slotItem : createCommand.slots()) {
            if (!slotItem.endTime().isAfter(slotItem.startTime())) {
                throw new InterviewException.InvalidSlotTime();
            }
        }

        List<InterviewSlot> savedSlots = interviewSlotRepository.saveAll(
                createCommand.slots().stream()
                        .map(slotItem -> InterviewSlot.create(
                                round.getId(), slotItem.startTime(), slotItem.endTime(), slotItem.capacity()))
                        .toList());

        int reinvitedMemberCount = reinviteNoAvailableSlotMembers(round, LocalDateTime.now());

        return new CreateInterviewSlotsResponse(
                savedSlots.stream().map(InterviewSlot::getId).toList(),
                reinvitedMemberCount);
    }

    /**
     * Rule 2 (스펙 §5.5): COLLECTING && 마감 전 추가 슬롯 생성 시 NO_AVAILABLE_SLOT 멤버를
     * INVITED 로 복귀시키고 재알림을 발화한다. 마감 후엔 [마감 연장]이 먼저고,
     * DRAFT(발송 전)·ASSIGNING 이후 단계에서는 발동하지 않는다.
     * requestSequence 는 발동당 1 회 증가 — dedupKey 의 applicationId 가 대상자별 분리를 담당한다 (스펙 §8).
     */
    private int reinviteNoAvailableSlotMembers(InterviewRound round, LocalDateTime now) {
        boolean rule2Active = round.getStatus() == RoundStatus.COLLECTING
                && round.getAvailabilityDeadline() != null
                && now.isBefore(round.getAvailabilityDeadline());
        if (!rule2Active) {
            return 0;
        }

        List<InterviewRoundMember> stuckMembers = interviewRoundMemberRepository
                .findByRoundIdAndStatus(round.getId(), RoundMemberStatus.NO_AVAILABLE_SLOT);
        if (stuckMembers.isEmpty()) {
            return 0;
        }

        round.increaseRequestSequence();
        for (InterviewRoundMember stuckMember : stuckMembers) {
            stuckMember.reinviteAfterSlotAdded();
            eventPublisher.publishEvent(new InterviewAvailabilityRequestedEvent(
                    round.getId(), stuckMember.getApplicationId(), round.getRequestSequence()));
        }
        return stuckMembers.size();
    }

    @Override
    @Transactional
    public void updateSlot(UpdateInterviewSlotCommand updateCommand) {
        InterviewSlot slot = interviewSlotRepository.findById(updateCommand.slotId())
                .orElseThrow(InterviewException.SlotNotFound::new);
        InterviewRound round = getRoundWithManagerAuth(slot.getRoundId(), updateCommand.currentUserId());
        requireSlotChangeablePhase(round);

        boolean startTimeGiven = updateCommand.startTime() != null;
        boolean endTimeGiven = updateCommand.endTime() != null;
        if (startTimeGiven != endTimeGiven) {
            throw new InterviewException.InvalidSlotTime();
        }
        if (startTimeGiven) {
            if (!updateCommand.endTime().isAfter(updateCommand.startTime())) {
                throw new InterviewException.InvalidSlotTime();
            }
            if (interviewAvailabilityRepository.countBySlotId(slot.getId()) > 0) {
                throw new InterviewException.SlotTimeChangeForbiddenForSelectedSlot();
            }
            slot.updateTime(updateCommand.startTime(), updateCommand.endTime());
        }
        if (updateCommand.capacity() != null) {
            slot.updateCapacity(updateCommand.capacity());
        }
    }

    @Override
    @Transactional
    public void deleteSlot(Long slotId, Long currentUserId) {
        InterviewSlot slot = interviewSlotRepository.findById(slotId)
                .orElseThrow(InterviewException.SlotNotFound::new);
        InterviewRound round = getRoundWithManagerAuth(slot.getRoundId(), currentUserId);
        requireSlotChangeablePhase(round);

        if (interviewAvailabilityRepository.countBySlotId(slot.getId()) > 0) {
            throw new InterviewException.SlotHasAvailability();
        }
        interviewSlotRepository.delete(slot);
    }

    private InterviewRound getRoundWithManagerAuth(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findById(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        Recruitment recruitment = recruitmentRepository.findById(round.getRecruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());
        return round;
    }

    /**
     * 슬롯 변경(생성·수정·삭제) phase 가드 — DRAFT·COLLECTING 한정 (스펙 §9.1 API 4).
     * ASSIGNING 중 수동 배정용 슬롯 추가 허용(§5.5)은 소비자가 생기는 BE#10 에서 완화한다.
     */
    private void requireSlotChangeablePhase(InterviewRound round) {
        if (round.getStatus() != RoundStatus.DRAFT && round.getStatus() != RoundStatus.COLLECTING) {
            throw new InterviewException.SlotChangeNotAllowedInCurrentPhase();
        }
    }
}
```

- [ ] **Step 6: Api + Controller**

`LeaderInterviewSlotApi.java`:

```java
package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.request.CreateInterviewSlotsRequest;
import com.duing.domain.interview.controller.dto.request.UpdateInterviewSlotRequest;
import com.duing.domain.interview.controller.dto.response.CreateInterviewSlotsResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "면접 슬롯(운영진)", description = "운영진 전용 면접 슬롯 관리")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderInterviewSlotApi {

    @Operation(
            summary = "면접 슬롯 일괄 생성",
            description = "라운드에 슬롯을 일괄 등록한다 — wizard Step3 및 dashboard 의 [추가 슬롯 생성]. "
                    + "준비 중(DRAFT)·응답 수집 중(COLLECTING) 라운드에서만 가능. "
                    + "응답 수집 중 && 마감 전이면 '가능 슬롯 없음' 으로 응답했던 멤버가 INVITED 로 복귀하고 재알림이 발송된다 (Rule 2). "
                    + "마감이 지났다면 마감 연장이 먼저다 — 복귀·알림은 발동하지 않는다."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/slots")
    ResponseEntity<ApiResponse<CreateInterviewSlotsResponse>> createSlots(
            @PathVariable Long roundId,
            @Valid @RequestBody CreateInterviewSlotsRequest createInterviewSlotsRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 슬롯 수정",
            description = "시간(start/end 쌍)·정원을 부분 수정한다. 지원자가 선택한 슬롯은 정원만 변경 가능. "
                    + "DRAFT·COLLECTING 라운드에서만 가능."
    )
    @PatchMapping("/leader/interview-slots/{slotId}")
    ResponseEntity<ApiResponse<Void>> updateSlot(
            @PathVariable Long slotId,
            @Valid @RequestBody UpdateInterviewSlotRequest updateInterviewSlotRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 슬롯 삭제",
            description = "슬롯을 삭제한다(soft delete). 지원자가 선택한 슬롯은 삭제 불가. DRAFT·COLLECTING 라운드에서만 가능."
    )
    @DeleteMapping("/leader/interview-slots/{slotId}")
    ResponseEntity<ApiResponse<Void>> deleteSlot(
            @PathVariable Long slotId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

`LeaderInterviewSlotController.java`:

```java
package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.LeaderInterviewSlotApi;
import com.duing.domain.interview.controller.dto.request.CreateInterviewSlotsRequest;
import com.duing.domain.interview.controller.dto.request.UpdateInterviewSlotRequest;
import com.duing.domain.interview.controller.dto.response.CreateInterviewSlotsResponse;
import com.duing.domain.interview.service.InterviewSlotService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class LeaderInterviewSlotController implements LeaderInterviewSlotApi {

    private final InterviewSlotService interviewSlotService;

    @Override
    public ResponseEntity<ApiResponse<CreateInterviewSlotsResponse>> createSlots(
            @PathVariable Long roundId,
            @Valid @RequestBody CreateInterviewSlotsRequest createInterviewSlotsRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        CreateInterviewSlotsResponse response = interviewSlotService.createSlots(
                createInterviewSlotsRequest.toCommand(roundId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateSlot(
            @PathVariable Long slotId,
            @Valid @RequestBody UpdateInterviewSlotRequest updateInterviewSlotRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewSlotService.updateSlot(updateInterviewSlotRequest.toCommand(slotId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteSlot(
            @PathVariable Long slotId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        interviewSlotService.deleteSlot(slotId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 7: GREEN 확인** — `./gradlew test --tests "com.duing.domain.interview.controller.LeaderInterviewSlotControllerTest"` → 16건 PASS

---

### Task 6: 전체 검증 + 커밋

- [ ] **Step 1:** `./gradlew test` → BUILD SUCCESSFUL (704 + 16 + 3 = 723건 예상, Task 3 리팩토링 포함 무손실)

- [ ] **Step 2:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 면접 슬롯 관리 API + Rule 2 자동 복귀·재알림"
```

---

### Task 7: self-check + PR 생성

- [ ] **Step 1: self-check 7항목** (BE#0~3 동일 명령)

- [ ] **Step 2: push + PR** (자동 머지 금지)

```bash
git push -u origin feat/interview-slot-management
gh pr create --base develop --title "feat(backend): 면접 슬롯 관리 API + Rule 2 재알림" --body "$(cat <<'EOF'
## 🚀 작업 내용

라운드 슬롯의 일괄 생성·수정·삭제 API 와, 추가 슬롯이 생기면 "가능한 시간이 없다"고 응답했던 지원자를 자동으로 다시 초대하고 재알림을 보내는 Rule 2 를 구현했습니다. wizard Step3(슬롯 일괄 생성)과 dashboard 의 [추가 슬롯 생성]·NO_AVAILABLE_SLOT 섹션이 이 API 를 사용합니다.

발송(후속 PR)이 재사용할 알림 인프라도 이 PR 에 들어갑니다 — INTERVIEW_AVAILABILITY_REQUESTED 타입, 이벤트, AFTER_COMMIT 리스너. 알림 중복 방지 키에 요청 회차가 들어가서 회차마다 새 알림이 가고, 같은 회차의 중복 발행은 걸러집니다. 회차 증가를 빠뜨리면 재알림이 통째로 사라지는 설계 함정은 도메인 메서드 주석과 테스트로 고정했습니다.

지원자가 이미 선택한 슬롯은 시간 변경·삭제가 막히고 정원만 바꿀 수 있으며, 슬롯 변경 자체가 준비 중(DRAFT)·응답 수집 중(COLLECTING) 단계에서만 허용됩니다.

## 🤔 고민했던 내용

- 배정 검토(ASSIGNING) 중 수동 배정용 슬롯 추가는 설계 문서에 여지가 있지만, 소비자(수동 배정 API)가 아직 없어 가드를 좁게 시작했습니다 — 필요해지는 PR 에서 완화합니다.
- 복귀한 멤버의 "대체 가능시간 텍스트"는 비웁니다. INVITED 로 돌아온 멤버에 이전 응답이 남으면 dashboard 표시가 오염되고, 재응답하면 어차피 새로 쓰입니다.
- 재알림 회차는 발동당 1회만 올립니다 — 중복 방지 키에 지원자 ID 가 포함되어 대상자별 분리는 키가 담당합니다.
- 세 번째 컨트롤러 테스트가 생기는 시점이라 3중 복사되던 테스트 헬퍼를 공통 베이스로 추출했습니다 (기존 테스트 단언 무변경).

## 💬 리뷰 중점사항

- Rule 2 발동 조건(COLLECTING && 마감 전)과 미발동 경계(DRAFT·마감 후)가 스펙 §5.5 와 일치하는지.
- 알림 리스너의 dedupKey 구성과 예외 격리가 기존 INTERVIEW_SCHEDULED 리스너 패턴과 일관적인지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §5.5·§8·§9.1 API 4
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §9.1 API 4(phase 가드·삭제 409·시간변경 CAPACITY_ONLY) → Task 5 Step 5 + 테스트 10~16, §5.5 Rule 2(발동 조건·복귀·재알림) → reinviteNoAvailableSlotMembers + 테스트 2~4, §8(dedupKey·sequence 발동당 1회) → 리스너 + 도메인 메서드 + 테스트 2, §10.3 Step3(capacity 필수) → request 검증. RESPONDED 무영향(Rule 1) → 테스트 2.
- **플레이스홀더**: 없음.
- **타입 일관성**: `CreateInterviewSlotsCommand.SlotItem` ↔ Request.SlotItem 매핑, `reinviteAfterSlotAdded`/`increaseRequestSequence` 가 Task 2 정의와 Task 5 사용처 일치, dedupKey 형식이 리스너·테스트에서 동일 문자열, `findByRoundIdAndStatus` 시그니처 일치.
- **주의 메모**: ① 테스트의 `existsByUserIdAndDedupKey` 는 AFTER_COMMIT 리스너 실행 후 검증 — RestAssured HTTP 트랜잭션이 커밋되므로 동기적으로 확인 가능하나, 리스너가 REQUIRES_NEW 비동기였다면 대기 필요 (현 리스너는 동기 AFTER_COMMIT — InterviewScheduledListener 와 동일). ② Task 3 리팩토링에서 기존 테스트의 헬퍼 시그니처가 recruitment 인자 추가로 바뀌므로 호출부 기계 치환 필요 — 단언 무변경 원칙.

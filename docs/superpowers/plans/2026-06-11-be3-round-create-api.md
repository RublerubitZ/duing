# BE#3 — 면접 라운드 생성 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** wizard Step2 완료 시점의 첫 persist — 면접 대상 선정(`UNDER_REVIEW→INTERVIEW_PENDING` 일괄 전이)과 라운드(DRAFT)+멤버 생성을 한 트랜잭션으로 처리하는 `POST /api/v1/leader/recruitments/{recruitmentId}/interview-rounds` 를 구현한다.

**Architecture:** **첫 writer PR — "placement-active 멤버십 최대 1개" 불변식의 첫 강제 지점** (스펙 §5.4·§7·§16). 동시 생성 race 는 ① 대상 application 행 `PESSIMISTIC_WRITE`(같은 지원자 경합 직렬화) ② DRAFT partial unique 23505→409 변환(같은 모집 경합) 두 겹으로 차단한다. 전이는 `Application.transitionTo` 도메인 규칙을 그대로 타고 상태 이력을 남긴다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / RestAssured + Testcontainers (동시성 테스트 포함)

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.4·§7(동시성)·§9.1 API 2·§10.3(wizard lifecycle)·§16
**리뷰 정책:** duing-code-reviewer + codex 기본 + **codex adversarial 필수** (스펙 §12 — 상태전이·동시성·데이터무결성)

---

## 핵심 결정

1. **잠금 → 검증 → 생성 순서**: application 행 잠금(ORDER BY id — 교착 방지) 후 placement 검증 — 같은 지원자를 노리는 동시 생성은 행 잠금에서 직렬화된 뒤 후행 TX 가 placement 검증(409)에 걸린다. 같은 모집의 서로 다른 지원자 경합은 DRAFT partial unique 가 INSERT 시점에 차단(23505→409, `uk_club_member` 처리 전례).
2. **DRAFT 사전 체크 + 23505 이중화**: 사전 `existsByRecruitmentIdAndStatus` 는 친절한 fast-fail, race 의 최종 방어는 DB unique.
3. **대기열 재수용**: `INTERVIEW_PENDING` 후보는 전이 없이 멤버로만 추가 (이력 기록 없음 — 상태 변화가 없으므로). `UNDER_REVIEW` 만 전이+이력.
4. **deadline 은 DRAFT 동안 nullable** — non-null 이면 미래 검증(400, `InvalidDeadline`). 발송 시 재검증은 BE#5.
5. **applicationIds 중복은 dedupe** (`LinkedHashSet` — `bulkUpdateStatus` 전례), 빈 배열은 `@NotEmpty` 400.
6. **interview 서비스가 application 도메인을 조작하는 cross-domain 트랜잭션**: 선정+생성 원자성은 스펙 §10.3 요구. 전이 규칙은 `Application.transitionTo` 가 보유하므로 서비스는 orchestration 만 한다 (application 서비스가 interview 레포를 쓰는 기존 전례의 역방향).
7. 응답은 `CreateInterviewRoundResponse(roundId)` record + 201.

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Modify | `domain/interview/api/LeaderInterviewRoundApi.java` | `createRound` 메서드 추가 |
| Modify | `domain/interview/controller/LeaderInterviewRoundController.java` | 구현 (201) |
| Create | `domain/interview/controller/dto/request/CreateInterviewRoundRequest.java` | 검증 어노테이션 + toCommand |
| Create | `domain/interview/controller/dto/response/CreateInterviewRoundResponse.java` | `{roundId}` |
| Create | `domain/interview/service/dto/command/CreateInterviewRoundCommand.java` | 쓰기 커맨드 |
| Modify | `domain/interview/service/InterviewRoundService.java` | `createRound` 시그니처 |
| Modify | `domain/interview/service/GeneralInterviewRoundService.java` | 트랜잭션 본체 + 의존 4개 추가 |
| Modify | `domain/interview/exception/InterviewException.java` | 신규 4 + `InvalidDeadline` 재도입 |
| Modify | `domain/interview/repository/InterviewRoundRepository.java` | `existsByRecruitmentIdAndStatus` |
| Modify | `domain/interview/repository/InterviewRoundMemberRepositoryCustom.java` + `Impl` | `findApplicationIdsWithPlacementActiveMembership` |
| Modify | `domain/application/repository/ApplicationRepository.java` | `findAllByIdInForUpdate` (PESSIMISTIC_WRITE) |
| Test | `backend/src/test/java/com/duing/domain/interview/controller/LeaderInterviewRoundCreateControllerTest.java` | RestAssured 15건 (동시성 1건 포함) |

---

### Task 1: 브랜치 생성

- [ ] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-round-create
```

---

### Task 2: 통합 테스트 작성 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/LeaderInterviewRoundCreateControllerTest.java`

`LeaderInterviewRoundCandidateControllerTest` 의 헬퍼 패턴을 따른다 (같은 패키지라 헬퍼 복사 — 공통 fixture 추출은 세 번째 클래스 등장 시점인 지금이 적기이나, 이 PR 은 검증 대상이 많아 복사 유지 후 BE#4 에서 추출한다).

- [ ] **Step 1: 테스트 작성**

```java
package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
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
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
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

// wizard Step2 의 첫 persist — 면접 대상 선정 + 라운드(DRAFT) + 멤버 생성이 한 트랜잭션으로
// 처리되는지, placement 불변식과 DRAFT 1개 제약이 강제되는지 검증한다 (스펙 §9.1 API 2·§7·§16).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewRoundCreateControllerTest extends IntegrationTestBase {

    private static final String CREATE_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-rounds";

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private ApplicationStatusHistoryRepository applicationStatusHistoryRepository;
    @Autowired private InterviewRoundRepository interviewRoundRepository;
    @Autowired private InterviewRoundMemberRepository interviewRoundMemberRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("라운드생성동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "라운드생성모집");
    }

    @Test
    @DisplayName("서류 검토 중 지원자와 대기열 지원자를 함께 선정하면 라운드가 DRAFT 로 생성되고 전이·이력·멤버가 한 번에 처리된다")
    void createRoundSelectsCandidatesAtomically() {
        Application reviewing1 = saveUnderReviewApplication("서류1");
        Application reviewing2 = saveUnderReviewApplication("서류2");
        Application queued = saveInterviewPendingApplication("대기열");
        long queuedHistoryBefore = applicationStatusHistoryRepository
                .findByApplicationIdOrderByCreatedAtDesc(queued.getId()).size();

        Integer roundId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "1차 면접",
                        "availabilityDeadline", LocalDateTime.now().plusDays(7).toString(),
                        "location", "본관 201호",
                        "applicationIds", List.of(reviewing1.getId(), reviewing2.getId(), queued.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.roundId", notNullValue())
                .extract().path("data.roundId");

        InterviewRound round = interviewRoundRepository.findById(roundId.longValue()).orElseThrow();
        assertThat(round.getStatus()).isEqualTo(RoundStatus.DRAFT);
        assertThat(round.getTitle()).isEqualTo("1차 면접");
        assertThat(round.getLocation()).isEqualTo("본관 201호");

        List<InterviewRoundMember> members = interviewRoundMemberRepository.findAll().stream()
                .filter(member -> member.getRoundId().equals(round.getId()))
                .toList();
        assertThat(members).hasSize(3);
        assertThat(members).allMatch(member -> member.getStatus() == RoundMemberStatus.INVITED);

        // UNDER_REVIEW 후보는 INTERVIEW_PENDING 으로 전이 + 이력 기록
        assertThat(applicationRepository.findById(reviewing1.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.INTERVIEW_PENDING);
        assertThat(applicationStatusHistoryRepository
                .findByApplicationIdOrderByCreatedAtDesc(reviewing1.getId()))
                .isNotEmpty();
        // 대기열 후보는 상태 유지 + 이력 추가 없음
        assertThat(applicationRepository.findById(queued.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.INTERVIEW_PENDING);
        assertThat(applicationStatusHistoryRepository
                .findByApplicationIdOrderByCreatedAtDesc(queued.getId()))
                .hasSize((int) queuedHistoryBefore);
    }

    @Test
    @DisplayName("availabilityDeadline 없이도 라운드를 만들 수 있다 — 마감은 발송 전까지만 정하면 된다")
    void deadlineIsOptionalInDraft() {
        Application reviewing = saveUnderReviewApplication("마감없음");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(reviewing.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("availabilityDeadline 이 현재 이전이면 라운드를 만들 수 없다")
    void pastDeadlineIsRejected() {
        Application reviewing = saveUnderReviewApplication("과거마감");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "1차 면접",
                        "availabilityDeadline", LocalDateTime.now().minusHours(1).toString(),
                        "applicationIds", List.of(reviewing.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("선정 불가 상태(SUBMITTED) 지원자가 섞이면 전체가 거부되고 아무것도 변하지 않는다")
    void ineligibleStatusRejectsWholeRequestAtomically() {
        Application reviewing = saveUnderReviewApplication("정상후보");
        Application submitted = saveSubmittedApplication("미열람");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접",
                        "applicationIds", List.of(reviewing.getId(), submitted.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        // 원자성: 정상 후보도 전이되지 않았고 라운드도 생성되지 않았다
        assertThat(applicationRepository.findById(reviewing.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.UNDER_REVIEW);
        assertThat(interviewRoundRepository.findAll().stream()
                .filter(round -> round.getRecruitmentId().equals(recruitment.getId())))
                .isEmpty();
    }

    @Test
    @DisplayName("이미 합격 처리된 지원자는 면접 대상으로 선정할 수 없다")
    void acceptedApplicantIsRejected() {
        Application accepted = saveSubmittedApplication("합격자");
        ReflectionTestUtils.setField(accepted, "status", ApplicationStatus.ACCEPTED);
        applicationRepository.save(accepted);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(accepted.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("다른 모집의 지원자를 선정 목록에 넣으면 거부된다")
    void candidateFromOtherRecruitmentIsRejected() {
        Club otherClub = saveActiveClub("타동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, saveUser("타리더")));
        Recruitment otherRecruitment = saveInterviewRecruitment(otherClub, "타모집");
        User applicant = saveUser("타지원자");
        Application otherApplication = applicationRepository.save(
                Application.submit(otherRecruitment, applicant, List.of()));
        otherApplication.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        applicationRepository.save(otherApplication);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(otherApplication.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("이미 진행 중인 라운드에 소속된 지원자를 다시 선정하면 409 로 거부된다")
    void candidateAlreadyInActiveRoundIsRejected() {
        Application placed = saveInterviewPendingApplication("기소속");
        InterviewRound collectingRound = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(3), null, RoundStatus.COLLECTING));
        interviewRoundMemberRepository.save(
                InterviewRoundMember.invite(collectingRound.getId(), placed.getId()));
        Application fresh = saveUnderReviewApplication("신규후보");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "2차 면접",
                        "applicationIds", List.of(placed.getId(), fresh.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());

        // 원자성: 신규 후보도 전이되지 않았다
        assertThat(applicationRepository.findById(fresh.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.UNDER_REVIEW);
    }

    @Test
    @DisplayName("모집에 이미 준비 중(DRAFT) 라운드가 있으면 새 라운드를 만들 수 없다")
    void secondDraftRoundIsRejected() {
        interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        Application reviewing = saveUnderReviewApplication("후보");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "2차 면접", "applicationIds", List.of(reviewing.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("존재하지 않는 지원서가 포함되면 404 를 반환한다")
    void unknownApplicationIdReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(999_999L)))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("선정 대상이 비어 있으면 400 을 반환한다")
    void emptyApplicationIdsIsRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of()))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("중복으로 선택된 지원자는 한 번만 멤버로 등록된다")
    void duplicateApplicationIdsAreDeduplicated() {
        Application reviewing = saveUnderReviewApplication("중복선택");

        Integer roundId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접",
                        "applicationIds", List.of(reviewing.getId(), reviewing.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data.roundId");

        long memberCount = interviewRoundMemberRepository.findAll().stream()
                .filter(member -> member.getRoundId().equals(roundId.longValue()))
                .count();
        assertThat(memberCount).isEqualTo(1);
    }

    @Test
    @DisplayName("해당 동아리 운영진이 아니면 라운드를 만들 수 없다")
    void nonManagerCannotCreateRound() {
        User outsider = saveUser("외부인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());
        Application reviewing = saveUnderReviewApplication("후보");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(reviewing.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집에는 라운드를 만들 수 없다")
    void interviewNotUsedRecruitmentIsRejected() {
        Club club = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        LocalDate today = LocalDate.now();
        Recruitment simpleRecruitment = recruitmentRepository.save(Recruitment.create(club,
                "면접없는모집-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(1L)))
                .when().post(CREATE_PATH, simpleRecruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 모집에는 라운드를 만들 수 없다")
    void unknownRecruitmentReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(1L)))
                .when().post(CREATE_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("같은 모집에 동시에 라운드 생성을 요청하면 정확히 하나만 성공한다")
    void concurrentCreationAllowsExactlyOne() throws Exception {
        Application reviewing = saveUnderReviewApplication("동시성후보");
        Map<String, Object> requestBody = Map.of(
                "title", "1차 면접", "applicationIds", List.of(reviewing.getId()));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<java.util.concurrent.Future<Integer>> futures = java.util.stream.Stream.of(1, 2)
                    .map(attempt -> executor.submit(() -> {
                        ready.countDown();
                        start.await(5, TimeUnit.SECONDS);
                        return RestAssured.given()
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                                .contentType(ContentType.JSON)
                                .body(requestBody)
                                .when().post(CREATE_PATH, recruitment.getId())
                                .then().extract().statusCode();
                    }))
                    .toList();
            ready.await(5, TimeUnit.SECONDS);
            start.countDown();

            List<Integer> statusCodes = futures.stream()
                    .map(future -> {
                        try {
                            return future.get(30, TimeUnit.SECONDS);
                        } catch (Exception unexpected) {
                            throw new IllegalStateException(unexpected);
                        }
                    })
                    .collect(Collectors.toList());

            // 한쪽은 201, 다른 쪽은 409 (placement 잠금 직렬화 또는 DRAFT partial unique)
            assertThat(statusCodes).containsExactlyInAnyOrder(
                    HttpStatus.CREATED.value(), HttpStatus.CONFLICT.value());
        } finally {
            executor.shutdownNow();
        }

        // 라운드와 멤버가 정확히 1 개씩만 생성됐다
        long roundCount = interviewRoundRepository.findAll().stream()
                .filter(round -> round.getRecruitmentId().equals(recruitment.getId()))
                .count();
        long memberCount = interviewRoundMemberRepository.findAll().stream()
                .filter(member -> member.getApplicationId().equals(reviewing.getId()))
                .count();
        assertThat(roundCount).isEqualTo(1);
        assertThat(memberCount).isEqualTo(1);
    }

    // ── 헬퍼 (LeaderInterviewRoundCandidateControllerTest 패턴) ─────────────────

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "roundcreate" + unique + "@daegu.ac.kr",
                "hash",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, "공학계열", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveInterviewRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(Recruitment.createWithOptions(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10,
                ApplicationMode.SELF, null,
                true, TargetRole.MEMBER,
                today.plusDays(7), today.plusDays(14),
                false));
    }

    private Application saveSubmittedApplication(String applicantSuffix) {
        User applicant = saveUser(applicantSuffix);
        return applicationRepository.save(Application.submit(recruitment, applicant, List.of()));
    }

    private Application saveUnderReviewApplication(String applicantSuffix) {
        Application application = saveSubmittedApplication(applicantSuffix);
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        return applicationRepository.save(application);
    }

    private Application saveInterviewPendingApplication(String applicantSuffix) {
        Application application = saveUnderReviewApplication(applicantSuffix);
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
        return applicationRepository.save(application);
    }
}
```

- [ ] **Step 2: RED 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests "com.duing.domain.interview.controller.LeaderInterviewRoundCreateControllerTest"
```

Expected: **컴파일 성공 + 전부 FAIL** (엔드포인트 미존재 — 201 기대 케이스 404 등. `unknownRecruitmentReturnsNotFound` 는 우연 PASS 가능 — BE#2 RED 와 동일 양상, 정상). **커밋하지 않는다.**

---

### Task 3: 구현 (GREEN)

- [ ] **Step 1: `InterviewException` 에 5개 멤버 추가** (`InterviewNotUsed` 아래에)

```java
    public static final class CandidateNotEligible extends InterviewException {
        private static final String MESSAGE = "면접 대상으로 선정할 수 없는 상태의 지원자가 포함되어 있습니다.";
        public CandidateNotEligible() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class CandidateNotInRecruitment extends InterviewException {
        private static final String MESSAGE = "해당 모집의 지원자가 아닙니다.";
        public CandidateNotInRecruitment() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class InvalidDeadline extends InterviewException {
        private static final String MESSAGE = "면접 가능시간 마감은 현재 이후여야 합니다.";
        public InvalidDeadline() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    // ── 409 Conflict ──────────────────────────────────────────────────────────

    public static final class DraftRoundAlreadyExists extends InterviewException {
        private static final String MESSAGE = "이미 준비 중(DRAFT)인 면접 라운드가 있습니다.";
        public DraftRoundAlreadyExists() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class CandidateAlreadyInActiveRound extends InterviewException {
        private static final String MESSAGE = "이미 진행 중인 면접 라운드에 소속된 지원자가 포함되어 있습니다.";
        public CandidateAlreadyInActiveRound() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
```

- [ ] **Step 2: 레포지토리 3건**

`InterviewRoundRepository` 에 추가 (import `RoundStatus`):

```java
    boolean existsByRecruitmentIdAndStatus(Long recruitmentId, RoundStatus status);
```

`ApplicationRepository` 에 추가 (import `jakarta.persistence.LockModeType`, `org.springframework.data.jpa.repository.Lock`):

```java
    /**
     * 라운드 생성 시 대상 지원서 행을 잠가 동시 생성 race 를 직렬화한다 (스펙 §7).
     * ORDER BY id 고정으로 잠금 획득 순서를 일관시켜 교착을 방지한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM Application a WHERE a.id IN :ids ORDER BY a.id ASC")
    List<Application> findAllByIdInForUpdate(@Param("ids") Collection<Long> ids);
```

`InterviewRoundMemberRepositoryCustom` 에 추가 (import `java.util.Collection`):

```java
    /**
     * 주어진 지원서들 중 placement-active 멤버십(스펙 §5.4)을 이미 가진 applicationId 를 반환한다.
     * "placement-active 멤버십 최대 1개" 불변식(§16)의 라운드 생성 측 강제 지점.
     */
    List<Long> findApplicationIdsWithPlacementActiveMembership(Collection<Long> applicationIds);
```

`InterviewRoundMemberRepositoryImpl` 에 구현 추가 (기존 placement 조건과 동일 — import `java.util.Collection`):

```java
    @Override
    public List<Long> findApplicationIdsWithPlacementActiveMembership(Collection<Long> applicationIds) {
        return queryFactory
                .selectDistinct(interviewRoundMember.applicationId)
                .from(interviewRoundMember)
                .join(interviewRound).on(interviewRound.id.eq(interviewRoundMember.roundId))
                .where(
                        interviewRoundMember.applicationId.in(applicationIds),
                        interviewRoundMember.status.ne(RoundMemberStatus.EXCLUDED),
                        interviewRound.status.ne(RoundStatus.CANCELLED),
                        interviewRound.deletedAt.isNull()
                )
                .fetch();
    }
```

- [ ] **Step 3: command / request / response DTO**

`service/dto/command/CreateInterviewRoundCommand.java`:

```java
package com.duing.domain.interview.service.dto.command;

import java.time.LocalDateTime;
import java.util.List;

public record CreateInterviewRoundCommand(
        Long recruitmentId,
        Long currentUserId,
        String title,
        LocalDateTime availabilityDeadline,
        String location,
        List<Long> applicationIds
) {}
```

`controller/dto/request/CreateInterviewRoundRequest.java`:

```java
package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.CreateInterviewRoundCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;

public record CreateInterviewRoundRequest(
        @NotBlank(message = "라운드 제목은 필수 입력값입니다.")
        @Size(max = 100, message = "라운드 제목은 100자 이하여야 합니다.")
        String title,

        // DRAFT 동안 생략 가능 — 발송(DRAFT→COLLECTING) 시점에 필수가 된다 (스펙 §5.1).
        LocalDateTime availabilityDeadline,

        @Size(max = 200, message = "면접 장소는 200자 이하여야 합니다.")
        String location,

        @NotEmpty(message = "면접 대상자 목록은 필수 입력값입니다.")
        List<Long> applicationIds
) {
    public CreateInterviewRoundCommand toCommand(Long recruitmentId, Long currentUserId) {
        return new CreateInterviewRoundCommand(
                recruitmentId, currentUserId, title, availabilityDeadline, location, applicationIds);
    }
}
```

`controller/dto/response/CreateInterviewRoundResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

public record CreateInterviewRoundResponse(Long roundId) {
    public static CreateInterviewRoundResponse from(Long roundId) {
        return new CreateInterviewRoundResponse(roundId);
    }
}
```

- [ ] **Step 4: 서비스**

`InterviewRoundService` 에 추가:

```java
    /**
     * wizard Step2 의 첫 persist — 면접 대상 선정(UNDER_REVIEW→INTERVIEW_PENDING 전이)과
     * 라운드(DRAFT)·멤버 생성을 한 트랜잭션으로 처리한다 (스펙 §9.1 API 2·§10.3).
     */
    Long createRound(CreateInterviewRoundCommand createCommand);
```

`GeneralInterviewRoundService` — 필드 4개 추가 + 메서드 (import: `Application`/`ApplicationStatus`/`ApplicationDomainException`/`ApplicationRepository`/`ApplicationStatusHistory`/`ApplicationStatusHistoryRepository`/`InterviewRound`/`InterviewRoundMember`/`RoundStatus`/`InterviewRoundRepository`/`User`/`UserException`/`UserRepository`/`CreateInterviewRoundCommand`/`DataIntegrityViolationException`/`LocalDateTime`/`LinkedHashSet`/`Set`/`java.sql.SQLException`):

```java
    private final InterviewRoundRepository interviewRoundRepository;
    private final ApplicationRepository applicationRepository;
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository;
    private final UserRepository userRepository;
```

```java
    // V49 의 모집당 DRAFT 라운드 1개 partial unique (race 최종 방어선).
    private static final String DRAFT_ROUND_UNIQUE_INDEX = "uq_interview_round_draft_per_recruitment";
    // PostgreSQL unique_violation.
    private static final String POSTGRES_UNIQUE_VIOLATION_SQL_STATE = "23505";

    @Override
    @Transactional
    public Long createRound(CreateInterviewRoundCommand createCommand) {
        Recruitment recruitment = recruitmentRepository.findById(createCommand.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(createCommand.currentUserId(), recruitment.getClub().getId());

        if (!recruitment.isUseInterview()) {
            throw new InterviewException.InterviewNotUsed();
        }

        LocalDateTime now = LocalDateTime.now();
        if (createCommand.availabilityDeadline() != null
                && !createCommand.availabilityDeadline().isAfter(now)) {
            throw new InterviewException.InvalidDeadline();
        }

        // 친절한 사전 체크 — 동시 생성 race 는 아래 partial unique(23505) 가 최종 차단한다.
        if (interviewRoundRepository.existsByRecruitmentIdAndStatus(
                createCommand.recruitmentId(), RoundStatus.DRAFT)) {
            throw new InterviewException.DraftRoundAlreadyExists();
        }

        // 입력 ID 중복은 클라이언트 실수 보호 차원에서 제거하되 순서는 유지한다 (bulkUpdateStatus 전례).
        Set<Long> applicationIds = new LinkedHashSet<>(createCommand.applicationIds());

        // 같은 지원자를 두 라운드에 동시 배치하는 race 를 행 잠금으로 직렬화한다 (스펙 §7).
        // 후행 트랜잭션은 잠금 해제 후 아래 placement 검증에서 선행 커밋의 멤버십을 보고 409 로 떨어진다.
        List<Application> applications = applicationRepository.findAllByIdInForUpdate(applicationIds);
        if (applications.size() != applicationIds.size()) {
            throw new ApplicationDomainException.ApplicationNotFoundException();
        }

        for (Application application : applications) {
            if (!application.getRecruitment().getId().equals(createCommand.recruitmentId())) {
                throw new InterviewException.CandidateNotInRecruitment();
            }
            ApplicationStatus candidateStatus = application.getStatus();
            if (candidateStatus != ApplicationStatus.UNDER_REVIEW
                    && candidateStatus != ApplicationStatus.INTERVIEW_PENDING) {
                throw new InterviewException.CandidateNotEligible();
            }
        }

        // placement-active 멤버십 최대 1개 불변식 (스펙 §5.4·§16) 의 생성 측 강제.
        List<Long> alreadyPlacedIds = interviewRoundMemberRepository
                .findApplicationIdsWithPlacementActiveMembership(applicationIds);
        if (!alreadyPlacedIds.isEmpty()) {
            throw new InterviewException.CandidateAlreadyInActiveRound();
        }

        InterviewRound round;
        try {
            round = interviewRoundRepository.save(InterviewRound.create(
                    createCommand.recruitmentId(),
                    createCommand.title(),
                    createCommand.availabilityDeadline(),
                    createCommand.location()));
            interviewRoundRepository.flush();
        } catch (DataIntegrityViolationException racedDraftCreation) {
            if (isDraftRoundUniqueViolation(racedDraftCreation)) {
                throw new InterviewException.DraftRoundAlreadyExists();
            }
            throw racedDraftCreation;
        }

        User changedBy = userRepository.findById(createCommand.currentUserId())
                .orElseThrow(UserException.UserNotFoundException::new);
        for (Application application : applications) {
            // 대기열(INTERVIEW_PENDING) 재수용은 상태 변화가 없으므로 전이·이력을 만들지 않는다.
            if (application.getStatus() == ApplicationStatus.UNDER_REVIEW) {
                application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
                applicationStatusHistoryRepository.save(ApplicationStatusHistory.record(
                        application, ApplicationStatus.UNDER_REVIEW,
                        ApplicationStatus.INTERVIEW_PENDING, changedBy));
            }
        }

        List<InterviewRoundMember> members = applicationIds.stream()
                .map(applicationId -> InterviewRoundMember.invite(round.getId(), applicationId))
                .toList();
        interviewRoundMemberRepository.saveAll(members);

        return round.getId();
    }

    /**
     * 동시 라운드 생성으로 인한 DRAFT partial unique 위반 only true.
     * 다른 무결성 위반은 그대로 위로 전파한다 (club_member 23505 처리 전례).
     */
    private static boolean isDraftRoundUniqueViolation(DataIntegrityViolationException exception) {
        Throwable mostSpecific = exception.getMostSpecificCause();
        if (!(mostSpecific instanceof SQLException sqlException)) {
            return false;
        }
        if (!POSTGRES_UNIQUE_VIOLATION_SQL_STATE.equals(sqlException.getSQLState())) {
            return false;
        }
        String message = sqlException.getMessage();
        return message != null && message.contains(DRAFT_ROUND_UNIQUE_INDEX);
    }
```

- [ ] **Step 5: API 인터페이스 + 컨트롤러**

`LeaderInterviewRoundApi` 에 추가 (import `CreateInterviewRoundRequest`/`CreateInterviewRoundResponse`/`jakarta.validation.Valid`/`PostMapping`/`RequestBody`):

```java
    @Operation(
            summary = "면접 라운드 생성 (wizard)",
            description = "면접 대상 선정과 라운드 생성을 한 트랜잭션으로 처리한다 — wizard Step2 완료 시점의 첫 persist. "
                    + "허용 지원 상태: UNDER_REVIEW(선정 — INTERVIEW_PENDING 으로 전이·이력 기록), INTERVIEW_PENDING(대기열 재수용 — 유지). "
                    + "그 외 상태가 섞이면 400 이고 전체가 롤백된다. "
                    + "이미 진행 중 라운드에 소속된 지원자가 있으면 409. 모집당 준비 중(DRAFT) 라운드는 1개 — 이미 있으면 409. "
                    + "availabilityDeadline 은 DRAFT 동안 생략 가능하며 발송 시점에 필수가 된다. 지정 시 현재 이후여야 한다."
    )
    @PostMapping("/leader/recruitments/{recruitmentId}/interview-rounds")
    ResponseEntity<ApiResponse<CreateInterviewRoundResponse>> createRound(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateInterviewRoundRequest createInterviewRoundRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`LeaderInterviewRoundController` 에 추가 (import `CreateInterviewRoundRequest`/`CreateInterviewRoundResponse`/`Valid`/`RequestBody`/`HttpStatus`):

```java
    @Override
    public ResponseEntity<ApiResponse<CreateInterviewRoundResponse>> createRound(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateInterviewRoundRequest createInterviewRoundRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long roundId = interviewRoundService.createRound(
                createInterviewRoundRequest.toCommand(recruitmentId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(CreateInterviewRoundResponse.from(roundId)));
    }
```

- [ ] **Step 6: GREEN 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests "com.duing.domain.interview.controller.LeaderInterviewRoundCreateControllerTest"
```

Expected: **15건 전부 PASS** (동시성 케이스 포함 — flaky 하면 잠금/유니크 처리에 결함이 있다는 신호이므로 재시도로 덮지 말고 원인을 추적해 보고)

---

### Task 4: 전체 검증 + 커밋

- [ ] **Step 1:** `./gradlew test` → BUILD SUCCESSFUL, 0 failures (689 + 15 = 704건)

- [ ] **Step 2:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 면접 라운드 생성 API — 대상 선정·라운드·멤버 단일 트랜잭션"
```

---

### Task 5: self-check + PR 생성

- [ ] **Step 1: self-check 7항목** (BE#0~2 와 동일 명령. 항목 3 타영역: 신규 API — FE 는 FE#2 wizard 에서 소비)

- [ ] **Step 2: push + PR** (자동 머지 금지. **리뷰 단계에서 codex adversarial — 상태전이·동시성·데이터무결성 관점 — 필수**)

```bash
git push -u origin feat/interview-round-create
gh pr create --base develop --title "feat(backend): 면접 라운드 생성 API" --body "$(cat <<'EOF'
## 🚀 작업 내용

라운드 생성 wizard 의 Step2 — 면접 대상 선정과 라운드 생성을 한 트랜잭션으로 처리하는 API 입니다. 서류 검토 중(UNDER_REVIEW) 지원자는 면접 대상(INTERVIEW_PENDING)으로 전이되며 상태 이력이 남고, 이미 면접 대기열에 있던 지원자는 상태 그대로 새 라운드의 멤버로 합류합니다. 라운드는 DRAFT 로 태어나고, 슬롯 생성과 발송은 후속 PR 의 몫입니다.

이 PR 은 재설계의 첫 쓰기 경로라서 "한 지원자는 진행 중인 라운드 하나에만 속한다" 불변식이 처음으로 강제됩니다. 같은 지원자를 노리는 동시 생성은 지원서 행 잠금(PESSIMISTIC_WRITE, id 순 — 교착 방지)으로 직렬화되고, 같은 모집에서의 동시 생성은 모집당 DRAFT 1개 partial unique 가 DB 레벨에서 차단합니다(23505 → 409 변환). 동시 요청 두 건 중 정확히 하나만 성공하는 통합 테스트로 고정했습니다.

## 🤔 고민했던 내용

- 검증 순서를 "잠금 → 소속/상태 검증 → placement 검증 → 생성"으로 고정했습니다. placement 검증을 잠금 앞에 두면 후행 트랜잭션이 선행 커밋을 못 보고 통과하는 race 가 생깁니다.
- 선정 불가 상태가 한 명이라도 섞이면 전체를 거부하고 롤백합니다 — 부분 성공은 wizard 화면과 서버 상태를 어긋나게 만들어서요. 원자성 검증을 테스트에 포함했습니다.
- 대기열 재수용은 상태 변화가 없으므로 이력을 만들지 않습니다. 이력은 "무엇이 바뀌었나"의 기록이지 "무엇이 일어났나"의 로그가 아니라고 판단했습니다.

## 💬 리뷰 중점사항

- 동시성 2중 방어(행 잠금 + partial unique)의 빈틈 — 특히 잠금과 placement 검증 사이의 순서.
- UNDER_REVIEW→INTERVIEW_PENDING 전이가 기존 Application.transitionTo 규칙·이력 기록 패턴과 일관적인지.
- 스펙 §16(후속 PR 데이터 무결성 요구사항) 관점에서 이 PR 이 만드는 불변식이 충분히 고정됐는지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §9.1 API 2·§7·§16
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §9.1 API 2 계약(허용 상태 2종·그 외 거부·한 트랜잭션·PESSIMISTIC_WRITE·placement 검증) → Task 3 Step 4 + 테스트 1·4·5·7·15, DRAFT 1개(§4·§10.3) → 사전체크+23505+테스트 8·15, deadline nullable(§5.1) → 테스트 2·3, 이력 기록(기존 패턴) → 테스트 1, §16 불변식 강제 → placement 쿼리 + 동시성 테스트.
- **플레이스홀더**: 없음.
- **타입 일관성**: `createRound(CreateInterviewRoundCommand)` 시그니처 인터페이스/구현/컨트롤러 일치, `findApplicationIdsWithPlacementActiveMembership(Collection<Long>)` Custom/Impl 일치, `findAllByIdInForUpdate(Collection<Long>)` 시그니처와 호출부(Set 전달) 호환, 테스트 경로·필드명(`data.roundId`)이 Response record 와 일치.
- **주의 메모**: ① 동시성 테스트는 HTTP 레벨 2-스레드 — Testcontainers PG 에서 행 잠금 대기가 발생하므로 타임아웃(30s) 여유를 둠. ② `existsByRecruitmentIdAndStatus` 는 derived query — `@SQLRestriction` 으로 soft-deleted round 자동 제외 (root 엔티티 조회라 서브쿼리 이슈 없음).

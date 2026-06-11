# BE#2 — 면접 라운드 후보 조회 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라운드 생성 wizard Step1 과 상시모집 대기열이 쓰는 후보 조회 API (`GET /api/v1/recruitments/{recruitmentId}/interview-round-candidates`)를 구현한다.

**Architecture:** round 도메인의 첫 API. **`isActiveForPlacement` 술어의 첫 코드 등장** — 후보 = 후보 상태(기본 INTERVIEW_PENDING 큐, 옵션 UNDER_REVIEW 포함) && placement-active 멤버십 없음(NOT EXISTS, DRAFT 포함·CANCELLED 라운드 제외·EXCLUDED 멤버 제외). QueryDSL 동적 조건 + RestAssured 통합 테스트 10건 (더블부킹 회귀 포함, 스펙 §11 필수).

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / RestAssured + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §5.4(술어)·§9.1 API 1·§10.3(Step1 UX)·§11(더블부킹 회귀)
**리뷰 정책:** duing-code-reviewer + codex 기본 (BE#2 는 adversarial 필수 목록 아님 — 스펙 §12)

---

## 핵심 결정

1. **술어 표현**: placement 술어는 QueryDSL `BooleanExpression hasNoPlacementActiveMembership()` 헬퍼로 명명 — `active` 단독 명명 금지(스펙 §5.4), `isVisibleToApplicant`(BE#1 의 round repo JPQL)와 혼용 금지.
2. **soft delete 자동 필터**: `@SQLRestriction` 이 QueryDSL 서브쿼리의 엔티티 참조에도 적용되므로 soft-deleted round/application 은 자동 제외 — CANCELLED 검사와 별개.
3. **API 인터페이스는 `ManagerInterviewRoundApi` 로 시작** — BE#3+(라운드 생성 등)가 같은 인터페이스에 메서드를 누적한다 (LeaderApplicationApi 전례).
4. **`useInterview=false` 모집은 400** — 신규 `InterviewException.InterviewNotUsed`. 면접 미사용 모집에서 wizard 진입은 클라이언트 버그.
5. **응답은 Step1 테이블에 필요한 최소 필드** — applicationId/userId/userName/studentId/college/major/grade/status/submittedAt. answers·면접배정 정보 불필요 (YAGNI).
6. **Custom 레포 위치는 `InterviewRoundMemberRepositoryCustom`** — 술어의 주체가 멤버십 부재이므로. cross-domain `QApplication` 사용은 `ApplicationRepositoryImpl` 이 `QInterviewSchedule` 을 쓰는 기존 전례의 역방향.

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Create | `domain/interview/api/ManagerInterviewRoundApi.java` | Swagger 인터페이스 (후보 조회 1메서드로 시작) |
| Create | `domain/interview/controller/ManagerInterviewRoundController.java` | 구현 |
| Create | `domain/interview/controller/dto/response/RoundCandidateResponse.java` | 응답 record |
| Create | `domain/interview/service/InterviewRoundService.java` | 도메인 서비스 인터페이스 (round 도메인 서비스의 시작) |
| Create | `domain/interview/service/GeneralInterviewRoundService.java` | 구현 (권한·가드·조회) |
| Create | `domain/interview/service/dto/query/RoundCandidateQuery.java` | 조회 DTO record |
| Create | `domain/interview/repository/InterviewRoundMemberRepositoryCustom.java` | findRoundCandidates 시그니처 |
| Create | `domain/interview/repository/InterviewRoundMemberRepositoryImpl.java` | QueryDSL 구현 (placement 술어) |
| Modify | `domain/interview/repository/InterviewRoundMemberRepository.java` | Custom 상속 추가 |
| Modify | `domain/interview/exception/InterviewException.java` | `InterviewNotUsed`(400) 추가 |
| Test | `backend/src/test/java/com/duing/domain/interview/controller/ManagerInterviewRoundCandidateControllerTest.java` | RestAssured 통합 10건 |

---

### Task 1: 브랜치 생성

- [x] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-round-candidates
```

Expected: `Switched to a new branch 'feat/interview-round-candidates'`

---

### Task 2: 통합 테스트 작성 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/controller/ManagerInterviewRoundCandidateControllerTest.java`

`LeaderApplicantDetailInterviewTest` 의 RestAssured + JwtTokenProvider + 헬퍼 패턴을 따른다.

- [x] **Step 1: 테스트 작성**

```java
package com.duing.domain.interview.controller;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
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

// 라운드 생성 wizard Step1 / 상시모집 대기열의 후보 조회를 검증한다.
// 후보 = 후보 상태(기본 INTERVIEW_PENDING, 옵션 UNDER_REVIEW 포함) && placement-active 멤버십 없음 (스펙 §5.4·§9.1 API 1).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ManagerInterviewRoundCandidateControllerTest extends IntegrationTestBase {

    private static final String CANDIDATES_PATH = "/api/v1/recruitments/{recruitmentId}/interview-round-candidates";

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ApplicationRepository applicationRepository;
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
        Club club = saveActiveClub("후보동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "후보모집");
    }

    @Test
    @DisplayName("기본 호출은 면접 대기열만 반환한다 — 서류 검토 중 지원자는 포함되지 않는다")
    void defaultCallReturnsQueueOnly() {
        Application queued = saveInterviewPendingApplication("대기열");
        saveUnderReviewApplication("서류중");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].applicationId", equalTo(queued.getId().intValue()))
                .body("data[0].status", equalTo("INTERVIEW_PENDING"));
    }

    @Test
    @DisplayName("includeUnderReview=true 면 서류 검토 중 지원자도 후보에 포함된다")
    void includeUnderReviewAddsUnderReviewApplicants() {
        Application queued = saveInterviewPendingApplication("대기열");
        Application reviewing = saveUnderReviewApplication("서류중");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("includeUnderReview", true)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data.applicationId", containsInAnyOrder(
                        queued.getId().intValue(), reviewing.getId().intValue()));
    }

    @Test
    @DisplayName("SUBMITTED·ACCEPTED·REJECTED 지원자는 어떤 옵션에서도 후보에 포함되지 않는다")
    void terminalAndUnreviewedStatusesAreNeverCandidates() {
        saveApplicationWithStatus("미열람", ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus("합격", ApplicationStatus.ACCEPTED);
        saveApplicationWithStatus("불합격", ApplicationStatus.REJECTED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("includeUnderReview", true)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("발송 전(DRAFT) 라운드에 소속된 지원자도 placement 기준으로는 후보에서 제외된다")
    void draftRoundMemberIsExcludedFromCandidates() {
        Application application = saveInterviewPendingApplication("드래프트소속");
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        interviewRoundMemberRepository.save(
                InterviewRoundMember.invite(draftRound.getId(), application.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("일정이 확정된(SCHEDULED) 라운드의 배정 멤버는 후보·대기열에 다시 나타나지 않는다")
    void scheduledRoundMemberNeverReentersQueue() {
        // 더블부킹 회귀 테스트 (스펙 §11 필수) — placement 정의에서 SCHEDULED 를 빼면 이 테스트가 깨진다.
        Application application = saveInterviewPendingApplication("확정자");
        InterviewRound scheduledRound = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().minusDays(1), "본관 201호", RoundStatus.SCHEDULED));
        InterviewRoundMember member = InterviewRoundMember.invite(scheduledRound.getId(), application.getId());
        ReflectionTestUtils.setField(member, "status", RoundMemberStatus.ASSIGNED);
        interviewRoundMemberRepository.save(member);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("진행 중인 라운드에서 제외(EXCLUDED)된 지원자는 즉시 대기열로 복귀한다")
    void excludedMemberReentersQueueImmediately() {
        Application application = saveInterviewPendingApplication("제외자");
        InterviewRound collectingRound = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(7), null, RoundStatus.COLLECTING));
        InterviewRoundMember member = InterviewRoundMember.invite(collectingRound.getId(), application.getId());
        ReflectionTestUtils.setField(member, "status", RoundMemberStatus.EXCLUDED);
        interviewRoundMemberRepository.save(member);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].applicationId", equalTo(application.getId().intValue()));
    }

    @Test
    @DisplayName("취소(CANCELLED)된 라운드의 멤버였던 지원자는 대기열로 복귀한다")
    void cancelledRoundMemberReentersQueue() {
        Application application = saveInterviewPendingApplication("취소복귀");
        InterviewRound cancelledRound = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(7), null, RoundStatus.CANCELLED));
        interviewRoundMemberRepository.save(
                InterviewRoundMember.invite(cancelledRound.getId(), application.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].applicationId", equalTo(application.getId().intValue()));
    }

    @Test
    @DisplayName("해당 동아리 운영진이 아니면 후보를 조회할 수 없다")
    void nonManagerCannotQueryCandidates() {
        User outsider = saveUser("외부인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집의 후보 조회는 400 으로 거부된다")
    void interviewNotUsedRecruitmentIsRejected() {
        Recruitment simpleRecruitment = saveSimpleRecruitment("면접없는모집");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, simpleRecruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 모집의 후보 조회는 404 를 반환한다")
    void unknownRecruitmentReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 헬퍼 (LeaderApplicantDetailInterviewTest 패턴) ───────────────────────────

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "candidate" + unique + "@daegu.ac.kr",
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

    private Recruitment saveSimpleRecruitment(String title) {
        LocalDate today = LocalDate.now();
        Club club = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return recruitmentRepository.save(Recruitment.create(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10));
    }

    private Application saveInterviewPendingApplication(String applicantSuffix) {
        Application application = saveUnderReviewApplication(applicantSuffix);
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
        return applicationRepository.save(application);
    }

    private Application saveUnderReviewApplication(String applicantSuffix) {
        User applicant = saveUser(applicantSuffix);
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        return applicationRepository.save(application);
    }

    private void saveApplicationWithStatus(String applicantSuffix, ApplicationStatus status) {
        User applicant = saveUser(applicantSuffix);
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        if (status != ApplicationStatus.SUBMITTED) {
            // 전이 규칙을 우회하지 않으면 ACCEPTED/REJECTED 셋업이 번거로우므로
            // 셋업 한정으로 리플렉션을 사용한다 (saveActiveClub 의 ClubStatus 전례).
            ReflectionTestUtils.setField(application, "status", status);
            application = applicationRepository.save(application);
        }
    }
}
```

- [x] **Step 2: RED 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests "com.duing.domain.interview.controller.ManagerInterviewRoundCandidateControllerTest"
```

Expected: **전부 FAIL** — 엔드포인트 미존재로 200 기대 케이스는 404, 403/400/404 기대 케이스도 일부 어긋남. 컴파일은 성공해야 한다 (구현 코드를 참조하지 않는 블랙박스 HTTP 테스트). **커밋하지 않는다.**

---

### Task 3: 구현 (GREEN)

- [x] **Step 1: `InterviewException` 에 `InterviewNotUsed` 추가**

`backend/src/main/java/com/duing/domain/interview/exception/InterviewException.java` 의 `CapacityBelowAssigned` 섹션 아래에 추가:

```java
    // ── 400 Bad Request ───────────────────────────────────────────────────────

    public static final class InterviewNotUsed extends InterviewException {
        private static final String MESSAGE = "면접을 사용하지 않는 모집입니다.";
        public InterviewNotUsed() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
```

- [x] **Step 2: Custom 레포 시그니처 + QueryDSL 구현**

`backend/src/main/java/com/duing/domain/interview/repository/InterviewRoundMemberRepositoryCustom.java`:

```java
package com.duing.domain.interview.repository;

import com.duing.domain.application.entity.Application;
import java.util.List;

public interface InterviewRoundMemberRepositoryCustom {

    /**
     * 라운드 생성 후보 조회 — 후보 상태(기본 INTERVIEW_PENDING 큐, includeUnderReview 시
     * UNDER_REVIEW 포함) 이면서 placement-active 멤버십이 없는 지원서를 최근 제출 순으로 반환한다.
     */
    List<Application> findRoundCandidates(Long recruitmentId, boolean includeUnderReview);
}
```

`backend/src/main/java/com/duing/domain/interview/repository/InterviewRoundMemberRepositoryImpl.java`:

```java
package com.duing.domain.interview.repository;

import static com.duing.domain.application.entity.QApplication.application;
import static com.duing.domain.interview.entity.QInterviewRound.interviewRound;
import static com.duing.domain.interview.entity.QInterviewRoundMember.interviewRoundMember;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class InterviewRoundMemberRepositoryImpl implements InterviewRoundMemberRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<Application> findRoundCandidates(Long recruitmentId, boolean includeUnderReview) {
        return queryFactory
                .selectFrom(application)
                .join(application.user).fetchJoin()
                .where(
                        application.recruitment.id.eq(recruitmentId),
                        candidateStatuses(includeUnderReview),
                        hasNoPlacementActiveMembership()
                )
                .orderBy(application.createdAt.desc())
                .fetch();
    }

    private BooleanExpression candidateStatuses(boolean includeUnderReview) {
        if (includeUnderReview) {
            return application.status.in(
                    ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.UNDER_REVIEW);
        }
        return application.status.eq(ApplicationStatus.INTERVIEW_PENDING);
    }

    /**
     * isActiveForPlacement 술어의 부정 (스펙 §5.4) —
     * placement-active = round.status != CANCELLED(DRAFT 포함) && member.status != EXCLUDED.
     * 지원자 노출용 isVisibleToApplicant(DRAFT 제외)와 혼용하지 않는다.
     * soft-deleted round 는 @SQLRestriction 이 서브쿼리에서도 자동 제외한다.
     */
    private BooleanExpression hasNoPlacementActiveMembership() {
        return JPAExpressions
                .selectOne()
                .from(interviewRoundMember)
                .join(interviewRound).on(interviewRound.id.eq(interviewRoundMember.roundId))
                .where(
                        interviewRoundMember.applicationId.eq(application.id),
                        interviewRoundMember.status.ne(RoundMemberStatus.EXCLUDED),
                        interviewRound.status.ne(RoundStatus.CANCELLED)
                )
                .notExists();
    }
}
```

`InterviewRoundMemberRepository.java` 수정:

```java
package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewRoundMember;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewRoundMemberRepository
        extends JpaRepository<InterviewRoundMember, Long>, InterviewRoundMemberRepositoryCustom {
}
```

- [x] **Step 3: 조회 DTO + 서비스**

`backend/src/main/java/com/duing/domain/interview/service/dto/query/RoundCandidateQuery.java`:

```java
package com.duing.domain.interview.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;

public record RoundCandidateQuery(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        College college,
        String major,
        Grade grade,
        ApplicationStatus status,
        LocalDateTime submittedAt
) {
    public static RoundCandidateQuery from(Application application) {
        return new RoundCandidateQuery(
                application.getId(),
                application.getUser().getId(),
                application.getUser().getName(),
                application.getUser().getStudentId(),
                application.getUser().getCollege(),
                application.getUser().getMajor(),
                application.getUser().getGrade(),
                application.getStatus(),
                application.getCreatedAt());
    }
}
```

`backend/src/main/java/com/duing/domain/interview/service/InterviewRoundService.java`:

```java
package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.query.RoundCandidateQuery;
import java.util.List;

public interface InterviewRoundService {

    /**
     * 라운드 생성 wizard Step1 / 상시모집 대기열의 후보 목록을 조회한다.
     * 기본 후보군 = 큐(INTERVIEW_PENDING && placement-active 멤버십 없음),
     * includeUnderReview=true 시 서류 검토 중(UNDER_REVIEW) 지원자도 포함한다.
     */
    List<RoundCandidateQuery> getRoundCandidates(Long recruitmentId, Long currentUserId, boolean includeUnderReview);
}
```

`backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewRoundService.java`:

```java
package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.service.dto.query.RoundCandidateQuery;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewRoundService implements InterviewRoundService {

    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;
    private final InterviewRoundMemberRepository interviewRoundMemberRepository;

    @Override
    public List<RoundCandidateQuery> getRoundCandidates(Long recruitmentId, Long currentUserId,
                                                        boolean includeUnderReview) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());

        if (!recruitment.isUseInterview()) {
            throw new InterviewException.InterviewNotUsed();
        }

        return interviewRoundMemberRepository.findRoundCandidates(recruitmentId, includeUnderReview).stream()
                .map(RoundCandidateQuery::from)
                .toList();
    }
}
```

- [x] **Step 4: 응답 DTO + API 인터페이스 + 컨트롤러**

`backend/src/main/java/com/duing/domain/interview/controller/dto/response/RoundCandidateResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.service.dto.query.RoundCandidateQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;

public record RoundCandidateResponse(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        College college,
        String major,
        Grade grade,
        ApplicationStatus status,
        LocalDateTime submittedAt
) {
    public static RoundCandidateResponse from(RoundCandidateQuery candidateQuery) {
        return new RoundCandidateResponse(
                candidateQuery.applicationId(),
                candidateQuery.userId(),
                candidateQuery.userName(),
                candidateQuery.studentId(),
                candidateQuery.college(),
                candidateQuery.major(),
                candidateQuery.grade(),
                candidateQuery.status(),
                candidateQuery.submittedAt());
    }
}
```

`backend/src/main/java/com/duing/domain/interview/api/ManagerInterviewRoundApi.java`:

```java
package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.response.RoundCandidateResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "면접 라운드(운영진)", description = "운영진 전용 면접 라운드 관리")
@SecurityRequirement(name = "BearerAuth")
public interface ManagerInterviewRoundApi {

    @Operation(
            summary = "면접 라운드 후보 조회",
            description = "라운드 생성 wizard Step1 과 상시모집 대기열이 사용하는 후보 목록. "
                    + "기본 후보군 = 면접 대기열 (INTERVIEW_PENDING 이면서 진행 중인 라운드에 소속되지 않은 지원자 — "
                    + "취소된 라운드·제외된 멤버는 대기열로 복귀). "
                    + "includeUnderReview=true 시 서류 검토 중(UNDER_REVIEW) 지원자도 포함한다 — 정기모집 wizard 의 기본 진입값. "
                    + "상시모집 대기열 카운트는 파라미터 없이 호출해 큐만 집계한다. "
                    + "면접을 사용하지 않는 모집이면 400."
    )
    @GetMapping("/recruitments/{recruitmentId}/interview-round-candidates")
    ResponseEntity<ApiResponse<List<RoundCandidateResponse>>> getRoundCandidates(
            @PathVariable Long recruitmentId,
            @Parameter(description = "서류 검토 중(UNDER_REVIEW) 지원자 포함 여부", example = "true")
            @RequestParam(required = false, defaultValue = "false") boolean includeUnderReview,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

`backend/src/main/java/com/duing/domain/interview/controller/ManagerInterviewRoundController.java`:

```java
package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.ManagerInterviewRoundApi;
import com.duing.domain.interview.controller.dto.response.RoundCandidateResponse;
import com.duing.domain.interview.service.InterviewRoundService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ManagerInterviewRoundController implements ManagerInterviewRoundApi {

    private final InterviewRoundService interviewRoundService;

    @Override
    public ResponseEntity<ApiResponse<List<RoundCandidateResponse>>> getRoundCandidates(
            @PathVariable Long recruitmentId,
            @RequestParam(required = false, defaultValue = "false") boolean includeUnderReview,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<RoundCandidateResponse> candidates = interviewRoundService
                .getRoundCandidates(recruitmentId, currentUser.id(), includeUnderReview).stream()
                .map(RoundCandidateResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(candidates));
    }
}
```

- [x] **Step 5: GREEN 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests "com.duing.domain.interview.controller.ManagerInterviewRoundCandidateControllerTest"
```

Expected: **10건 전부 PASS**. (403 케이스가 다른 코드로 떨어지면 `ClubAuthService.requireManager` 의 실제 예외 status 를 확인해 테스트가 아니라 기대값 검토 후 보고 — 서비스 수정 금지)

---

### Task 4: 전체 검증 + 커밋

- [x] **Step 1: 전체 테스트**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test
```

Expected: BUILD SUCCESSFUL, 0 failures (679 + 10 = 689건)

- [x] **Step 2: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 면접 라운드 후보 조회 API"
```

---

### Task 5: self-check + PR 생성

- [x] **Step 1: self-check 7항목** (빌드/범위(File Map 11파일)/타영역 영향(신규 API 라 없음 — FE 는 FE#2 에서 소비)/리뷰 완료/체크박스 재검증/커밋 형식/EOF newline — BE#0·1 과 동일 명령)

- [x] **Step 2: push + PR** (자동 머지 금지)

```bash
git push -u origin feat/interview-round-candidates
gh pr create --base develop --title "feat(backend): 면접 라운드 후보 조회 API" --body "$(cat <<'EOF'
## 🚀 작업 내용

면접 라운드 도메인의 첫 운영 API 입니다. 라운드 생성 wizard 의 Step1(대상 선정)과 상시모집 대기열 카운트가 같이 쓰는 후보 조회를 구현했습니다. 기본 호출은 면접 대기열 — 면접 대상으로 선정됐지만 아직 진행 중인 라운드에 소속되지 않은 지원자 — 만 반환하고, includeUnderReview 옵션을 켜면 서류 검토 중인 지원자까지 묶어 정기모집 wizard 의 기본 진입 화면을 채웁니다.

설계 문서의 "배치용 술어(isActiveForPlacement)"가 처음 코드로 등장하는 PR 입니다. 발송 전(DRAFT) 라운드 소속자도 후보에서 빠지고, 취소된 라운드나 제외 처리된 멤버는 즉시 대기열로 복귀하며, 일정이 확정된 라운드의 배정자는 다시 나타나지 않습니다 — 마지막 항목은 더블부킹 방지의 핵심이라 회귀 테스트로 고정했습니다.

## 🤔 고민했던 내용

- 지원자 노출용 술어(isVisibleToApplicant, DRAFT 제외)와 이번 배치용 술어(DRAFT 포함)는 한 글자 차이로 더블부킹/정보누출 버그가 갈리는 지점이라, QueryDSL 헬퍼 이름과 주석으로 혼용 금지를 명시했습니다.
- 면접을 쓰지 않는 모집에서의 후보 조회는 빈 배열 대신 400 으로 거부했습니다 — wizard 진입 자체가 클라이언트 버그 신호라서요.

## 💬 리뷰 중점사항

- NOT EXISTS 서브쿼리의 placement 조건 (round != CANCELLED && member != EXCLUDED, DRAFT 포함)이 스펙 §5.4 와 일치하는지.
- 더블부킹 회귀 테스트(SCHEDULED 라운드 배정자 미복귀)가 의도를 충분히 고정하는지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §9.1 API 1
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §9.1 API 1 의 계약(기본 큐/includeUnderReview/정기·상시 사용처) → Api javadoc + 테스트 1·2, §5.4 placement 술어 → Impl 헬퍼 + 테스트 4~7, §11 더블부킹 회귀 → 테스트 5, §10.3 Step1 필드 → Response. 권한(§9.1 헤더) → requireManager + 테스트 8.
- **플레이스홀더**: 없음 — 전 파일 완성 코드.
- **타입 일관성**: `findRoundCandidates(Long, boolean)` 시그니처가 Custom/Impl/Service 에서 일치, `RoundCandidateQuery.from(Application)` ↔ Response.from(Query) 체인 일치, 테스트의 경로·파라미터명(`includeUnderReview`)이 Api 와 일치.
- **주의 메모**: 403 케이스는 `ClubAuthService.requireManager` 의 예외 status 에 의존 — 구현 Step 5 에 확인 지침 포함.

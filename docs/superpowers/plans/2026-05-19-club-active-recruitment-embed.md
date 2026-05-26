# Club active recruitment embed — Two-stage loading 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ClubDetail` 응답에 학생 카드용 `StudentRecruitmentProjection` 을 임베드해 학생측 동아리 상세 페이지의 직렬 fetch 를 한 번으로 줄이고, 한 동아리에 active 모집은 1개만 존재하도록 도메인 제약을 추가한다.

**Architecture:** (1) `RecruitmentRepository` 에 `existsActive`/`findActive` 추가, (2) `RecruitmentService.create` 에 active 단일 가드 + `DuplicateActiveRecruitmentException`, (3) `POST /api/v1/leader/clubs/{clubId}/recruitments/replace-active` 신규 — 기존 active close + 새 create 단일 트랜잭션, (4) 학생 공개 읽기 모델 `StudentRecruitmentProjection` record 추가, (5) `ClubDetail` 응답에 `activeRecruitment` 임베드, (6) 학생측 `page.tsx` 에서 `useClubRecruitmentsQuery` / `useRecruitmentDetailQuery` 제거.

**Tech Stack:** Spring Boot 3.4, Java 21, QueryDSL, JPA, JUnit 5 + AssertJ + Testcontainers, Next.js 15, React 19, TypeScript, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-19-club-active-recruitment-embed-design.md`

**Branch:** `feat/club-active-recruitment-embed`

---

## File Structure

**Create:**
- `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/StudentRecruitmentProjection.java`
- `backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentReplaceActiveTest.java`
- `backend/src/test/java/com/duing/domain/club/service/ClubDetailActiveRecruitmentTest.java`

**Modify:**
- `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryCustom.java`
- `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryImpl.java`
- `backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java`
- `backend/src/main/java/com/duing/domain/recruitment/service/RecruitmentService.java` (interface 메서드 추가)
- `backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java`
- `backend/src/main/java/com/duing/domain/recruitment/api/LeaderRecruitmentApi.java`
- `backend/src/main/java/com/duing/domain/recruitment/controller/LeaderRecruitmentController.java`
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java`
- `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java`
- `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`
- `frontend/packages/types/src/club.ts`
- `frontend/packages/types/src/recruitment.ts` (StudentRecruitmentProjection 별도 위치 가능 — 본 plan 은 `club.ts` 에 추가, 일관성을 위해 `recruitment.ts` 에 두는 것도 무방)
- `frontend/apps/web/app/clubs/[clubId]/page.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx`
- `frontend/apps/web/test/clubs/club-recruitment-card.test.tsx`

> 본 plan 에서 `StudentRecruitmentProjection` 타입은 `frontend/packages/types/src/recruitment.ts` 에 추가한다. ClubDetail 이 import 만 하면 되므로 응집도 측면에서 자연스럽다.

---

## Task 1: `RecruitmentRepositoryCustom` 에 `existsActiveByClubId`, `findActiveByClubId` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryCustom.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryImpl.java`

### Step 1 — 인터페이스에 메서드 시그니처 추가

`RecruitmentRepositoryCustom.java` 의 기존 메서드 다음에 추가:

```java
/**
 * 활성 모집(status=OPEN && deleted_at IS NULL && (end_date IS NULL OR end_date >= today)) 존재 여부.
 */
boolean existsActiveByClubId(Long clubId);

/**
 * 활성 모집 1건 조회. 비정상 케이스로 여러 건이면 startDate ASC, id ASC tie-break.
 */
Optional<Recruitment> findActiveByClubId(Long clubId);
```

import 추가 — `java.util.Optional`.

### Step 2 — `RecruitmentRepositoryImpl` 에 구현

기존 `findByClubIdOrderByStatusOpenFirstAndStartDateDesc` 메서드 다음에 추가:

```java
@Override
public boolean existsActiveByClubId(Long clubId) {
    LocalDate today = LocalDate.now();
    Integer one = queryFactory
            .selectOne()
            .from(recruitment)
            .where(
                    recruitment.club.id.eq(clubId),
                    recruitment.status.eq(RecruitmentStatus.OPEN),
                    recruitment.endDate.isNull().or(recruitment.endDate.goe(today))
            )
            .fetchFirst();
    return one != null;
}

@Override
public Optional<Recruitment> findActiveByClubId(Long clubId) {
    LocalDate today = LocalDate.now();
    Recruitment found = queryFactory
            .selectFrom(recruitment)
            .where(
                    recruitment.club.id.eq(clubId),
                    recruitment.status.eq(RecruitmentStatus.OPEN),
                    recruitment.endDate.isNull().or(recruitment.endDate.goe(today))
            )
            .orderBy(recruitment.startDate.asc(), recruitment.id.asc())
            .fetchFirst();
    return Optional.ofNullable(found);
}
```

import 추가 — `java.util.Optional`.

### Step 3 — 컴파일

Run from `backend/`: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

### Step 4 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryCustom.java \
        backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryImpl.java
git commit -m "feat(backend): RecruitmentRepository에 existsActiveByClubId / findActiveByClubId 추가"
```

---

## Task 2: `DuplicateActiveRecruitmentException` + 가드 + `RecruitmentService.replaceActive`

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/RecruitmentService.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java`

### Step 1 — 새 예외 추가

`RecruitmentException.java` 의 마지막 inner class (`InvalidInterviewPeriodException`) 다음에 추가:

```java
public static class DuplicateActiveRecruitmentException extends RecruitmentException {
    private static final String MESSAGE = "이미 진행 중인 모집이 있습니다. 기존 모집을 마감하거나 교체 endpoint 를 사용하세요.";

    public DuplicateActiveRecruitmentException() {
        super(MESSAGE, HttpStatus.CONFLICT);
    }
}
```

### Step 2 — `RecruitmentService` interface 에 `replaceActive` 시그니처 추가

기존 메서드 끝에 추가:

```java
Long replaceActive(CreateRecruitmentCommand createRecruitmentCommand);
```

### Step 3 — `GeneralRecruitmentService.create` 에 가드 + `replaceActive` 구현

`create(...)` 메서드의 `clubAuthService.requireManager(...)` 호출 **다음 줄** 에 추가:

```java
if (recruitmentRepository.existsActiveByClubId(club.getId())) {
    throw new RecruitmentException.DuplicateActiveRecruitmentException();
}
```

`close(...)` 메서드 다음에 `replaceActive` 구현 추가:

```java
@Override
@Transactional
public Long replaceActive(CreateRecruitmentCommand command) {
    Club club = clubRepository.findById(command.clubId())
            .orElseThrow(ClubException.ClubNotFoundException::new);

    clubAuthService.requireManager(command.currentUserId(), club.getId());

    recruitmentRepository.findActiveByClubId(club.getId())
            .ifPresent(Recruitment::close);

    Recruitment recruitment;
    try {
        recruitment = Recruitment.createWithOptions(
                club,
                command.title(),
                command.content(),
                command.startDate(),
                command.endDate(),
                command.capacity(),
                command.applicationMode(),
                command.externalFormUrl(),
                command.useInterview(),
                command.targetRole(),
                command.interviewStartDate(),
                command.interviewEndDate(),
                command.showApplicantCount()
        );
    } catch (IllegalArgumentException exception) {
        throw new RecruitmentException.InvalidRecruitmentPeriodException();
    }

    if (command.applicationMode() == ApplicationMode.SELF) {
        RecruitmentForm form = RecruitmentForm.create(recruitment, command.questions());
        recruitment.attachForm(form);
    }

    Recruitment saved = recruitmentRepository.save(recruitment);

    if (saved.getStatus() == RecruitmentStatus.OPEN
            && !saved.getStartDate().isAfter(LocalDate.now())) {
        eventPublisher.publishEvent(new RecruitmentOpenedEvent(
                saved.getId(),
                club.getId(),
                club.getName(),
                saved.getTitle(),
                saved.getEndDate()));
    }

    return saved.getId();
}
```

> 본 메서드는 `create` 와 거의 동일한 본문이라 중복이 있지만, 추출 리팩토링은 본 plan scope 외(별도 후속 PR 권장). 명확성을 위해 그대로 둔다.

### Step 4 — 컴파일

Run from `backend/`: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

### Step 5 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java \
        backend/src/main/java/com/duing/domain/recruitment/service/RecruitmentService.java \
        backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java
git commit -m "feat(backend): active 모집 단일 제약 + replaceActive 서비스 메서드"
```

---

## Task 3: replace-active endpoint (API/Controller)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/api/LeaderRecruitmentApi.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/LeaderRecruitmentController.java`

### Step 1 — API 인터페이스에 시그니처 추가

`LeaderRecruitmentApi.java` 의 `createRecruitment` 다음 메서드로 추가:

```java
@Operation(summary = "active 모집 교체",
        description = "현재 active 모집을 마감하고 같은 트랜잭션 안에서 새 모집을 생성한다. "
                + "본인이 동아리장인 동아리에서만 호출 가능. 기존 active 가 없으면 close 단계 없이 새 모집만 생성된다.")
@PostMapping("/leader/clubs/{clubId}/recruitments/replace-active")
ResponseEntity<ApiResponse<Long>> replaceActiveRecruitment(
        @PathVariable Long clubId,
        @Valid @RequestBody CreateRecruitmentRequest createRecruitmentRequest,
        @AuthenticationPrincipal UserPrincipal currentUser
);
```

### Step 2 — Controller 구현

`LeaderRecruitmentController.java` 의 `createRecruitment` 다음에 추가:

```java
@Override
public ResponseEntity<ApiResponse<Long>> replaceActiveRecruitment(
        @PathVariable Long clubId,
        @Valid @RequestBody CreateRecruitmentRequest createRecruitmentRequest,
        @AuthenticationPrincipal UserPrincipal currentUser
) {
    Long recruitmentId = recruitmentService.replaceActive(
            createRecruitmentRequest.toCommand(clubId, currentUser.id()));
    return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(recruitmentId));
}
```

### Step 3 — 컴파일

Run from `backend/`: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

### Step 4 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/recruitment/api/LeaderRecruitmentApi.java \
        backend/src/main/java/com/duing/domain/recruitment/controller/LeaderRecruitmentController.java
git commit -m "feat(backend): POST /leader/clubs/{clubId}/recruitments/replace-active 추가"
```

---

## Task 4: `StudentRecruitmentProjection` record 신규

**Files:**
- Create: `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/StudentRecruitmentProjection.java`

### Step 1 — record 작성

```java
package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;

/**
 * 학생 공개 화면 전용 모집 읽기 모델.
 * ClubDetail 응답에 임베드해 학생측 동아리 상세 페이지의 직렬 fetch 를 한 번으로 줄인다.
 * 운영자용 RecruitmentDetail 과는 별개로, 학생 카드 렌더링에 꼭 필요한 필드 부분집합만 노출한다.
 */
public record StudentRecruitmentProjection(
        Long id,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        RecruitmentDisplayStatus displayStatus,
        int capacity,
        boolean useInterview,
        TargetRole targetRole,
        ApplicationMode applicationMode,
        String externalFormUrl,
        LocalDate interviewStartDate,
        LocalDate interviewEndDate,
        Integer applicantCount
) {
    /**
     * applicantCount 는 호출자가 결정한다.
     * showApplicantCount=true 면 count 쿼리 결과를 넘기고, false 면 null 을 넘긴다.
     */
    public static StudentRecruitmentProjection from(
            Recruitment recruitment,
            LocalDate today,
            Integer applicantCount
    ) {
        return new StudentRecruitmentProjection(
                recruitment.getId(),
                recruitment.getTitle(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                RecruitmentDisplayStatus.resolve(
                        recruitment.getStatus(),
                        recruitment.getStartDate(),
                        recruitment.getEndDate(),
                        today),
                recruitment.getCapacity(),
                recruitment.isUseInterview(),
                recruitment.getTargetRole(),
                recruitment.getApplicationMode(),
                recruitment.getExternalFormUrl(),
                recruitment.getInterviewStartDate(),
                recruitment.getInterviewEndDate(),
                applicantCount
        );
    }
}
```

### Step 2 — 컴파일

Run from `backend/`: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

### Step 3 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/recruitment/service/dto/query/StudentRecruitmentProjection.java
git commit -m "feat(backend): StudentRecruitmentProjection 학생 공개 읽기 모델 추가"
```

---

## Task 5: `ClubDetailQuery` / `ClubDetailResponse` 에 `activeRecruitment` 임베드 + 서비스 흐름

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`

### Step 1 — `ClubDetailQuery.java` 에 필드 + 정적 팩토리 인자 추가

record 끝(`membershipFee` 다음) 에 1 필드 추가:

```java
StudentRecruitmentProjection activeRecruitment
```

import 추가:

```java
import com.duing.domain.recruitment.service.dto.query.StudentRecruitmentProjection;
```

`of(Club club, Long leaderId, String leaderName, List<ClubPhotoQuery> photos)` 시그니처를 다음으로 교체:

```java
public static ClubDetailQuery of(
        Club club,
        Long leaderId,
        String leaderName,
        List<ClubPhotoQuery> photos,
        StudentRecruitmentProjection activeRecruitment
) {
    return new ClubDetailQuery(
            club.getId(),
            club.getName(),
            club.getCategory(),
            club.getDivision(),
            club.getDescription(),
            club.getLogoUrl(),
            club.getCoverUrl(),
            club.getTags(),
            club.getSnsLinks(),
            club.getFaqs(),
            leaderId,
            leaderName,
            club.getStatus(),
            photos,
            club.getFoundedYear(),
            club.getCohortNumber(),
            club.getLocation(),
            club.getContactEmail(),
            club.getActivityFrequency(),
            club.getActiveDays(),
            club.getMembershipFee(),
            activeRecruitment
    );
}
```

### Step 2 — `ClubDetailResponse.java` 에 필드 + 매핑 추가

record 끝에 같은 필드 추가:

```java
StudentRecruitmentProjection activeRecruitment
```

import 추가:

```java
import com.duing.domain.recruitment.service.dto.query.StudentRecruitmentProjection;
```

`from(ClubDetailQuery detailQuery)` 의 생성자 호출 마지막에 `detailQuery.activeRecruitment()` 인자 추가.

### Step 3 — `GeneralClubService` 의 의존성 + 흐름 변경

먼저 파일을 읽어 현재 `getClubDetail` 흐름과 의존성 필드 파악.

(a) 클래스 필드에 추가:

```java
private final RecruitmentRepository recruitmentRepository;
private final ApplicationRepository applicationRepository;
```

(`@RequiredArgsConstructor` 가 잡아준다.)

import 추가:

```java
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.query.StudentRecruitmentProjection;
import java.time.LocalDate;
import java.util.Optional;
```

(b) `getClubDetail(Long clubId)` 메서드 본문을 다음으로 교체:

기존 흐름에서 `ClubDetailQuery.of(club, leaderId, leaderName, photoQueries)` 호출 부분을 다음으로 바꾼다:

```java
LocalDate today = LocalDate.now();
Optional<Recruitment> activeOpt = recruitmentRepository.findActiveByClubId(clubId);
StudentRecruitmentProjection activeProjection = activeOpt
        .map(active -> {
            Integer applicantCount = active.isShowApplicantCount()
                    ? (int) applicationRepository.countByRecruitmentId(active.getId())
                    : null;
            return StudentRecruitmentProjection.from(active, today, applicantCount);
        })
        .orElse(null);

return ClubDetailQuery.of(club, leaderId, leaderName, photoQueries, activeProjection);
```

> 정확한 `leaderId` / `leaderName` / `photoQueries` 변수명은 현재 코드에 맞춰 사용. `of` 의 마지막 인자만 추가하면 됨.

### Step 4 — 컴파일

Run from `backend/`: `./gradlew compileJava compileTestJava 2>&1 | tail -10`
Expected: BUILD SUCCESSFUL.

테스트 코드가 `ClubDetailQuery.of(...)` 를 호출하는 곳이 있다면 마지막 인자 `null` 을 추가해야 한다. 깨지면 다음 Task 6 에서 보정.

### Step 5 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java \
        backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java
git commit -m "feat(backend): ClubDetail 응답에 activeRecruitment 임베드"
```

---

## Task 6: 백엔드 통합 테스트 — `RecruitmentReplaceActiveTest`

**Files:**
- Create: `backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentReplaceActiveTest.java`

### Step 1 — 테스트 작성

기존 `RecruitmentAlwaysOpenTest.java` 의 fixture 패턴(`saveUser`, `saveActiveClub`, `ClubMember.asLeader`) 을 참고해 작성. **모든 `@SpringBootTest` 클래스에는 `@Import(TestcontainersConfiguration.class)` 를 반드시 포함** (PR #96 에서 격리 강화됨, application.yml 도 fallback 제공이지만 명시가 안전).

```java
package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class RecruitmentReplaceActiveTest {

    @Autowired RecruitmentService recruitmentService;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("active 모집이 이미 존재하면 일반 create 호출은 DuplicateActiveRecruitmentException 을 던진다")
    void createRejectsWhenActiveExists() throws Exception {
        User leader = saveUser("리더");
        Club club = saveActiveClub("두잉");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        recruitmentService.create(buildExternalCommand(club, leader, "기존active"));

        assertThatThrownBy(() -> recruitmentService.create(buildExternalCommand(club, leader, "새active")))
                .isInstanceOf(RecruitmentException.DuplicateActiveRecruitmentException.class);
    }

    @Test
    @DisplayName("replaceActive 호출 시 기존 active 는 CLOSED 로 마감되고 새 모집이 OPEN 으로 생성된다")
    void replaceActiveClosesExistingAndCreatesNew() throws Exception {
        User leader = saveUser("리더교체");
        Club club = saveActiveClub("교체동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long oldId = recruitmentService.create(buildExternalCommand(club, leader, "기존active"));
        Long newId = recruitmentService.replaceActive(buildExternalCommand(club, leader, "신규active"));

        Recruitment oldRecruitment = recruitmentRepository.findById(oldId).orElseThrow();
        Recruitment newRecruitment = recruitmentRepository.findById(newId).orElseThrow();
        assertThat(oldRecruitment.getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
        assertThat(newRecruitment.getStatus()).isEqualTo(RecruitmentStatus.OPEN);
        assertThat(oldId).isNotEqualTo(newId);
    }

    @Test
    @DisplayName("replaceActive 는 active 가 없을 때도 정상적으로 새 모집을 생성한다")
    void replaceActiveCreatesWhenNoActive() throws Exception {
        User leader = saveUser("리더없음");
        Club club = saveActiveClub("초기동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long newId = recruitmentService.replaceActive(buildExternalCommand(club, leader, "신규active"));

        Recruitment recruitment = recruitmentRepository.findById(newId).orElseThrow();
        assertThat(recruitment.getStatus()).isEqualTo(RecruitmentStatus.OPEN);
    }

    private CreateRecruitmentCommand buildExternalCommand(Club club, User leader, String title) {
        return new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                title,
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.EXTERNAL,
                "https://example.com/form",
                false,
                TargetRole.MEMBER,
                List.of(),
                null,
                null,
                false
        );
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
```

### Step 2 — 컴파일/테스트

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileTestJava 2>&1 | tail -5
```
Expected: BUILD SUCCESSFUL.

Docker 가용 시:
```bash
./gradlew test --tests "com.duing.domain.recruitment.service.RecruitmentReplaceActiveTest" 2>&1 | tail -10
```
Expected: 3 PASS. Docker 미가용 시 컴파일 SUCCESS 만 확인.

### Step 3 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentReplaceActiveTest.java
git commit -m "test(backend): RecruitmentReplaceActive 통합 테스트 추가"
```

---

## Task 7: 백엔드 통합 테스트 — `ClubDetailActiveRecruitmentTest`

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/service/ClubDetailActiveRecruitmentTest.java`

### Step 1 — 테스트 작성

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class ClubDetailActiveRecruitmentTest {

    @Autowired ClubService clubService;
    @Autowired RecruitmentService recruitmentService;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("active 모집이 없으면 ClubDetail.activeRecruitment 는 null 이다")
    void noActiveRecruitmentReturnsNull() throws Exception {
        User leader = saveUser("리더무");
        Club club = saveActiveClub("무동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        ClubDetailQuery detail = clubService.getById(club.getId());
        assertThat(detail.activeRecruitment()).isNull();
    }

    @Test
    @DisplayName("active 모집이 있으면 ClubDetail.activeRecruitment 에 학생 카드 정보가 채워진다")
    void activeRecruitmentReturnedAsProjection() throws Exception {
        User leader = saveUser("리더유");
        Club club = saveActiveClub("유동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long recruitmentId = recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(), leader.getId(), "공개모집", null,
                LocalDate.now(), LocalDate.now().plusDays(7), 10,
                ApplicationMode.EXTERNAL, "https://example.com/form", false,
                TargetRole.MEMBER, List.of(), null, null, false
        ));

        ClubDetailQuery detail = clubService.getById(club.getId());
        assertThat(detail.activeRecruitment()).isNotNull();
        assertThat(detail.activeRecruitment().id()).isEqualTo(recruitmentId);
        assertThat(detail.activeRecruitment().displayStatus()).isEqualTo(RecruitmentDisplayStatus.OPEN);
        assertThat(detail.activeRecruitment().applicantCount()).isNull(); // showApplicantCount=false
    }

    @Test
    @DisplayName("showApplicantCount=true 인 active 모집은 applicantCount 가 실제 지원자 수로 채워진다")
    void applicantCountIsReturnedWhenShowFlagOn() throws Exception {
        User leader = saveUser("리더공개");
        Club club = saveActiveClub("공개동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long recruitmentId = recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(), leader.getId(), "공개카운트", null,
                LocalDate.now(), LocalDate.now().plusDays(7), 10,
                ApplicationMode.SELF, null, false,
                TargetRole.MEMBER, List.of("자기소개"), null, null, true
        ));
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId).orElseThrow();
        User applicant = saveUser("지원자");
        applicationRepository.save(Application.submit(recruitment, applicant, List.of("안녕")));

        ClubDetailQuery detail = clubService.getById(club.getId());
        assertThat(detail.activeRecruitment()).isNotNull();
        assertThat(detail.activeRecruitment().applicantCount()).isEqualTo(1);
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
```

> ClubService.getById 메서드 호출. 만약 메서드 이름이 다르면 (예: `getClubDetail`) ClubService 인터페이스를 읽고 그 이름으로 변경.

### Step 2 — 컴파일/테스트

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileTestJava 2>&1 | tail -5
```

Docker 가용 시:
```bash
./gradlew test --tests "com.duing.domain.club.service.ClubDetailActiveRecruitmentTest" 2>&1 | tail -10
```
Expected: 3 PASS.

### Step 3 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/test/java/com/duing/domain/club/service/ClubDetailActiveRecruitmentTest.java
git commit -m "test(backend): ClubDetail.activeRecruitment 임베드 통합 테스트 추가"
```

---

## Task 8: 프론트 타입 확장

**Files:**
- Modify: `frontend/packages/types/src/recruitment.ts`
- Modify: `frontend/packages/types/src/club.ts`

### Step 1 — `recruitment.ts` 에 `StudentRecruitmentProjection` 추가

기존 `RecruitmentDetail` 타입 다음에 추가:

```ts
/**
 * 학생 공개 화면(동아리 상세 페이지) 전용 모집 읽기 모델.
 * ClubDetail.activeRecruitment 에 임베드된다. 운영자용 RecruitmentDetail 과 별개.
 */
export type StudentRecruitmentProjection = {
  id: number;
  title: string;
  startDate: string;
  endDate: string | null;
  displayStatus: RecruitmentDisplayStatus;
  capacity: number;
  useInterview: boolean;
  targetRole: TargetRole;
  applicationMode: ApplicationMode;
  externalFormUrl: string | null;
  interviewStartDate: string | null;
  interviewEndDate: string | null;
  applicantCount: number | null;
};
```

### Step 2 — `club.ts` 의 `ClubDetail` 에 `activeRecruitment` 추가

먼저 파일을 읽어 `ClubDetail` 의 마지막 필드 위치 확인.

상단 import 영역에 추가:

```ts
import type { StudentRecruitmentProjection } from './recruitment';
```

`ClubDetail` 의 마지막 필드(`membershipFee`) 다음에 추가:

```ts
activeRecruitment: StudentRecruitmentProjection | null;
```

### Step 3 — 타입체크

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck 2>&1 | tail -10
```
Expected: SUCCESS. 만약 `apps/web` 에서 `ClubDetail` 리터럴을 만드는 mock 이 있다면 새 필드가 누락되어 에러 발생 — 다음 Task 에서 보정.

### Step 4 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/packages/types/src/recruitment.ts frontend/packages/types/src/club.ts
git commit -m "feat(frontend): StudentRecruitmentProjection 타입 + ClubDetail.activeRecruitment 추가"
```

---

## Task 9: 학생측 `page.tsx` 정리 + `ClubRecruitmentCard` prop + 테스트 mock

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/page.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx`
- Modify: `frontend/apps/web/test/clubs/club-recruitment-card.test.tsx`

### Step 1 — `ClubRecruitmentCard.tsx` prop 타입 교체

기존 import:

```tsx
import type { RecruitmentDetail } from '@duing/types';
```
→ 변경:
```tsx
import type { StudentRecruitmentProjection } from '@duing/types';
```

기존 Props:

```tsx
type Props = {
  recruitment: RecruitmentDetail | undefined;
  clubId: number;
};
```
→ 변경:
```tsx
type Props = {
  recruitment: StudentRecruitmentProjection | undefined;
  clubId: number;
};
```

본문(handleApply, Row 들) 은 필드 부분집합이라 변경 불필요.

### Step 2 — `page.tsx` 정리

먼저 파일 전체를 읽어 현재 import 와 흐름 파악.

import 영역에서 다음을 **제거**:

```tsx
import {
  useClubDetailQuery,
  useClubPhotosQuery,
  useClubRecruitmentsQuery,    // 제거
  useRecruitmentDetailQuery,   // 제거
} from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';  // 제거
```

→ 다음으로 변경:

```tsx
import { useClubDetailQuery, useClubPhotosQuery } from '@duing/hooks';
```

본문에서:

```tsx
const recruitments = useClubRecruitmentsQuery(clubId);

const activeRecruitmentSummary: RecruitmentSummary | undefined = recruitments.data?.find(
  (item) => item.displayStatus === 'OPEN' || item.displayStatus === 'ALWAYS_OPEN',
);
const recruitmentDetail = useRecruitmentDetailQuery(activeRecruitmentSummary?.id);
```

→ 모두 제거.

`<ClubDetailHero>` 의 `recruitmentDisplayStatus` prop 을 `club.activeRecruitment` 기반으로 변경:

```tsx
<ClubDetailHero
  club={club}
  recruitmentDisplayStatus={activeRecruitmentSummary?.displayStatus}
/>
```
→ 변경:
```tsx
<ClubDetailHero
  club={club}
  recruitmentDisplayStatus={club.activeRecruitment?.displayStatus}
/>
```

`<ClubRecruitmentCard>` 의 prop 을 변경:

```tsx
<ClubRecruitmentCard recruitment={recruitmentDetail.data} clubId={clubId} />
```
→ 변경:
```tsx
<ClubRecruitmentCard recruitment={club.activeRecruitment ?? undefined} clubId={clubId} />
```

### Step 3 — `club-recruitment-card.test.tsx` mock 업데이트

먼저 파일을 읽어 현재 base mock 모양 파악.

기존에 `RecruitmentDetail` 형태로 정의된 base mock 에서 다음 필드를 **제거** (StudentRecruitmentProjection 에 없는 것들):

- `clubId`
- `clubName`
- `status`
- `effectivelyOpen`
- `content`
- `questions`
- `showApplicantCount`

남는 13 필드만 유지하고, base mock 의 타입을 `StudentRecruitmentProjection` 으로 변경:

```tsx
import type { StudentRecruitmentProjection } from '@duing/types';

const base: StudentRecruitmentProjection = {
  id: 1,
  title: 'X',
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  displayStatus: 'OPEN',
  capacity: 10,
  useInterview: false,
  targetRole: 'MEMBER',
  applicationMode: 'SELF',
  externalFormUrl: null,
  interviewStartDate: null,
  interviewEndDate: null,
  applicantCount: null,
};
```

기존 4개 테스트 케이스는 그대로 — 분기 동작은 필드 부분집합이라도 검증됨.

### Step 4 — 타입체크 / 테스트 / 빌드

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck 2>&1 | tail -10
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run 2>&1 | tail -10
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -10
```

Expected: 모두 SUCCESS.

### Step 5 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs/[clubId]/page.tsx \
        frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx \
        frontend/apps/web/test/clubs/club-recruitment-card.test.tsx
git commit -m "refactor(frontend): 학생측 동아리 상세에서 useClubRecruitmentsQuery/useRecruitmentDetailQuery 제거"
```

---

## Task 10: PR 생성

### Step 1 — 최종 검증

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava compileTestJava 2>&1 | tail -5
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run 2>&1 | tail -10
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -10
```

모두 SUCCESS 여야 함.

### Step 2 — push + gh pr create

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git push -u origin feat/club-active-recruitment-embed
gh pr create --base develop --title "feat: 학생측 동아리 상세 직렬 fetch 제거 + active 모집 단일 제약" --body "$(cat <<'EOF'
## 🚀 작업 내용
- `ClubDetail` 응답에 학생 카드용 `StudentRecruitmentProjection` 을 임베드해 학생측 동아리 상세 페이지가 한 번의 fetch 만으로 렌더링됩니다.
- 한 동아리에 active(`status=OPEN` && 미만료) 모집은 1개만 존재하도록 도메인 제약을 추가했습니다.
- 기존 active 를 교체하면서 새 모집을 생성하는 `POST /api/v1/leader/clubs/{clubId}/recruitments/replace-active` endpoint 를 추가했습니다.
- 학생측 page.tsx 에서 `useClubRecruitmentsQuery` / `useRecruitmentDetailQuery` 가 더 이상 호출되지 않습니다.

## 🤔 고민했던 내용
- 학생 공개 모델을 운영자용 `RecruitmentDetail` 과 분리해 `StudentRecruitmentProjection` 으로 정의했습니다. 학생에게 필요한 13개 필드만 노출하고, `content`/`questions`/`showApplicantCount` 같은 내부 정보는 응답에서 빠집니다.
- DB partial unique index 는 본 PR 에서 도입하지 않았습니다. 운영자 한 명 시나리오에서 race 가능성이 사실상 없고, 강한 보장이 필요하면 후속 spec 으로 분리하는 게 안전합니다.

## 💬 리뷰 중점사항
- `RecruitmentService.create` 의 active 단일 가드와 `replaceActive` 의 트랜잭션 모델을 봐주세요. 통합 테스트가 close + create 가 단일 트랜잭션으로 묶이는 케이스를 검증합니다.
- `StudentRecruitmentProjection` 의 필드 셋이 학생측 카드 렌더링에 충분한지 확인 부탁드립니다.
- `useClubRecruitmentsQuery` / `useRecruitmentDetailQuery` 의 학생측 잔존 사용처를 grep 으로 확인했고, 캘린더·관리자 측에서만 계속 사용됩니다.
EOF
)"
```

---

## Self-Review

- [x] **스펙 커버리지**
  - 도메인 제약 (active 단일) — Task 2 ✓
  - replace-active endpoint — Task 2/3 ✓
  - 방어적 노출 정책 (startDate ASC 1번째) — Task 1 의 `findActiveByClubId` orderBy 로 보장 ✓
  - `StudentRecruitmentProjection` — Task 4 ✓
  - `ClubDetail.activeRecruitment` 임베드 — Task 5 ✓
  - 백엔드 통합 테스트 (active 가드 / replaceActive 트랜잭션 / projection 노출) — Task 6/7 ✓
  - 프론트 타입 확장 — Task 8 ✓
  - 학생측 page.tsx 직렬 fetch 제거 — Task 9 ✓
- [x] **플레이스홀더 검사** — 모든 코드 블록 완성, TBD/TODO 없음
- [x] **타입 일관성** — `StudentRecruitmentProjection` 의 13 필드가 백엔드 record / 프론트 type / mock 에 동일하게 정의됨
- [x] **DRY** — `replaceActive` 가 `create` 와 유사한 본문이지만 추출 리팩토링은 본 plan scope 외임을 명시
- [x] **TDD** — Task 6/7 은 통합 테스트, 백엔드 가드/endpoint 가 그 뒤를 받침
- [x] **자주 커밋** — 9 task 9 commit + PR 생성 단계

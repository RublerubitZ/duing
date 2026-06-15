# 마이페이지 합격 후 지원→소속 자동 전환 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생이 동아리 모집에 합격(ACCEPTED)하면 마이페이지의 "진행 중인 지원" 카드에서 자동으로 사라지고, "가입한 동아리" 섹션에 MEMBER 역할로 노출되도록 만든다.

**Architecture:** Application 도메인은 변경하지 않는다. (1) `ApplicationStatus` 에 `isTerminal()`/`isActive()` 헬퍼를 추가하고 `/users/me/applications` 에 `scope` 쿼리 파라미터를 더한다. (2) 사용자 관점 멤버십 조회 API `GET /api/v1/me/clubs` 를 신설한다 — 기존 운영자용 `/leader/clubs/me/managed` 와 책임 분리. (3) 프론트 마이페이지에서 `useMyApplicationsQuery('active')` 와 신규 `useMyClubsQuery()` 로 데이터 소스를 교체하고, `SectionJoined` 를 `SectionMyClubs` 로 리네이밍하며 합격 배너(localStorage ack) 를 추가한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / RestAssured + Fixture Monkey (BE). Next.js 15 / React 19 / TanStack Query / Vitest + React Testing Library (FE). pnpm workspaces 모노레포.

**Spec:** `docs/superpowers/specs/2026-05-27-mypage-acceptance-membership-split-design.md`

---

## File Structure

### Backend (PR-1)
- **Modify** `backend/src/main/java/com/duing/domain/application/entity/ApplicationStatus.java`
  - 헬퍼 `isTerminal()`, `isActive()` 추가
- **Create** `backend/src/main/java/com/duing/domain/application/controller/ApplicationScope.java`
  - `ApplicationScope` enum (`ALL`, `ACTIVE`, `ARCHIVED`) + `toStatuses(): Set<ApplicationStatus>`
- **Modify** `backend/src/main/java/com/duing/domain/application/api/ApplicationApi.java`
  - `getMyApplications` 시그니처에 `@RequestParam(defaultValue="all") ApplicationScope scope` 추가
- **Modify** `backend/src/main/java/com/duing/domain/application/controller/ApplicationController.java`
- **Modify** `backend/src/main/java/com/duing/domain/application/service/ApplicationService.java`
- **Modify** `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`
- **Modify** `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java`
  - `findByUserIdAndStatusInOrderByCreatedAtDesc` 추가
- **Create** `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/MyClubQuery.java`
- **Create** `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/MyClubResponse.java`
- **Modify** `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepositoryCustom.java`
  - `findMyClubsByUser(Long userId)` 추가
- **Modify** `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepositoryImpl.java`
- **Modify** `backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java` (또는 새 query service — Task 9 참조)
- **Create** `backend/src/main/java/com/duing/domain/clubmember/api/MeClubApi.java`
- **Create** `backend/src/main/java/com/duing/domain/clubmember/controller/MeClubController.java`
- **Tests**
  - `backend/src/test/java/com/duing/domain/application/entity/ApplicationStatusTest.java` (신규 — 단위)
  - `backend/src/test/java/com/duing/domain/application/service/MyApplicationsScopeTest.java` (신규 — 통합)
  - `backend/src/test/java/com/duing/domain/clubmember/service/MyClubsQueryTest.java` (신규 — 통합. `ManagedClubsQueryTest` 패턴 차용)

### Frontend infra (PR-2)
- **Modify** `frontend/packages/types/src/application.ts`
  - `ApplicationScope` 타입 추가
- **Modify** `frontend/packages/types/src/club.ts`
  - `MyClubSummary` 타입 추가 + `MyClubRole = 'LEADER' | 'OFFICER' | 'MEMBER'`
- **Modify** `frontend/packages/types/src/index.ts` (export 추가)
- **Modify** `frontend/packages/api/src/client.ts`
  - `users.myApplications(scope?)` 시그니처 확장
  - `users.myClubs()` 추가
- **Modify** `frontend/packages/hooks/src/userQueryKeys.ts`
  - `myClubs()` 키 추가
- **Modify** `frontend/packages/hooks/src/applicationQueryKeys.ts`
  - `myList()` 가 scope 받도록 변경
- **Modify** `frontend/packages/hooks/src/applications.ts`
  - `useMyApplicationsQuery(scope)` 시그니처 확장
- **Create** `frontend/packages/hooks/src/users.ts` (또는 `clubs.ts` 에 추가 — 기존 컨벤션 확인 후 결정)
  - `useMyClubsQuery()` 신설

### Frontend page (PR-3)
- **Modify** `frontend/apps/web/app/me/_components/SectionApply.tsx`
  - ACCEPTED/REJECTED 케이스 제거
- **Rename** `frontend/apps/web/app/me/_components/SectionJoined.tsx` → `SectionMyClubs.tsx`
  - role pill (LEADER/OFFICER/MEMBER) 분기, action 버튼 분기
- **Create** `frontend/apps/web/app/me/_components/AcceptanceBanner.tsx`
- **Modify** `frontend/apps/web/app/me/_pages/MyPage.tsx`
  - 쿼리 교체, import 교체, 카운트 source 변경, 배너 마운트
- **Tests** (vitest + RTL, 패턴은 `test/clubs/club-card-central-chip.test.tsx` 참조)
  - `frontend/apps/web/test/me/section-my-clubs.test.tsx`
  - `frontend/apps/web/test/me/section-apply.test.tsx`
  - `frontend/apps/web/test/me/acceptance-banner.test.tsx`

---

## PR Strategy

세 개 PR 을 순차 머지. 각 PR 의 첫 task 는 새 브랜치 분기, 마지막 task 는 PR 생성이다.

- **PR-1** `feat/be-me-clubs-and-application-scope` — Tasks 1~10
- **PR-2** `feat/fe-infra-me-clubs` — Tasks 11~15 (PR-1 머지 후 시작)
- **PR-3** `feat/fe-mypage-acceptance-flow` — Tasks 16~22 (PR-2 머지 후 시작)

---

# PR-1 — Backend

## Task 1: 브랜치 분기

**Files:** —

- [ ] **Step 1: 새 브랜치 생성**

```bash
git checkout develop
git pull
git checkout -b feat/be-me-clubs-and-application-scope
```

---

## Task 2: ApplicationStatus 헬퍼 추가 (TDD)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/application/entity/ApplicationStatusTest.java`
- Modify: `backend/src/main/java/com/duing/domain/application/entity/ApplicationStatus.java`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/test/java/com/duing/domain/application/entity/ApplicationStatusTest.java`:

```java
package com.duing.domain.application.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationStatusTest {

    @Test
    @DisplayName("SUBMITTED / UNDER_REVIEW / INTERVIEW_PENDING 는 active 상태로 분류된다")
    void activeStatuses() {
        assertThat(ApplicationStatus.SUBMITTED.isActive()).isTrue();
        assertThat(ApplicationStatus.UNDER_REVIEW.isActive()).isTrue();
        assertThat(ApplicationStatus.INTERVIEW_PENDING.isActive()).isTrue();
        assertThat(ApplicationStatus.SUBMITTED.isTerminal()).isFalse();
    }

    @Test
    @DisplayName("ACCEPTED / REJECTED 는 terminal 상태로 분류된다")
    void terminalStatuses() {
        assertThat(ApplicationStatus.ACCEPTED.isTerminal()).isTrue();
        assertThat(ApplicationStatus.REJECTED.isTerminal()).isTrue();
        assertThat(ApplicationStatus.ACCEPTED.isActive()).isFalse();
        assertThat(ApplicationStatus.REJECTED.isActive()).isFalse();
    }
}
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
./gradlew test --tests "com.duing.domain.application.entity.ApplicationStatusTest" -p backend
```

Expected: `cannot find symbol: method isActive()` 컴파일 에러.

- [ ] **Step 3: ApplicationStatus 에 헬퍼 추가**

`backend/src/main/java/com/duing/domain/application/entity/ApplicationStatus.java`:

```java
package com.duing.domain.application.entity;

public enum ApplicationStatus {
    SUBMITTED,
    UNDER_REVIEW,
    INTERVIEW_PENDING,
    ACCEPTED,
    REJECTED;

    public boolean isTerminal() {
        return this == ACCEPTED || this == REJECTED;
    }

    public boolean isActive() {
        return !isTerminal();
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
./gradlew test --tests "com.duing.domain.application.entity.ApplicationStatusTest" -p backend
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/entity/ApplicationStatus.java \
        backend/src/test/java/com/duing/domain/application/entity/ApplicationStatusTest.java
git commit -m "feat(application): ApplicationStatus 에 isActive/isTerminal 헬퍼 추가"
```

---

## Task 3: ApplicationScope enum 도입

**Files:**
- Create: `backend/src/main/java/com/duing/domain/application/controller/ApplicationScope.java`

- [ ] **Step 1: enum 작성**

`backend/src/main/java/com/duing/domain/application/controller/ApplicationScope.java`:

```java
package com.duing.domain.application.controller;

import com.duing.domain.application.entity.ApplicationStatus;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;

/**
 * 내 지원 목록 조회 시 status 필터링 범위.
 * - ALL: 모든 상태 (기존 호환 / 기본값)
 * - ACTIVE: ApplicationStatus.isActive() 인 상태
 * - ARCHIVED: ApplicationStatus.isTerminal() 인 상태
 *
 * 매핑은 ApplicationStatus.isActive()/isTerminal() 헬퍼를 사용하여 enum 추가 시 자동 반영된다.
 */
public enum ApplicationScope {
    ALL,
    ACTIVE,
    ARCHIVED;

    public Set<ApplicationStatus> toStatuses() {
        return switch (this) {
            case ALL -> EnumSet.allOf(ApplicationStatus.class);
            case ACTIVE -> Arrays.stream(ApplicationStatus.values())
                    .filter(ApplicationStatus::isActive)
                    .collect(java.util.stream.Collectors.toCollection(
                            () -> EnumSet.noneOf(ApplicationStatus.class)));
            case ARCHIVED -> Arrays.stream(ApplicationStatus.values())
                    .filter(ApplicationStatus::isTerminal)
                    .collect(java.util.stream.Collectors.toCollection(
                            () -> EnumSet.noneOf(ApplicationStatus.class)));
        };
    }
}
```

- [ ] **Step 2: 컴파일 확인**

```bash
./gradlew compileJava -p backend
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/controller/ApplicationScope.java
git commit -m "feat(application): ApplicationScope enum 추가 (active/archived/all)"
```

---

## Task 4: Repository 메서드 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java`

- [ ] **Step 1: 메서드 추가**

기존 `findByUserIdOrderByCreatedAtDesc` 바로 아래에 추가:

```java
@Query("SELECT a FROM Application a "
        + "JOIN FETCH a.recruitment r "
        + "JOIN FETCH r.club "
        + "WHERE a.user.id = :userId "
        + "  AND a.status IN :statuses "
        + "ORDER BY a.createdAt DESC")
List<Application> findByUserIdAndStatusInOrderByCreatedAtDesc(
        @Param("userId") Long userId,
        @Param("statuses") java.util.Set<com.duing.domain.application.entity.ApplicationStatus> statuses);
```

(import 정리: `com.duing.domain.application.entity.ApplicationStatus`, `java.util.Set` 을 상단에 추가)

- [ ] **Step 2: 컴파일 확인**

```bash
./gradlew compileJava -p backend
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java
git commit -m "feat(application): status IN 필터 지원하는 repository 메서드 추가"
```

---

## Task 5: Service 시그니처 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/ApplicationService.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`

- [ ] **Step 1: 인터페이스 시그니처 변경**

`ApplicationService.java`:

기존:
```java
List<ApplicationSummaryQuery> getMyApplications(Long userId);
```

변경:
```java
List<ApplicationSummaryQuery> getMyApplications(Long userId, Set<ApplicationStatus> statuses);
```

(import 추가: `java.util.Set`, `com.duing.domain.application.entity.ApplicationStatus`)

- [ ] **Step 2: 구현체 변경**

`GeneralApplicationService.java` 의 `getMyApplications` 메서드:

```java
@Override
public List<ApplicationSummaryQuery> getMyApplications(Long userId, Set<ApplicationStatus> statuses) {
    return applicationRepository.findByUserIdAndStatusInOrderByCreatedAtDesc(userId, statuses).stream()
            .map(ApplicationSummaryQuery::from)
            .toList();
}
```

(import 정리)

- [ ] **Step 3: 컴파일 확인**

```bash
./gradlew compileJava -p backend
```

Expected: 컨트롤러에서 호출 시그니처 불일치로 컴파일 실패 → 다음 task 에서 해결.

---

## Task 6: API 인터페이스 + 컨트롤러 — scope 파라미터 적용

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/api/ApplicationApi.java`
- Modify: `backend/src/main/java/com/duing/domain/application/controller/ApplicationController.java`

- [ ] **Step 1: API 인터페이스 변경**

`ApplicationApi.java` 의 `getMyApplications`:

```java
@Operation(summary = "내 지원 목록 조회",
        description = "본인이 제출한 지원을 최신순으로 반환한다. scope 로 상태 그룹 필터링: all(기본·전체) / active(SUBMITTED·UNDER_REVIEW·INTERVIEW_PENDING) / archived(ACCEPTED·REJECTED).")
@GetMapping("/users/me/applications")
ResponseEntity<ApiResponse<List<ApplicationSummaryResponse>>> getMyApplications(
        @RequestParam(name = "scope", defaultValue = "all") ApplicationScope scope,
        @AuthenticationPrincipal UserPrincipal currentUser
);
```

import 추가:
```java
import com.duing.domain.application.controller.ApplicationScope;
import org.springframework.web.bind.annotation.RequestParam;
```

- [ ] **Step 2: 컨트롤러 변경**

`ApplicationController.java`:

```java
@Override
public ResponseEntity<ApiResponse<List<ApplicationSummaryResponse>>> getMyApplications(
        ApplicationScope scope,
        @AuthenticationPrincipal UserPrincipal currentUser
) {
    List<ApplicationSummaryResponse> myApplications = applicationService
            .getMyApplications(currentUser.id(), scope.toStatuses()).stream()
            .map(ApplicationSummaryResponse::from)
            .toList();
    return ResponseEntity.ok(ApiResponse.success(myApplications));
}
```

import 추가: `com.duing.domain.application.controller.ApplicationScope` (같은 패키지라 불필요할 수 있음 — IDE 정리)

- [ ] **Step 3: Spring 의 enum 바인딩 대소문자 처리 확인**

기본적으로 Spring 의 `@RequestParam` enum 바인딩은 **대소문자 구분**한다. `scope=active` (소문자) 로 보내면 400 이 난다. FE 는 소문자를 보낼 예정이므로 case-insensitive 컨버터가 필요한지 검증:

```bash
grep -rn "WebMvcConfigurer\|StringToEnumConverter\|RegisterFormatters" backend/src/main/java/com/duing/global | head -5
```

전역 변환기가 없다면 이 task 에서 추가하지 말고 enum 값을 대문자로 보내도록 FE 가 맞춘다 — `ApplicationScope.ALL/ACTIVE/ARCHIVED`. FE 클라이언트 측에서 대문자로 직렬화한다. (Task 13 참조)

- [ ] **Step 4: 전체 컴파일 + 기존 테스트 회귀 확인**

```bash
./gradlew compileJava compileTestJava -p backend
./gradlew test --tests "com.duing.domain.application.*" -p backend
```

Expected: BUILD SUCCESSFUL. 기존 테스트가 깨졌다면 그 호출부에 `ApplicationScope.ALL.toStatuses()` 또는 `EnumSet.allOf(ApplicationStatus.class)` 를 넘기도록 보강.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application
git commit -m "feat(application): /users/me/applications 에 scope 쿼리 파라미터 지원"
```

---

## Task 7: scope 통합 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/application/service/MyApplicationsScopeTest.java`

- [ ] **Step 1: 테스트 작성**

`backend/src/test/java/com/duing/domain/application/service/MyApplicationsScopeTest.java`:

```java
package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.controller.ApplicationScope;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
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
class MyApplicationsScopeTest {

    @Autowired private ApplicationService applicationService;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("scope=ACTIVE 는 SUBMITTED/UNDER_REVIEW/INTERVIEW_PENDING 만 반환한다")
    void activeScopeReturnsOnlyInProgress() throws Exception {
        User user = saveStudent();
        Recruitment recruitment = saveRecruitmentWithClub();
        saveApplication(user, recruitment, ApplicationStatus.SUBMITTED);
        saveApplication(user, recruitment, ApplicationStatus.UNDER_REVIEW);
        saveApplication(user, recruitment, ApplicationStatus.INTERVIEW_PENDING);
        saveApplication(user, recruitment, ApplicationStatus.ACCEPTED);
        saveApplication(user, recruitment, ApplicationStatus.REJECTED);

        List<ApplicationSummaryQuery> result = applicationService
                .getMyApplications(user.getId(), ApplicationScope.ACTIVE.toStatuses());

        assertThat(result).hasSize(3);
        assertThat(result).extracting(ApplicationSummaryQuery::status)
                .containsExactlyInAnyOrder(
                        ApplicationStatus.SUBMITTED,
                        ApplicationStatus.UNDER_REVIEW,
                        ApplicationStatus.INTERVIEW_PENDING);
    }

    @Test
    @DisplayName("scope=ARCHIVED 는 ACCEPTED/REJECTED 만 반환한다")
    void archivedScopeReturnsTerminalOnly() throws Exception {
        User user = saveStudent();
        Recruitment recruitment = saveRecruitmentWithClub();
        saveApplication(user, recruitment, ApplicationStatus.SUBMITTED);
        saveApplication(user, recruitment, ApplicationStatus.ACCEPTED);
        saveApplication(user, recruitment, ApplicationStatus.REJECTED);

        List<ApplicationSummaryQuery> result = applicationService
                .getMyApplications(user.getId(), ApplicationScope.ARCHIVED.toStatuses());

        assertThat(result).hasSize(2);
        assertThat(result).extracting(ApplicationSummaryQuery::status)
                .containsExactlyInAnyOrder(ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED);
    }

    @Test
    @DisplayName("scope=ALL 은 모든 상태를 반환한다 (기존 호환)")
    void allScopeReturnsEverything() throws Exception {
        User user = saveStudent();
        Recruitment recruitment = saveRecruitmentWithClub();
        for (ApplicationStatus s : ApplicationStatus.values()) {
            saveApplication(user, recruitment, s);
        }

        List<ApplicationSummaryQuery> result = applicationService
                .getMyApplications(user.getId(), ApplicationScope.ALL.toStatuses());

        assertThat(result).hasSize(ApplicationStatus.values().length);
    }

    private User saveStudent() {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                "테스트유저" + unique,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private Recruitment saveRecruitmentWithClub() throws Exception {
        Club club = Club.create(
                "테스트동아리" + sequence.getAndIncrement(),
                ClubCategory.OTHER,
                "분과",
                "설명",
                null);
        clubRepository.save(club);
        Recruitment recruitment = Recruitment.create(
                club,
                "모집" + sequence.getAndIncrement(),
                null,
                LocalDate.now().minusDays(1),
                LocalDate.now().plusDays(10),
                10);
        return recruitmentRepository.save(recruitment);
    }

    private Application saveApplication(User user, Recruitment recruitment, ApplicationStatus status) throws Exception {
        Application application = Application.create(recruitment, user, List.of("답"));
        if (status != ApplicationStatus.SUBMITTED) {
            Field statusField = Application.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(application, status);
        }
        return applicationRepository.save(application);
    }
}
```

> 주의: `Application.create()` / `Recruitment.create()` / `Club.create()` 의 실제 정적 팩토리 시그니처는 코드베이스에서 확인 후 정확히 맞춘다. 시그니처 불일치 시 컴파일 오류로 즉시 발견된다.

- [ ] **Step 2: 테스트 실행 & 통과 확인**

```bash
./gradlew test --tests "com.duing.domain.application.service.MyApplicationsScopeTest" -p backend
```

Expected: 3 PASS.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/application/service/MyApplicationsScopeTest.java
git commit -m "test(application): scope 필터링 통합 테스트 추가"
```

---

## Task 8: MyClubQuery / MyClubResponse DTO 작성

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/MyClubQuery.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/MyClubResponse.java`

- [ ] **Step 1: Query DTO 작성**

`MyClubQuery.java`:

```java
package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

/**
 * 사용자(STUDENT/ADMIN 무관) 본인이 소속된 동아리 단건 — role 무관.
 * 마이페이지의 "가입한 동아리" 섹션이 사용한다.
 */
public record MyClubQuery(
        Long clubId,
        String clubName,
        String logoUrl,
        ClubMemberRole myRole,
        long activeRecruitmentCount,
        LocalDateTime joinedAt
) {
}
```

- [ ] **Step 2: Response DTO 작성**

`MyClubResponse.java`:

```java
package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import java.time.LocalDateTime;

public record MyClubResponse(
        Long clubId,
        String clubName,
        String logoUrl,
        ClubMemberRole myRole,
        long activeRecruitmentCount,
        LocalDateTime joinedAt
) {
    public static MyClubResponse from(MyClubQuery query) {
        return new MyClubResponse(
                query.clubId(),
                query.clubName(),
                query.logoUrl(),
                query.myRole(),
                query.activeRecruitmentCount(),
                query.joinedAt()
        );
    }
}
```

- [ ] **Step 3: 컴파일 확인 & 커밋**

```bash
./gradlew compileJava -p backend
git add backend/src/main/java/com/duing/domain/clubmember/service/dto/query/MyClubQuery.java \
        backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/MyClubResponse.java
git commit -m "feat(clubmember): MyClubQuery/MyClubResponse DTO 추가"
```

---

## Task 9: Repository — findMyClubsByUser 구현 + 통합 테스트 (TDD)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepositoryCustom.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepositoryImpl.java`
- Create: `backend/src/test/java/com/duing/domain/clubmember/service/MyClubsQueryTest.java`

- [ ] **Step 1: 실패 테스트 작성**

`MyClubsQueryTest.java` — `ManagedClubsQueryTest` 와 동일 패턴이되 MEMBER 포함, joinedAt 포함을 검증:

```java
package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
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
class MyClubsQueryTest {

    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("LEADER / OFFICER / MEMBER 멤버십이 모두 반환된다")
    void allRolesAreReturned() throws Exception {
        User user = saveStudent("학생");
        Club leaderClub = saveActiveClub("리더동아리");
        Club officerClub = saveActiveClub("운영진동아리");
        Club memberClub = saveActiveClub("일반회원동아리");
        saveMembership(leaderClub, user, ClubMemberRole.LEADER);
        saveMembership(officerClub, user, ClubMemberRole.OFFICER);
        saveMembership(memberClub, user, ClubMemberRole.MEMBER);

        List<MyClubQuery> result = clubMemberRepository.findMyClubsByUser(user.getId());

        assertThat(result).hasSize(3);
        assertThat(result).extracting(MyClubQuery::myRole)
                .containsExactlyInAnyOrder(
                        ClubMemberRole.LEADER, ClubMemberRole.OFFICER, ClubMemberRole.MEMBER);
    }

    @Test
    @DisplayName("다른 사용자의 멤버십은 반환되지 않는다")
    void otherUserMembershipsAreExcluded() throws Exception {
        User user = saveStudent("나");
        User otherUser = saveStudent("남");
        Club club = saveActiveClub("동아리");
        saveMembership(club, otherUser, ClubMemberRole.LEADER);

        List<MyClubQuery> result = clubMemberRepository.findMyClubsByUser(user.getId());

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("최근 가입(joinedAt DESC) 순으로 정렬된다")
    void orderedByJoinedAtDesc() throws Exception {
        User user = saveStudent("정렬");
        Club firstClub = saveActiveClub("먼저");
        Club secondClub = saveActiveClub("나중");
        saveMembership(firstClub, user, ClubMemberRole.MEMBER);
        Thread.sleep(20);
        saveMembership(secondClub, user, ClubMemberRole.MEMBER);

        List<MyClubQuery> result = clubMemberRepository.findMyClubsByUser(user.getId());

        assertThat(result).hasSize(2);
        assertThat(result.get(0).clubId()).isEqualTo(secondClub.getId());
        assertThat(result.get(1).clubId()).isEqualTo(firstClub.getId());
    }

    @Test
    @DisplayName("joinedAt 필드가 null 이 아니다")
    void joinedAtIsPopulated() throws Exception {
        User user = saveStudent("일자");
        Club club = saveActiveClub("동아리");
        LocalDateTime before = LocalDateTime.now().minusSeconds(1);
        saveMembership(club, user, ClubMemberRole.MEMBER);

        List<MyClubQuery> result = clubMemberRepository.findMyClubsByUser(user.getId());

        assertThat(result).hasSize(1);
        assertThat(result.get(0).joinedAt()).isNotNull();
        assertThat(result.get(0).joinedAt()).isAfter(before);
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
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
        );
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private void saveMembership(Club club, User user, ClubMemberRole role) {
        clubMemberRepository.save(ClubMember.of(club, user, role));
    }
}
```

- [ ] **Step 2: 테스트 실행 — 컴파일 실패 확인**

```bash
./gradlew test --tests "com.duing.domain.clubmember.service.MyClubsQueryTest" -p backend
```

Expected: `cannot find symbol: method findMyClubsByUser`.

- [ ] **Step 3: 인터페이스에 메서드 추가**

`ClubMemberRepositoryCustom.java` 끝에 추가:

```java
/**
 * 사용자가 현재 소속(LEADER/OFFICER/MEMBER) 된 동아리 목록 + 활성 모집 카운트 + 가입일.
 * - role 무관. soft-deleted 멤버십·동아리는 제외.
 * - 동아리 status 무관 (INACTIVE/PENDING_APPROVAL/REJECTED 도 포함) — 화면에서 분기.
 *   (MVP 의도된 단순화. 후속에서 UI 표기 분기 추가.)
 * - joinedAt = ClubMember.createdAt
 * - 정렬: joinedAt DESC
 */
List<MyClubQuery> findMyClubsByUser(Long userId);
```

import: `com.duing.domain.clubmember.service.dto.query.MyClubQuery`

- [ ] **Step 4: 구현체 작성**

`ClubMemberRepositoryImpl.java` 클래스에 메서드 추가:

```java
@Override
public List<MyClubQuery> findMyClubsByUser(Long userId) {
    LocalDate today = LocalDate.now();

    NumberExpression<Integer> activeRecruitmentFlag = new CaseBuilder()
            .when(recruitment.status.eq(RecruitmentStatus.OPEN)
                    .and(recruitment.endDate.goe(today))
                    .and(recruitment.deletedAt.isNull()))
            .then(1)
            .otherwise(0);

    return queryFactory
            .select(Projections.constructor(
                    MyClubQuery.class,
                    club.id,
                    club.name,
                    club.logoUrl,
                    clubMember.role,
                    activeRecruitmentFlag.sum().longValue().coalesce(0L),
                    clubMember.createdAt
            ))
            .from(clubMember)
            .join(clubMember.club, club)
            .leftJoin(recruitment).on(recruitment.club.id.eq(club.id))
            .where(clubMember.user.id.eq(userId))
            .groupBy(club.id, club.name, club.logoUrl, clubMember.role, clubMember.createdAt)
            .orderBy(clubMember.createdAt.desc())
            .fetch();
}
```

import 추가:
```java
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
```

> `@SQLRestriction` 가 `ClubMember`/`Club` 엔티티에 걸려 있으면 `deleted_at IS NULL` 은 자동 적용된다. 적용 여부는 entity 파일 확인 후 명시 where 가 필요하면 추가.

- [ ] **Step 5: 테스트 실행 & 통과 확인**

```bash
./gradlew test --tests "com.duing.domain.clubmember.service.MyClubsQueryTest" -p backend
```

Expected: 4 PASS.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepositoryCustom.java \
        backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepositoryImpl.java \
        backend/src/test/java/com/duing/domain/clubmember/service/MyClubsQueryTest.java
git commit -m "feat(clubmember): 내 가입 동아리 조회 쿼리(findMyClubsByUser) 추가"
```

---

## Task 10: API + Controller — GET /api/v1/me/clubs

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/api/MeClubApi.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/MeClubController.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberQueryService.java` (또는 동등 위치)

- [ ] **Step 1: ClubMemberQueryService 에 조회 메서드 추가**

`ClubMemberQueryService.java` 인터페이스에 추가:

```java
List<MyClubQuery> findMyClubs(Long userId);
```

`GeneralClubMemberQueryService.java` 구현에 추가 (기존 의존성 `ClubMemberRepository` 활용):

```java
@Override
public List<MyClubQuery> findMyClubs(Long userId) {
    return clubMemberRepository.findMyClubsByUser(userId);
}
```

import 추가: `com.duing.domain.clubmember.service.dto.query.MyClubQuery`

> 만약 `ClubMemberQueryService` 가 다른 책임에만 쓰이고 있다면 `ClubAuthService` 가 더 적합할 수 있다 — 코드베이스 컨벤션을 따른다. 어느 쪽이든 컨트롤러는 service 를 호출한다.

- [ ] **Step 2: API 인터페이스 작성**

`MeClubApi.java`:

```java
package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.response.MyClubResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "마이페이지", description = "사용자 본인 관점의 동아리·지원 조회 API")
@SecurityRequirement(name = "BearerAuth")
public interface MeClubApi {

    @Operation(
            summary = "내가 가입한 동아리 목록 조회",
            description = "현재 사용자가 LEADER / OFFICER / MEMBER 중 어떤 역할로든 소속된 동아리를 가입일(최신) 순으로 반환한다. " +
                    "운영자용 /leader/clubs/me/managed 와는 별개이며, 마이페이지 '가입한 동아리' 섹션에서 사용한다."
    )
    @GetMapping("/me/clubs")
    ResponseEntity<ApiResponse<List<MyClubResponse>>> getMyClubs(
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 3: 컨트롤러 작성**

`MeClubController.java`:

```java
package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.MeClubApi;
import com.duing.domain.clubmember.controller.dto.response.MyClubResponse;
import com.duing.domain.clubmember.service.ClubMemberQueryService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class MeClubController implements MeClubApi {

    private final ClubMemberQueryService clubMemberQueryService;

    @Override
    public ResponseEntity<ApiResponse<List<MyClubResponse>>> getMyClubs(
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<MyClubResponse> myClubs = clubMemberQueryService.findMyClubs(currentUser.id())
                .stream()
                .map(MyClubResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(myClubs));
    }
}
```

- [ ] **Step 4: SecurityConfig 확인**

`/api/v1/me/**` 가 이미 인증 필요 패턴에 포함되는지 확인:

```bash
grep -n "/me\|authenticated\|permitAll" backend/src/main/java/com/duing/global/config/SecurityConfig.java
```

만약 `/api/v1/**` 가 기본 인증 필요라면 추가 작업 불필요. `/me/clubs` 만을 위한 특별 설정은 하지 않는다.

- [ ] **Step 5: 전체 빌드 & 회귀 테스트**

```bash
./gradlew build -p backend
```

Expected: BUILD SUCCESSFUL. 실패 시 의존성/import/Spring 빈 등록 오류 확인.

- [ ] **Step 6: 커밋 & PR**

```bash
git add backend/src/main/java/com/duing/domain/clubmember
git commit -m "feat(clubmember): GET /api/v1/me/clubs 신설 (마이페이지용 멤버십 목록)"
git push -u origin feat/be-me-clubs-and-application-scope
gh pr create --base develop --title "feat(backend): 마이페이지용 /me/clubs + /users/me/applications scope 필터" --body "$(cat <<'EOF'
## 🚀 작업 내용
마이페이지에서 합격(ACCEPTED) 직후 학생이 (1) "진행 중인 지원"에서 사라지고 (2) "가입한 동아리"에 MEMBER 로 노출되도록 만들기 위한 백엔드 변경. Application 도메인 로직은 변경하지 않고 조회 API 두 군데만 손봤다.

- `ApplicationStatus` 에 `isActive() / isTerminal()` 헬퍼 추가
- `/users/me/applications` 에 `scope=all|active|archived` 쿼리 파라미터 도입 (기본값 `all` 유지로 기존 호환)
- `GET /api/v1/me/clubs` 신설 — LEADER/OFFICER/MEMBER 무관하게 본인이 속한 동아리를 가입일 최신순으로 반환. 기존 `/leader/clubs/me/managed` 와 책임 분리.

## 🤔 고민했던 내용
운영자 콘솔용 API 를 그대로 확장하지 않고 사용자 관점의 별도 엔드포인트를 만든 이유는, 이후 운영 통계·pending 지원 수·moderation 같은 운영 전용 필드가 붙기 시작할 때 응답 책임이 섞이지 않게 하기 위함이다. scope 의 기본값을 `all` 로 둔 것도 동일한 의도 — 기존 호출부를 깨지 않고 FE 에서 명시적으로 `scope=active` 를 쓰도록 했다.

## 💬 리뷰 중점사항
- `ApplicationScope` 의 `toStatuses()` 가 enum 추가 시 자동 반영되는 형태인지
- `findMyClubsByUser` 가 동아리 상태(INACTIVE/PENDING_APPROVAL) 무관하게 반환하는데, 현재 UI 분기 부재 — 의도된 단순화로 봐도 되는지
EOF
)"
```

---

# PR-2 — Frontend Infrastructure

## Task 11: 브랜치 분기 (PR-1 머지 후)

- [ ] **Step 1: develop 동기화 + 새 브랜치**

```bash
git checkout develop && git pull
git checkout -b feat/fe-infra-me-clubs
cd frontend && pnpm install
```

---

## Task 12: 타입 추가

**Files:**
- Modify: `frontend/packages/types/src/application.ts`
- Modify: `frontend/packages/types/src/club.ts`
- Modify: `frontend/packages/types/src/index.ts`

- [ ] **Step 1: ApplicationScope 추가**

`application.ts` 의 `ApplicationStatus` 정의 바로 아래에 추가:

```ts
export type ApplicationScope = 'ALL' | 'ACTIVE' | 'ARCHIVED';
```

- [ ] **Step 2: MyClubSummary 추가**

`club.ts` 의 `ClubRole`/`ManagedClub` 근처에 추가 (기존 두 타입은 유지):

```ts
export type MyClubRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export type MyClubSummary = {
  clubId: number;
  clubName: string;
  logoUrl: string | null;
  myRole: MyClubRole;
  activeRecruitmentCount: number;
  joinedAt: string; // ISO datetime
};
```

- [ ] **Step 3: index.ts 에서 export**

`packages/types/src/index.ts` 에서 위 두 타입을 export 하고 있는지 확인하고, 빠졌다면 추가한다. (대개 `export * from './application'`, `export * from './club'` 이면 자동 노출됨)

- [ ] **Step 4: 타입 빌드 확인**

```bash
pnpm --filter @duing/types build
```

Expected: 성공.

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/types
git commit -m "feat(types): ApplicationScope, MyClubSummary 타입 추가"
```

---

## Task 13: API 클라이언트에 메서드 추가

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: 타입 선언 추가 (DuingApiClient)**

`users:` 블록에 시그니처 추가:

```ts
  users: {
    me(): Promise<User>;
    myApplications(scope?: ApplicationScope): Promise<ApplicationSummary[]>;
    myClubs(): Promise<MyClubSummary[]>;
  };
```

import 추가:
```ts
import type { ApplicationScope, ... } from '@duing/types';
import type { MyClubSummary } from '@duing/types';
```

- [ ] **Step 2: 구현 변경**

`users:` 구현 부분 (라인 ~330):

```ts
    users: {
      me: () => jsonOk<User>(http.get('users/me')),
      myApplications: (scope) =>
        jsonOk<ApplicationSummary[]>(
          http.get('users/me/applications', {
            searchParams: scope ? { scope } : undefined,
          }),
        ),
      myClubs: () => jsonOk<MyClubSummary[]>(http.get('me/clubs')),
    },
```

> BE 가 enum 값을 대문자(`ALL/ACTIVE/ARCHIVED`)로 받으므로, 타입도 대문자로 정의함 (Task 12 참조).

- [ ] **Step 3: 빌드 확인**

```bash
pnpm --filter @duing/api build
```

Expected: 성공.

- [ ] **Step 4: 커밋**

```bash
git add frontend/packages/api/src/client.ts
git commit -m "feat(api): users.myApplications(scope) + users.myClubs() 추가"
```

---

## Task 14: Hooks — useMyClubsQuery + useMyApplicationsQuery 시그니처 확장

**Files:**
- Modify: `frontend/packages/hooks/src/userQueryKeys.ts`
- Modify: `frontend/packages/hooks/src/applicationQueryKeys.ts`
- Modify: `frontend/packages/hooks/src/applications.ts`
- Modify: `frontend/packages/hooks/src/clubs.ts` (또는 신규 파일 — 결정 아래)
- Modify: `frontend/packages/hooks/src/index.ts`

- [ ] **Step 1: 쿼리키 확장**

`userQueryKeys.ts` 에 `myClubs()` 추가:

```ts
export const userQueryKeys = {
  // ... 기존
  me: () => ['users', 'me'] as const,
  myClubs: () => ['users', 'me', 'clubs'] as const,
};
```

(기존 me 키 형태가 다르면 그 형태를 유지하며 myClubs 만 같은 prefix 로 추가)

`applicationQueryKeys.ts`:

```ts
import type { ApplicationScope } from '@duing/types';

export const applicationQueryKeys = {
  all: ['applications'] as const,
  myList: (scope: ApplicationScope = 'ALL') =>
    ['users', 'me', 'applications', { scope }] as const,
  myDetail: (applicationId: number) =>
    ['users', 'me', 'applications', applicationId] as const,
  applicants: (recruitmentId: number) =>
    [...applicationQueryKeys.all, 'applicants', recruitmentId] as const,
  applicantDetail: (applicationId: number) =>
    [...applicationQueryKeys.all, 'applicantDetail', applicationId] as const,
};
```

- [ ] **Step 2: useMyApplicationsQuery 시그니처 확장**

`applications.ts`:

```ts
import type { ApplicationScope } from '@duing/types';

export function useMyApplicationsQuery(scope: ApplicationScope = 'ALL') {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: applicationQueryKeys.myList(scope),
    queryFn: () => client.users.myApplications(scope),
    enabled: status === 'authenticated',
  });
}
```

> `myDetail` 의 키 prefix 가 `myList()` 와 충돌 가능성을 검토하라. 위 변경으로 myList 키 끝에 `{scope}` 객체가 붙으므로, myDetail 의 키와 prefix 매칭 시 영향 없음(다른 끝항).

- [ ] **Step 3: useSubmitApplicationMutation 의 invalidation 키 보정**

새 `myList(scope)` 가 `['users','me','applications', {scope}]` 처럼 끝항 객체를 포함하므로, mutation 의 무효화는 **prefix 전용 키**를 호출해야 한다. `applicationQueryKeys` 에 헬퍼 추가:

```ts
export const applicationQueryKeys = {
  all: ['applications'] as const,
  allMyLists: ['users', 'me', 'applications'] as const,  // ← prefix 무효화용
  myList: (scope: ApplicationScope = 'ALL') =>
    [...applicationQueryKeys.allMyLists, { scope }] as const,
  myDetail: (applicationId: number) =>
    [...applicationQueryKeys.allMyLists, applicationId] as const,
  applicants: (recruitmentId: number) =>
    [...applicationQueryKeys.all, 'applicants', recruitmentId] as const,
  applicantDetail: (applicationId: number) =>
    [...applicationQueryKeys.all, 'applicantDetail', applicationId] as const,
};
```

`applications.ts` 의 `useSubmitApplicationMutation` invalidation 변경:

```ts
queryClient.invalidateQueries({ queryKey: applicationQueryKeys.allMyLists });
```

TanStack Query 는 부분 prefix 매칭으로 모든 scope 캐시(`{scope:'ALL'}`, `{scope:'ACTIVE'}`, ...) 와 myDetail 까지 한꺼번에 무효화한다. myDetail 까지 무효화되어도 사용자가 제출 직후 detail 화면을 보고 있을 확률은 낮고, refetch 비용도 낮다.

- [ ] **Step 4: useMyClubsQuery 추가**

`clubs.ts` 에 추가 (기존 `useManagedClubsQuery` 는 운영자 콘솔에서 계속 쓰므로 유지):

```ts
import { userQueryKeys } from './userQueryKeys';
// ... 다른 import

export function useMyClubsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: userQueryKeys.myClubs(),
    queryFn: () => client.users.myClubs(),
  });
}
```

- [ ] **Step 5: index.ts 에서 export**

`frontend/packages/hooks/src/index.ts` 에 `useMyClubsQuery` export 추가 (기존 패턴 따름):

```ts
export {
  // ... 기존
  useManagedClubsQuery,
  useMyClubsQuery,
} from './clubs';
```

- [ ] **Step 6: 빌드 + 타입체크**

```bash
pnpm --filter @duing/hooks build
pnpm --filter web typecheck
```

Expected: 성공. (web 의 기존 `useMyApplicationsQuery()` 무인자 호출은 default `'ALL'` 로 동작 — 호환됨)

- [ ] **Step 7: 커밋 & PR**

```bash
git add frontend/packages/hooks frontend/packages/types frontend/packages/api
git commit -m "feat(hooks): useMyClubsQuery 추가 + useMyApplicationsQuery scope 지원"
git push -u origin feat/fe-infra-me-clubs
gh pr create --base develop --title "feat(frontend): 마이페이지용 hooks/types/api infra (useMyClubsQuery, scope)" --body "$(cat <<'EOF'
## 🚀 작업 내용
PR-1 (백엔드 `/me/clubs` + scope) 에 대응하는 FE infra 만 분리해 머지한다. UI 변경은 없고 packages/types · packages/api · packages/hooks 만 손봤다.

- `MyClubSummary` / `MyClubRole` / `ApplicationScope` 타입
- `client.users.myClubs()` / `client.users.myApplications(scope)`
- `useMyClubsQuery()` / `useMyApplicationsQuery(scope?)` (기존 무인자 호출은 default `ALL` 로 그대로 동작)

## 🤔 고민했던 내용
`useMyApplicationsQuery` 의 query key 끝에 `{scope}` 객체를 붙이면서 `useSubmitApplicationMutation` 의 invalidate 키와의 prefix 매칭이 깨지지 않는지 점검했다 — `['users','me','applications']` prefix 매칭으로 모든 scope 캐시가 한 번에 무효화되므로 안전했다.

## 💬 리뷰 중점사항
- `useManagedClubsQuery` 를 그대로 남긴 결정 — 운영자 콘솔이 계속 쓰니까 유지가 맞는지
- query key 설계가 후속 캐시 무효화 패턴을 깨뜨리지 않는지
EOF
)"
```

---

# PR-3 — Frontend MyPage 리워크

## Task 15: 브랜치 분기 (PR-2 머지 후)

- [ ] **Step 1**

```bash
git checkout develop && git pull
git checkout -b feat/fe-mypage-acceptance-flow
cd frontend && pnpm install
```

---

## Task 16: SectionApply — ACCEPTED/REJECTED 분기 제거

**Files:**
- Modify: `frontend/apps/web/app/me/_components/SectionApply.tsx`

- [ ] **Step 1: 컴포넌트 단순화**

기존 `STATUS_STEP`, `ACTION_LABEL`, `statusNote()` 에서 ACCEPTED/REJECTED 키를 제거한다. props 타입은 `ApplicationSummary[]` 그대로 두되, scope=active 만 들어온다는 전제로 코드 단순화:

```ts
const STEPS = ['서류', '검토', '면접'] as const; // '결과' 단계 제거

const STATUS_STEP: Record<'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW_PENDING', number> = {
  SUBMITTED: 1,
  UNDER_REVIEW: 2,
  INTERVIEW_PENDING: 3,
};

const ACTION_LABEL: Record<'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW_PENDING', string> = {
  SUBMITTED: '지원서 보기',
  UNDER_REVIEW: '지원서 보기',
  INTERVIEW_PENDING: '면접 일정 보기',
};

const statusNote = (app: ApplicationSummary): string => {
  if (app.status === 'INTERVIEW_PENDING' && app.interviewAt) {
    const at = new Date(app.interviewAt).toLocaleString('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `면접: ${at}${app.interviewLocation ? ` — ${app.interviewLocation}` : ''}`;
  }
  if (app.status === 'UNDER_REVIEW') return '동아리에서 검토 중입니다';
  return '지원서 작성 완료';
};
```

> 좁힌 타입에서 벗어난 status 가 런타임에 들어올 경우(이론상 BE 가 archived 를 섞어 보낼 때) 안전을 위해, render 시 `STATUS_STEP[app.status]` 가 undefined 면 카드를 skip 한다. defensive guard 만 추가:

```ts
{applications.map((app) => {
  if (!(app.status in STATUS_STEP)) return null; // 안전 가드: archived 가 섞이는 비정상 케이스
  // ... 기존 카드 렌더
})}
```

(`step`/`isInterview` 계산은 위 가드 통과 후 동일하게)

- [ ] **Step 2: 컴파일 + 단위 테스트 추가**

`frontend/apps/web/test/me/section-apply.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationSummary } from '@duing/types';

import { SectionApply } from '../../app/me/_components/SectionApply';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const base: ApplicationSummary = {
  id: 1,
  recruitmentId: 100,
  recruitmentTitle: '봄 신입 모집',
  clubId: 10,
  clubName: '두잉 댄스',
  category: 'CULTURE',
  logoUrl: null,
  status: 'SUBMITTED',
  interviewAt: null,
  interviewLocation: null,
  submittedAt: '2026-05-26T10:00:00Z',
};

describe('SectionApply — active 상태만 렌더', () => {
  it('SUBMITTED 카드는 정상 렌더된다', () => {
    render(<SectionApply applications={[base]} />);
    expect(screen.getByText('두잉 댄스')).toBeInTheDocument();
  });

  it('ACCEPTED 가 섞여 들어와도 카드가 렌더되지 않는다', () => {
    const accepted = { ...base, id: 2, status: 'ACCEPTED' as const, clubName: '합격동아리' };
    render(<SectionApply applications={[base, accepted]} />);
    expect(screen.getByText('두잉 댄스')).toBeInTheDocument();
    expect(screen.queryByText('합격동아리')).not.toBeInTheDocument();
  });

  it('빈 배열이면 안내 문구가 노출된다', () => {
    render(<SectionApply applications={[]} />);
    expect(screen.getByText(/진행 중인 지원이 없어요/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 테스트 실행**

```bash
pnpm --filter web test -- section-apply
```

Expected: 3 PASS.

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/me/_components/SectionApply.tsx \
        frontend/apps/web/test/me/section-apply.test.tsx
git commit -m "refactor(me): SectionApply 에서 ACCEPTED/REJECTED 단계 제거"
```

---

## Task 17: SectionJoined → SectionMyClubs 리네이밍 + role pill

**Files:**
- Rename + Modify: `SectionJoined.tsx` → `SectionMyClubs.tsx`
- Create: `frontend/apps/web/test/me/section-my-clubs.test.tsx`

- [ ] **Step 1: 파일 리네이밍**

```bash
git mv frontend/apps/web/app/me/_components/SectionJoined.tsx \
       frontend/apps/web/app/me/_components/SectionMyClubs.tsx
```

- [ ] **Step 2: 컴포넌트 재작성**

`SectionMyClubs.tsx` 전체 교체:

```tsx
import Link from 'next/link';

import type { MyClubSummary } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';

import { SectionHeader } from './SectionHeader';

const ROLE_LABEL: Record<MyClubSummary['myRole'], string> = {
  LEADER: '동아리장',
  OFFICER: '운영진',
  MEMBER: '회원',
};

type Props = {
  myClubs: MyClubSummary[];
};

export function SectionMyClubs({ myClubs }: Props) {
  return (
    <section
      data-section="joined"
      id="sec-joined"
      className="px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title={`가입한 동아리 · ${myClubs.length}`}
          hint="활동 중인 동아리와 다음 모임 일정을 확인해요."
        />

        {myClubs.length === 0 ? (
          <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
            아직 가입한 동아리가 없어요.{' '}
            <Link href="/clubs" className="text-ink font-semibold hover:underline">
              동아리 탐색하러 가기 →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {myClubs.map((club) => {
              const isManager = club.myRole === 'LEADER' || club.myRole === 'OFFICER';
              const roleLabel = ROLE_LABEL[club.myRole];

              return (
                <div
                  key={club.clubId}
                  className={cn(
                    'bg-paper rounded-[18px] px-5 py-5 flex items-center gap-4',
                    'transition-[transform,box-shadow] duration-150',
                    'hover:-translate-y-0.5 hover:shadow-2',
                    isManager ? 'border-[1.5px] border-ink' : 'border border-line',
                  )}
                >
                  <div
                    className={cn(
                      'w-14 h-14 rounded-[14px] grid place-items-center text-[26px] shrink-0',
                      isManager ? 'bg-ink-deep text-white' : 'bg-sage-mist text-ink-deep',
                    )}
                  >
                    {club.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={club.logoUrl}
                        alt={club.clubName}
                        className="w-full h-full object-cover rounded-[14px]"
                      />
                    ) : (
                      '🏛'
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-bold text-[16px] text-ink-deep">{club.clubName}</span>
                      <span
                        className={cn(
                          'pill text-[10.5px]',
                          isManager && 'bg-ink text-white border-ink',
                        )}
                      >
                        {isManager && '✦ '}
                        {roleLabel}
                      </span>
                    </div>
                    {club.activeRecruitmentCount > 0 && (
                      <div className="text-[12.5px] text-charcoal-2">
                        <span className="font-semibold">모집 중</span> · {club.activeRecruitmentCount}개 공고
                      </div>
                    )}
                  </div>

                  {isManager ? (
                    <Link
                      href={`/manage?clubId=${club.clubId}`}
                      className="btn btn-primary btn-sm"
                      title="동아리 운영자 콘솔로 이동"
                    >
                      관리
                      <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <Link
                      href={`/clubs/${club.clubId}`}
                      className="btn btn-ghost btn-sm"
                      aria-label={`${club.clubName} 둘러보기`}
                    >
                      둘러보기
                      <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 테스트 작성**

`frontend/apps/web/test/me/section-my-clubs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyClubSummary } from '@duing/types';

import { SectionMyClubs } from '../../app/me/_components/SectionMyClubs';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const make = (overrides: Partial<MyClubSummary> = {}): MyClubSummary => ({
  clubId: 1,
  clubName: '두잉',
  logoUrl: null,
  myRole: 'MEMBER',
  activeRecruitmentCount: 0,
  joinedAt: '2026-05-20T10:00:00Z',
  ...overrides,
});

describe('SectionMyClubs', () => {
  it('LEADER 카드는 "동아리장" pill 과 "관리" 액션 링크를 노출한다', () => {
    render(<SectionMyClubs myClubs={[make({ myRole: 'LEADER', clubName: '리더동' })]} />);
    expect(screen.getByText(/동아리장/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /관리/ });
    expect(link).toHaveAttribute('href', '/manage?clubId=1');
  });

  it('MEMBER 카드는 "회원" pill 과 "둘러보기" 링크 (/clubs/{id}) 를 노출한다', () => {
    render(<SectionMyClubs myClubs={[make({ myRole: 'MEMBER', clubId: 42, clubName: '회원동' })]} />);
    expect(screen.getByText('회원')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /둘러보기/ });
    expect(link).toHaveAttribute('href', '/clubs/42');
  });

  it('빈 배열이면 안내 문구를 노출한다', () => {
    render(<SectionMyClubs myClubs={[]} />);
    expect(screen.getByText(/아직 가입한 동아리가 없어요/)).toBeInTheDocument();
  });

  it('카운트 헤더에 총 개수가 반영된다', () => {
    render(
      <SectionMyClubs
        myClubs={[make({ clubId: 1 }), make({ clubId: 2, myRole: 'LEADER' })]}
      />,
    );
    expect(screen.getByText(/가입한 동아리 · 2/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 테스트 실행**

```bash
pnpm --filter web test -- section-my-clubs
```

Expected: 4 PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/me/_components/SectionMyClubs.tsx \
        frontend/apps/web/test/me/section-my-clubs.test.tsx
git commit -m "refactor(me): SectionJoined → SectionMyClubs 리네이밍 + MEMBER role 지원"
```

---

## Task 18: AcceptanceBanner 컴포넌트

**Files:**
- Create: `frontend/apps/web/app/me/_components/AcceptanceBanner.tsx`
- Create: `frontend/apps/web/test/me/acceptance-banner.test.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`AcceptanceBanner.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { MyClubSummary } from '@duing/types';

const ACK_KEY_PREFIX = 'duing.acceptedAck.';
const ACK_WINDOW_DAYS = 30;

type Props = {
  myClubs: MyClubSummary[];
};

function pickBannerCandidate(clubs: MyClubSummary[], now: Date): MyClubSummary | null {
  if (clubs.length === 0) return null;
  const cutoffMs = now.getTime() - ACK_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const candidate = [...clubs]
    .filter((c) => new Date(c.joinedAt).getTime() >= cutoffMs)
    .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())[0];

  if (!candidate) return null;
  if (typeof window === 'undefined') return null;
  if (window.localStorage.getItem(ACK_KEY_PREFIX + candidate.clubId)) return null;
  return candidate;
}

export function AcceptanceBanner({ myClubs }: Props) {
  const [dismissedId, setDismissedId] = useState<number | null>(null);

  const candidate = useMemo(
    () => pickBannerCandidate(myClubs, new Date()),
    [myClubs],
  );

  if (!candidate || candidate.clubId === dismissedId) return null;

  const ack = () => {
    try {
      window.localStorage.setItem(ACK_KEY_PREFIX + candidate.clubId, String(Date.now()));
    } catch {
      /* localStorage 차단 환경 — 세션 동안만 닫힘 */
    }
    setDismissedId(candidate.clubId);
  };

  return (
    <div
      role="status"
      className="max-w-layout mx-auto mt-4 mb-2 px-10"
    >
      <div className="flex items-center gap-3 rounded-[14px] border border-ink bg-ink/[0.04] px-5 py-3">
        <span className="text-[18px]">🎉</span>
        <div className="flex-1 text-[14px] text-ink-deep">
          <b>{candidate.clubName}</b> 동아리에 합류했어요!
        </div>
        <Link
          href={`/clubs/${candidate.clubId}`}
          onClick={ack}
          className="btn btn-primary btn-sm"
        >
          둘러보기
        </Link>
        <button
          type="button"
          onClick={ack}
          className="btn btn-ghost btn-sm"
          aria-label="합격 배너 닫기"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 테스트 작성**

`acceptance-banner.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyClubSummary } from '@duing/types';

import { AcceptanceBanner } from '../../app/me/_components/AcceptanceBanner';

vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
}));

const make = (overrides: Partial<MyClubSummary> = {}): MyClubSummary => ({
  clubId: 1,
  clubName: '두잉',
  logoUrl: null,
  myRole: 'MEMBER',
  activeRecruitmentCount: 0,
  joinedAt: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe('AcceptanceBanner', () => {
  it('30일 이내 가입 + ack 없음 → 배너 표시', () => {
    render(<AcceptanceBanner myClubs={[make({ clubName: '환영동' })]} />);
    expect(screen.getByText(/환영동/)).toBeInTheDocument();
  });

  it('30일을 초과한 가입이면 표시되지 않는다', () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    render(<AcceptanceBanner myClubs={[make({ joinedAt: old })]} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('이미 ack 한 clubId 는 표시되지 않는다', () => {
    window.localStorage.setItem('duing.acceptedAck.1', '12345');
    render(<AcceptanceBanner myClubs={[make({ clubId: 1 })]} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('닫기 누르면 사라지고 localStorage 에 ack 저장된다', () => {
    render(<AcceptanceBanner myClubs={[make({ clubId: 7 })]} />);
    fireEvent.click(screen.getByRole('button', { name: /합격 배너 닫기/ }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('duing.acceptedAck.7')).not.toBeNull();
  });

  it('여러 합격이 있으면 가장 최근 1개만 노출한다', () => {
    const older = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const newer = new Date().toISOString();
    render(
      <AcceptanceBanner
        myClubs={[
          make({ clubId: 1, clubName: '오래된합격', joinedAt: older }),
          make({ clubId: 2, clubName: '최근합격', joinedAt: newer }),
        ]}
      />,
    );
    expect(screen.getByText(/최근합격/)).toBeInTheDocument();
    expect(screen.queryByText(/오래된합격/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 테스트 실행**

```bash
pnpm --filter web test -- acceptance-banner
```

Expected: 5 PASS.

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/me/_components/AcceptanceBanner.tsx \
        frontend/apps/web/test/me/acceptance-banner.test.tsx
git commit -m "feat(me): 합격 축하 배너 (localStorage 기반 ack, 30일 윈도우)"
```

---

## Task 19: MyPage 재배선

**Files:**
- Modify: `frontend/apps/web/app/me/_pages/MyPage.tsx`

- [ ] **Step 1: import 교체**

상단:

```tsx
import { useFavoriteListQuery, useMeQuery, useMyApplicationsQuery, useMyClubsQuery } from '@duing/hooks';

import { AcceptanceBanner } from '../_components/AcceptanceBanner';
import { MyPageHeader } from '../_components/MyPageHeader';
import { MyPageTabs } from '../_components/MyPageTabs';
import { SectionApply } from '../_components/SectionApply';
import { SectionMyClubs } from '../_components/SectionMyClubs';
import { SectionSaved } from '../_components/SectionSaved';
```

(`useManagedClubsQuery` import 제거, `SectionJoined` import 제거)

- [ ] **Step 2: 쿼리 변경**

기존:
```tsx
const applicationsQuery = useMyApplicationsQuery();
const managedClubsQuery = useManagedClubsQuery();
...
const applications = applicationsQuery.data ?? [];
const managedClubs = managedClubsQuery.data ?? [];
```

변경:
```tsx
const applicationsQuery = useMyApplicationsQuery('ACTIVE');
const myClubsQuery = useMyClubsQuery();
...
const applications = applicationsQuery.data ?? [];
const myClubs = myClubsQuery.data ?? [];
```

- [ ] **Step 3: 카운트/렌더 변경**

`sectionsWithCount` 의 `'joined'` 분기에서 `managedClubs.length` 를 `myClubs.length` 로:

```tsx
const count =
  section.id === 'apply'
    ? applications.length
    : section.id === 'joined'
      ? myClubs.length
      : favorites.length;
```

`MyPageHeader` props:
```tsx
<MyPageHeader
  name={user?.name ?? '—'}
  studentId={user?.studentId ?? '—'}
  email={user?.email ?? '—'}
  applyCount={applications.length}
  joinedCount={myClubs.length}
  savedCount={favorites.length}
/>
```

배너 마운트 (`MyPageHeader` 와 `MyPageTabs` 사이):
```tsx
<MyPageHeader ... />

<AcceptanceBanner myClubs={myClubs} />

<MyPageTabs ... />
```

섹션 렌더 — `SectionJoined` → `SectionMyClubs`:
```tsx
<div ref={refFor('joined')} data-section="joined">
  <SectionMyClubs myClubs={myClubs} />
</div>
```

- [ ] **Step 4: 타입체크 + 빌드 + 기존 회귀 테스트**

```bash
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web test
```

Expected: 모두 성공. 기존 테스트 영향 없음(섹션 props 가 자급식이라).

- [ ] **Step 5: 브라우저 수동 확인 (필수)**

```bash
pnpm --filter web dev
```

체크리스트 (시드 데이터 또는 직접 ACCEPTED 상태로 만들어 둔 계정으로 `/me` 접속):

1. "진행 중인 지원" 에 ACCEPTED·REJECTED 카드가 보이지 않는다
2. "가입한 동아리" 에 MEMBER 동아리가 "회원" pill 과 함께 보인다
3. 상단에 합격 배너가 표시되고, 닫기 누르면 사라지며 새로고침해도 다시 안 뜬다
4. 탭 클릭 → 해당 섹션으로 스크롤 동작이 정상
5. URL `/me#sec-joined` 같은 anchor deep-link 가 여전히 작동

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/me/_pages/MyPage.tsx
git commit -m "feat(me): MyPage 가 useMyClubsQuery + scope=ACTIVE 지원으로 재배선되고 합격 배너 마운트"
```

---

## Task 20: PR-3 push & 생성

- [ ] **Step 1: 푸시 + PR**

```bash
git push -u origin feat/fe-mypage-acceptance-flow
gh pr create --base develop --title "feat(frontend): 마이페이지 합격 후 지원→소속 자동 전환" --body "$(cat <<'EOF'
## 🚀 작업 내용
PR-1 (백엔드) / PR-2 (FE infra) 위에서 마이페이지의 사용자 가시 동작을 정리한다.

- "진행 중인 지원" 은 이제 SUBMITTED / UNDER_REVIEW / INTERVIEW_PENDING 만 노출. step bar 의 "결과" 단계 제거
- "가입한 동아리" 는 LEADER / OFFICER 뿐 아니라 MEMBER 도 함께 보이고 role pill 로 구분. MEMBER 카드는 "둘러보기" 액션으로 동아리 상세로 이동
- 마이페이지 상단에 합격 축하 배너 — 30일 이내 가입한 동아리 중 가장 최근 1건을 노출, localStorage 로 ack
- `SectionJoined` → `SectionMyClubs` 리네이밍 (DOM id `sec-joined` 는 anchor 호환 위해 유지)

## 🤔 고민했던 내용
배너의 ack 기준을 "최근 7일"이 아니라 30일로 둔 이유는 한동안 안 들어온 사용자가 복귀했을 때 합격 사실을 놓치지 않게 하기 위함. localStorage 기반이라 다기기 동기화는 안 되지만 MVP UX 에서는 단순함이 더 가치 있다고 판단했다.

SectionApply 에서는 타입 좁히기 대신 defensive guard 만 추가해 BE 가 scope=ACTIVE 응답에 archived 를 섞어 보내는 비정상 케이스에도 화면이 깨지지 않도록 했다.

## 💬 리뷰 중점사항
- 합격 배너의 a11y (role="status", 닫기 버튼 aria-label) 가 충분한지
- step bar 가 4단 → 3단으로 줄면서 카드 그리드 폭(`360px`)에 시각적 부조화는 없는지
EOF
)"
```

---

## Self-Review (작성자가 직접 수행)

이 plan 의 모든 step 을 마치고 PR 들이 모두 머지된 뒤, spec(`docs/superpowers/specs/2026-05-27-mypage-acceptance-membership-split-design.md`) 의 다음 요구사항이 모두 충족되었는지 검증:

- [ ] §4.1 ApplicationStatus 헬퍼 — Task 2
- [ ] §4.2 scope 파라미터 (기본 ALL) — Task 3, 6, 7
- [ ] §4.3 GET /me/clubs 신설, joinedAt DESC, role 무관 — Task 8, 9, 10
- [ ] §5.1 packages/types · api · hooks 변경 — Task 12, 13, 14
- [ ] §5.2 SectionApply 단순화 — Task 16
- [ ] §5.3 SectionMyClubs 리네이밍 + role pill — Task 17
- [ ] §5.4 합격 배너 (localStorage, 30일) — Task 18
- [ ] §5.5 MyPage 재배선 — Task 19
- [ ] §6 PR 3개 분리 — Task 10, 14, 20

§8 의 미해결 항목들은 plan 진행 중에 다음과 같이 결정됨:
- `MeClubController` 위치 → `domain/clubmember/controller/` (Task 10)
- INACTIVE 동아리 포함 여부 → 포함 (Task 9 step 3 docstring 명시). UI 분기는 후속 PR
- `useManagedClubsQuery` 의 마이페이지 외 호출부 → 운영자 콘솔 `/manage` 라우트가 사용 (Task 14 step 4 에서 유지)

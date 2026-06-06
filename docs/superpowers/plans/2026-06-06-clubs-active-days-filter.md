# `/clubs` 활동요일 필터 활성화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/clubs` 탐색 페이지의 활동요일 필터(현재 disabled)를 활성화한다. 백엔드에 `activeDays` 쿼리 파라미터(OR 매칭), 프론트엔드에 7요일 토글·URL 동기화·액티브 칩을 구현한다.

**Architecture:** 백엔드는 기존 `ClubRepositoryImpl.findByCondition` 의 QueryDSL `BooleanExpression[]` 패턴을 그대로 따라 `activeDaysOverlap()` 한 줄을 합류시킨다. CSV 컬럼(`active_days TEXT`) 을 PostgreSQL `&&` 연산자로 OR 매칭하기 위해 `PostgresFunctionContributor` 에 `array_overlap_csv(csv, csv)` HQL 패턴 1개를 추가한다(기존 `array_overlap_text` 와 대칭). 프론트엔드는 `tags` 가 사용하는 반복 쿼리 파라미터 (`?activeDays=A&activeDays=B`) 패턴을 그대로 채택해 `exploreParams.ts` 의 parse·serialize·toApiParams 3 함수만 확장한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Hibernate 6 / QueryDSL — Next.js 15 / React 19 / TanStack Query / Vitest

**Spec:** [`docs/superpowers/specs/2026-06-06-clubs-active-days-filter-design.md`](../specs/2026-06-06-clubs-active-days-filter-design.md)

---

## 파일 구조

### Backend — PR 1 (`feat/clubs-active-days-filter-api`)

| 파일 | 종류 | 책임 |
|---|---|---|
| `backend/src/main/java/com/duing/global/config/PostgresFunctionContributor.java` | 수정 | `array_overlap_csv` HQL 패턴 등록 |
| `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java` | 수정 | `Set<DayOfWeek> activeDays` 필드 + `effectiveActiveDays()` 헬퍼 |
| `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java` | 수정 | `activeDaysOverlap()` predicate |
| `backend/src/main/java/com/duing/domain/club/api/ClubApi.java` | 수정 | `@RequestParam List<DayOfWeek> activeDays` 시그니처 + Swagger |
| `backend/src/main/java/com/duing/domain/club/controller/ClubController.java` | 수정 | List → Set 변환 후 `ClubSearchCondition` 으로 전달 |
| `backend/src/test/java/com/duing/domain/club/service/ClubSearchActiveDaysTest.java` | 신규 | Repository 레벨 OR 매칭 / NULL 제외 / 빈 문자열 방어 |
| `backend/src/test/java/com/duing/domain/club/controller/ClubSearchActiveDaysControllerTest.java` | 신규 | E2E (RestAssured) — 단일/다중/중복/잘못된 enum/7개/AND 결합 |
| 기존 호출 사이트 | 수정 | `new ClubSearchCondition(...)` 컴포넌트 추가에 따른 시그니처 갱신 |

### Frontend — PR 2 (`feat/clubs-active-days-filter-ui`, BE 머지 후)

| 파일 | 종류 | 책임 |
|---|---|---|
| `frontend/apps/web/app/clubs/_lib/activeDaysLabel.ts` | 신규 (이동) | `[clubId]/_lib/activeDaysLabel.ts` 의 내용을 한 단계 상위로 승격 |
| `frontend/apps/web/app/clubs/[clubId]/_lib/activeDaysLabel.ts` | 삭제 | 위로 이동 |
| `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailStats.tsx` | 수정 | import 경로 갱신 |
| `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailActivity.tsx` | 수정 | import 경로 갱신 |
| `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx` | 수정 | import 경로 갱신 |
| `frontend/apps/web/test/clubs/active-days-label.test.ts` | 수정 | import 경로 갱신 |
| `frontend/apps/web/test/clubs/club-detail-tabs.test.tsx` | 수정 (필요 시) | import 경로 갱신 |
| `frontend/packages/types/src/club.ts` | 수정 | `ClubSearchParams.activeDays?: ClubDayOfWeek[]` |
| `frontend/packages/api/src/client.ts` | 수정 | `clubs.list(...)` searchParams 빌더에 `activeDays.forEach(append)` |
| `frontend/apps/web/app/clubs/_lib/exploreParams.ts` | 수정 | `ExploreParams.activeDays` 필드 + parse/serialize/toApiParams 확장 |
| `frontend/apps/web/test/clubs/explore-params.test.ts` | 수정 | activeDays 라운드트립·정규화 케이스 |
| `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx` | 수정 | 토글 핸들러·active 상태·안내문 삭제·액티브 칩 |

---

## 사전 점검 (Both PRs)

- [ ] **Step 0-1: 작업 브랜치 확인**

`develop` 에서 분기된 브랜치 위에서 작업하는지 확인.

```bash
git rev-parse --abbrev-ref HEAD
git log --oneline -1
```

PR 1 작업이면 `feat/{이슈}-clubs-active-days-filter-api`, PR 2 작업이면 `feat/{이슈}-clubs-active-days-filter-ui`. Docker 가 떠 있어야 백엔드 통합 테스트가 동작한다.

---

# PR 1 — Backend

## Task 1: `array_overlap_csv` HQL 패턴 등록

**Files:**
- Modify: `backend/src/main/java/com/duing/global/config/PostgresFunctionContributor.java`

- [ ] **Step 1-1: 현재 파일 내용 확인**

`PostgresFunctionContributor.java` 를 읽고 기존 `array_overlap_text` 등록부 위치를 확인.

- [ ] **Step 1-2: `array_overlap_csv` 등록 추가**

`array_overlap_text` 등록 바로 아래에 한 블록 더 추가.

```java
        functionContributions.getFunctionRegistry().registerPattern(
                "array_overlap_csv",
                "(string_to_array(nullif(?1, ''), ',') && string_to_array(?2, ','))",
                booleanType
        );
```

`nullif(?1, '')` 로 빈 문자열 레거시 데이터 방어 (`string_to_array('', ',')` 가 `{""}` 한 원소 배열을 반환하는 문제 회피).

Javadoc 도 갱신:

```java
/**
 * PostgreSQL 전용 배열 함수를 Hibernate HQL 에 등록한다.
 * <p>
 * {@code array_overlap_text(arr, csv)} 는 {@code (arr && string_to_array(csv, ','))} 로
 * 펼쳐져, text[] 컬럼이 콤마로 join 된 검색 문자열과 한 원소라도 겹치는지 검사한다.
 * <p>
 * {@code array_overlap_csv(csv1, csv2)} 는 {@code (string_to_array(nullif(csv1, ''), ',') && string_to_array(csv2, ','))} 로
 * 펼쳐져, CSV TEXT 컬럼끼리 한 원소라도 겹치는지 검사한다. 빈 문자열은 NULL 로 정규화.
 * HQL 이 {@code ARRAY[...]} literal 을 파싱하지 못해 일반 문자열을 받는 형태로 우회한다.
 * <p>
 * 호출 예: {@code function('array_overlap_text', club.tags, '축구,러닝')}
 * 호출 예: {@code function('array_overlap_csv', club.activeDays, 'MONDAY,WEDNESDAY')}
 */
```

- [ ] **Step 1-3: 컴파일 확인**

```bash
cd backend && ./gradlew compileJava
```

Expected: BUILD SUCCESSFUL

- [ ] **Step 1-4: 커밋**

```bash
git add backend/src/main/java/com/duing/global/config/PostgresFunctionContributor.java
git commit -m "feat(backend): array_overlap_csv HQL 패턴 추가 — CSV TEXT 컬럼 OR 매칭용"
```

---

## Task 2: `ClubSearchCondition` 에 `activeDays` 필드 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java`
- Modify (호출 사이트 sweep): `backend/src/main/java/com/duing/domain/club/controller/ClubController.java`, 기존 테스트 파일들

- [ ] **Step 2-1: 새 record 시그니처로 변경**

`ClubSearchCondition.java` 전체 교체:

```java
package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.user.entity.College;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;

public record ClubSearchCondition(
        ClubCategory category,
        String division,
        String keyword,
        List<String> tags,
        Boolean recruiting,
        RecruitmentStatusFilter recruitmentStatus,
        Boolean centralClub,
        College college,
        Set<DayOfWeek> activeDays,
        ClubSortOption sortOption
) {
    public boolean hasTags() {
        return tags != null && !tags.isEmpty();
    }

    public boolean recruitingOnly() {
        return Boolean.TRUE.equals(recruiting);
    }

    /** 미지정이면 RECENT 로 폴백. */
    public ClubSortOption sortOptionOrDefault() {
        return sortOption == null ? ClubSortOption.RECENT : sortOption;
    }

    /**
     * recruitmentStatus 미지정 + 구 recruiting=true 만 들어왔을 때 AVAILABLE 로 보정한다.
     * recruitmentStatus 가 지정되어 있으면 recruiting 은 무시한다.
     *
     * <p>recruiting=false 는 의도적으로 매핑하지 않는다 (no-op = 전체).
     * 구 UI 에서 "모집 마감" 필터가 recruiting=false 를 전송했지만, 신규 클라이언트는
     * 명시적으로 {@code recruitmentStatus=CLOSED} 를 사용해야 한다.
     */
    public RecruitmentStatusFilter effectiveRecruitmentStatus() {
        if (recruitmentStatus != null) {
            return recruitmentStatus;
        }
        if (Boolean.TRUE.equals(recruiting)) {
            return RecruitmentStatusFilter.AVAILABLE;
        }
        return null;
    }

    /**
     * 활동요일 필터의 정규화된 값.
     * - null / 빈 Set / 7개 전체 → null (필터 미적용)
     * - 그 외 → 입력 Set 그대로
     */
    public Set<DayOfWeek> effectiveActiveDays() {
        if (activeDays == null || activeDays.isEmpty() || activeDays.size() == 7) {
            return null;
        }
        return activeDays;
    }
}
```

- [ ] **Step 2-2: 컴파일 → 깨진 호출 사이트 식별**

```bash
cd backend && ./gradlew compileJava compileTestJava 2>&1 | tee /tmp/compile-errors.txt
```

Expected: `new ClubSearchCondition(...)` 호출하는 모든 곳에서 컴파일 에러. `/tmp/compile-errors.txt` 에 파일 목록 확인.

- [ ] **Step 2-3: `ClubController.getClubs` 갱신**

`backend/src/main/java/com/duing/domain/club/controller/ClubController.java:36-54` 의 `getClubs` 메서드.

```java
    @Override
    public ResponseEntity<ApiResponse<PageResponse<ClubSummaryResponse>>> getClubs(
            @RequestParam(required = false) ClubCategory category,
            @RequestParam(required = false) String division,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) List<String> tags,
            @RequestParam(required = false) Boolean recruiting,
            @RequestParam(required = false) RecruitmentStatusFilter recruitmentStatus,
            @RequestParam(required = false) Boolean centralClub,
            @RequestParam(required = false) College college,
            @RequestParam(required = false) List<DayOfWeek> activeDays,
            @RequestParam(required = false) ClubSortOption sort,
            Pageable pageable
    ) {
        Set<DayOfWeek> activeDaysSet = activeDays == null ? null : Set.copyOf(activeDays);
        ClubSearchCondition condition = new ClubSearchCondition(
                category, division, keyword, tags, recruiting, recruitmentStatus,
                centralClub, college, activeDaysSet, sort);
        Page<ClubSummaryResponse> page = clubService.search(condition, pageable)
                .map(ClubSummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }
```

import 추가:

```java
import java.time.DayOfWeek;
import java.util.Set;
```

- [ ] **Step 2-4: 다른 호출 사이트 일괄 수정**

`/tmp/compile-errors.txt` 의 나머지 호출 사이트마다 `null` 인자를 9번째 자리 (College 와 sort 사이) 에 추가.

특히 주의:
- `ClubSearchTagsRecruitingTest.java:45` — `new ClubSearchCondition(null, null, null, List.of("축구"), null, null, null, null, null)` → 마지막에서 두 번째에 `null` 추가
- `ClubSearchTagsRecruitingTest.java:66` — 동일하게 9번째 자리에 `null` 추가
- 기타 컴파일 에러로 보고된 파일 모두 동일 패턴

각 파일을 열어 `new ClubSearchCondition(` 부분만 수정.

- [ ] **Step 2-5: 컴파일 통과 확인**

```bash
cd backend && ./gradlew compileJava compileTestJava
```

Expected: BUILD SUCCESSFUL

- [ ] **Step 2-6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java \
        backend/src/main/java/com/duing/domain/club/controller/ClubController.java \
        backend/src/test/
git commit -m "feat(backend): ClubSearchCondition 에 activeDays 필드 + effectiveActiveDays 헬퍼 추가"
```

---

## Task 3: Repository 레벨 OR 매칭 테스트 (TDD - Red)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/service/ClubSearchActiveDaysTest.java`

- [ ] **Step 3-1: 실패 테스트 작성**

다음 내용으로 신규 파일 생성:

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import java.lang.reflect.Field;
import java.time.DayOfWeek;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class ClubSearchActiveDaysTest {

    @Autowired ClubRepository clubRepository;

    @Test
    @DisplayName("activeDays 단일 요일 — 해당 요일이 포함된 동아리만 반환된다")
    void singleDayMatchesContainingClubs() throws Exception {
        saveActiveClub("월수금테스트", "MONDAY,WEDNESDAY,FRIDAY");
        saveActiveClub("화목테스트", "TUESDAY,THURSDAY");

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "테스트", null, null, null, null, null,
                        Set.of(DayOfWeek.MONDAY), null),
                PageRequest.of(0, 50));

        assertThat(page.getContent())
                .extracting(Club::getName)
                .contains("월수금테스트")
                .doesNotContain("화목테스트");
    }

    @Test
    @DisplayName("activeDays 다중 요일 — OR 매칭. 둘 다 포함 동아리도 1번만 반환된다")
    void multipleDaysApplyOrSemantic() throws Exception {
        saveActiveClub("월수금ORTEST", "MONDAY,WEDNESDAY,FRIDAY");
        saveActiveClub("월ORTEST", "MONDAY");
        saveActiveClub("수ORTEST", "WEDNESDAY");
        saveActiveClub("화목ORTEST", "TUESDAY,THURSDAY");

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "ORTEST", null, null, null, null, null,
                        Set.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY), null),
                PageRequest.of(0, 50));

        assertThat(page.getContent())
                .extracting(Club::getName)
                .contains("월수금ORTEST", "월ORTEST", "수ORTEST")
                .doesNotContain("화목ORTEST");
        // 월·수 둘 다 포함하는 "월수금ORTEST" 가 1번만 등장하는지 (중복 없음)
        assertThat(page.getContent().stream()
                .map(Club::getName)
                .filter("월수금ORTEST"::equals)
                .count()).isEqualTo(1);
    }

    @Test
    @DisplayName("active_days 가 NULL 인 동아리는 활동요일 필터 적용 시 결과에서 제외된다")
    void nullActiveDaysExcludedWhenFiltered() throws Exception {
        saveActiveClub("월요일NULLTEST", "MONDAY");
        saveActiveClub("미설정NULLTEST", null);

        var filtered = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "NULLTEST", null, null, null, null, null,
                        Set.of(DayOfWeek.MONDAY), null),
                PageRequest.of(0, 50));

        assertThat(filtered.getContent())
                .extracting(Club::getName)
                .contains("월요일NULLTEST")
                .doesNotContain("미설정NULLTEST");

        // 필터 미적용 시는 둘 다 포함
        var unfiltered = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "NULLTEST", null, null, null, null, null,
                        null, null),
                PageRequest.of(0, 50));

        assertThat(unfiltered.getContent())
                .extracting(Club::getName)
                .contains("월요일NULLTEST", "미설정NULLTEST");
    }

    @Test
    @DisplayName("active_days 가 빈 문자열인 레거시 동아리는 활동요일 필터 적용 시 제외된다")
    void emptyStringActiveDaysExcludedWhenFiltered() throws Exception {
        saveActiveClub("월요일EMPTYTEST", "MONDAY");
        saveActiveClub("빈문자열EMPTYTEST", "");

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "EMPTYTEST", null, null, null, null, null,
                        Set.of(DayOfWeek.MONDAY), null),
                PageRequest.of(0, 50));

        assertThat(page.getContent())
                .extracting(Club::getName)
                .contains("월요일EMPTYTEST")
                .doesNotContain("빈문자열EMPTYTEST");
    }

    @Test
    @DisplayName("activeDays 가 7개 전체이면 effectiveActiveDays 가 null 로 정규화되어 미적용과 동일하다")
    void sevenDaysNormalizedToNoFilter() throws Exception {
        saveActiveClub("월요일SEVENTEST", "MONDAY");
        saveActiveClub("미설정SEVENTEST", null);

        Set<DayOfWeek> allSeven = Set.of(
                DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
                DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY);

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "SEVENTEST", null, null, null, null, null,
                        allSeven, null),
                PageRequest.of(0, 50));

        assertThat(page.getContent())
                .extracting(Club::getName)
                .contains("월요일SEVENTEST", "미설정SEVENTEST");
    }

    /** keyword 필터로 본 테스트 데이터만 격리 — V12 시드 / 운영 데이터 영향 회피. */
    private Club saveActiveClub(String name, String activeDaysCsv) throws Exception {
        Club created = Club.create(name, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);

        Field activeDaysField = Club.class.getDeclaredField("activeDays");
        activeDaysField.setAccessible(true);
        activeDaysField.set(created, activeDaysCsv);

        return clubRepository.save(created);
    }
}
```

- [ ] **Step 3-2: 테스트 실행 → 실패 확인**

```bash
cd backend && ./gradlew test --tests "ClubSearchActiveDaysTest" -i
```

Expected: 모든 테스트 FAIL. 단일 요일 필터링이 적용되지 않아 "화목테스트" 도 결과에 포함된 채 반환되어 `doesNotContain` 이 실패.

---

## Task 4: `ClubRepositoryImpl` 에 `activeDaysOverlap` predicate 추가 (TDD - Green)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java`

- [ ] **Step 4-1: import 추가**

파일 상단 import 블록에 추가:

```java
import java.time.DayOfWeek;
import java.util.Set;
import java.util.stream.Collectors;
```

- [ ] **Step 4-2: `activeDaysOverlap` 메서드 추가**

`tagsOverlap(...)` 메서드 (라인 155-168 부근) 바로 아래에 추가:

```java
    private BooleanExpression activeDaysOverlap(Set<DayOfWeek> days) {
        if (days == null) return null;
        String csv = days.stream()
                .map(DayOfWeek::name)
                .collect(Collectors.joining(","));
        // active_days 는 CSV TEXT. array_overlap_csv 가 양쪽을 string_to_array 로 펼쳐
        // PostgreSQL && 로 한 원소라도 겹치는지 검사한다. 빈 문자열은 nullif 로 NULL 처리.
        return Expressions.booleanTemplate(
                "function('array_overlap_csv', {0}, {1}) = true",
                club.activeDays,
                csv
        );
    }
```

- [ ] **Step 4-3: `findByCondition` 의 predicates 배열에 합류**

`findByCondition(...)` 의 `BooleanExpression[] predicates = { ... }` 배열 (라인 46-55) 마지막에 항목 추가:

```java
        BooleanExpression[] predicates = {
                club.status.eq(ClubStatus.ACTIVE),
                categoryEq(condition.category()),
                divisionEq(condition.division()),
                keywordContains(condition.keyword()),
                tagsOverlap(condition.tags()),
                recruitmentStatusFilter(effectiveStatus),
                centralClubEq(condition.centralClub()),
                collegeEq(condition.college()),
                activeDaysOverlap(condition.effectiveActiveDays()),
        };
```

- [ ] **Step 4-4: 테스트 재실행 → 성공 확인**

```bash
cd backend && ./gradlew test --tests "ClubSearchActiveDaysTest" -i
```

Expected: 5개 테스트 모두 PASS.

- [ ] **Step 4-5: 기존 테스트 회귀 확인**

```bash
cd backend && ./gradlew test --tests "ClubSearch*"
```

Expected: `ClubSearchTagsRecruitingTest`, `ClubSearchRecruitmentStatusTest`, `ClubSearchSortTest`, `ClubSearchStatusFilterTest`, `ClubSearchActiveDaysTest` 모두 PASS.

- [ ] **Step 4-6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java \
        backend/src/test/java/com/duing/domain/club/service/ClubSearchActiveDaysTest.java
git commit -m "feat(backend): ClubRepository 에 activeDays OR 매칭 predicate 추가"
```

---

## Task 5: `ClubApi` 시그니처 + Swagger 문서 갱신

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java`

- [ ] **Step 5-1: import 추가**

```java
import java.time.DayOfWeek;
```

- [ ] **Step 5-2: `getClubs` 시그니처 수정**

기존 `getClubs(...)` (라인 33-46) 의 `College college,` 다음 줄에 새 파라미터 추가:

```java
            @Parameter(description = "활동요일 다중 (OR 매칭). 선택 요일 중 하나라도 포함하면 매칭. 미지정/전체 선택 시 필터 미적용.")
            @RequestParam(required = false) List<DayOfWeek> activeDays,
```

이 줄이 `@RequestParam ClubSortOption sort` 줄 바로 위로 들어감.

- [ ] **Step 5-3: 컴파일 확인**

```bash
cd backend && ./gradlew compileJava
```

Expected: BUILD SUCCESSFUL. `ClubController` 가 이미 동일 시그니처라 정상.

- [ ] **Step 5-4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/api/ClubApi.java
git commit -m "feat(backend): ClubApi 에 activeDays 쿼리 파라미터 Swagger 문서 추가"
```

---

## Task 6: E2E Controller 테스트 (RestAssured)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/controller/ClubSearchActiveDaysControllerTest.java`

- [ ] **Step 6-1: 실패 테스트 작성**

신규 파일 작성:

```java
package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ClubSearchActiveDaysControllerTest {

    @LocalServerPort int port;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() { RestAssured.port = port; }

    @Test
    @DisplayName("단일 요일 — ?activeDays=MONDAY 는 월요일 활동 동아리만 반환한다")
    void singleDayFilterReturnsMatchingClubsOnly() throws Exception {
        Club monClub = saveActiveClub("activeDaysSingleMon", "MONDAY,FRIDAY");
        Club tueClub = saveActiveClub("activeDaysSingleTue", "TUESDAY");

        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MONDAY&keyword=activeDaysSingle&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(monClub.getName()))
                .body("data.content.name", not(hasItem(tueClub.getName())));
    }

    @Test
    @DisplayName("다중 요일 OR — ?activeDays=MONDAY&activeDays=WEDNESDAY 는 월 또는 수 활동 동아리를 반환한다")
    void multipleDaysFilterReturnsOrUnion() throws Exception {
        Club bothClub = saveActiveClub("activeDaysOrBoth", "MONDAY,WEDNESDAY");
        Club monOnly = saveActiveClub("activeDaysOrMon", "MONDAY");
        Club wedOnly = saveActiveClub("activeDaysOrWed", "WEDNESDAY");
        Club neither = saveActiveClub("activeDaysOrNeither", "TUESDAY,THURSDAY");

        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MONDAY&activeDays=WEDNESDAY&keyword=activeDaysOr&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(bothClub.getName()))
                .body("data.content.name", hasItem(monOnly.getName()))
                .body("data.content.name", hasItem(wedOnly.getName()))
                .body("data.content.name", not(hasItem(neither.getName())));
    }

    @Test
    @DisplayName("중복 파라미터 — ?activeDays=MONDAY&activeDays=MONDAY 는 단일 ?activeDays=MONDAY 와 동일하다")
    void duplicateParamsBehaveLikeSingle() throws Exception {
        Club monClub = saveActiveClub("activeDaysDupMon", "MONDAY");
        Club tueClub = saveActiveClub("activeDaysDupTue", "TUESDAY");

        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MONDAY&activeDays=MONDAY&keyword=activeDaysDup&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(monClub.getName()))
                .body("data.content.name", not(hasItem(tueClub.getName())))
                .body("data.totalElements", equalTo(1));
    }

    @Test
    @DisplayName("active_days NULL 동아리 — 필터 적용 시 제외된다")
    void nullActiveDaysExcludedFromFilteredResults() throws Exception {
        Club monClub = saveActiveClub("activeDaysNullMon", "MONDAY");
        Club nullClub = saveActiveClub("activeDaysNullMiss", null);

        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MONDAY&keyword=activeDaysNull&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(monClub.getName()))
                .body("data.content.name", not(hasItem(nullClub.getName())));
    }

    @Test
    @DisplayName("잘못된 enum 값 — ?activeDays=MOONDAY 는 400 으로 응답한다")
    void invalidEnumReturnsBadRequest() {
        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MOONDAY")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("7개 전체 선택 — 미적용과 동일 결과셋 (NULL 동아리 포함)")
    void sevenDaysSelectedBehavesLikeNoFilter() throws Exception {
        Club monClub = saveActiveClub("activeDaysAllMon", "MONDAY");
        Club nullClub = saveActiveClub("activeDaysAllMiss", null);

        RestAssured.given()
                .when().get("/api/v1/clubs"
                        + "?activeDays=MONDAY&activeDays=TUESDAY&activeDays=WEDNESDAY"
                        + "&activeDays=THURSDAY&activeDays=FRIDAY&activeDays=SATURDAY&activeDays=SUNDAY"
                        + "&keyword=activeDaysAll&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(monClub.getName()))
                .body("data.content.name", hasItem(nullClub.getName()));
    }

    @Test
    @DisplayName("다른 필터와 AND 결합 — category=SPORTS & activeDays=MONDAY 는 두 조건 모두 만족하는 동아리만")
    void combinesWithOtherFiltersAsAnd() throws Exception {
        Club sportsMon = saveActiveSportsClub("activeDaysAndSportsMon", "MONDAY");
        Club sportsTue = saveActiveSportsClub("activeDaysAndSportsTue", "TUESDAY");
        Club academicMon = saveActiveClub("activeDaysAndAcademicMon", "MONDAY");

        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MONDAY&category=SPORTS&keyword=activeDaysAnd&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(sportsMon.getName()))
                .body("data.content.name", not(hasItem(sportsTue.getName())))
                .body("data.content.name", not(hasItem(academicMon.getName())));
    }

    private Club saveActiveClub(String name, String activeDaysCsv) throws Exception {
        return saveActiveClub(name, ClubCategory.ACADEMIC, activeDaysCsv);
    }

    private Club saveActiveSportsClub(String name, String activeDaysCsv) throws Exception {
        return saveActiveClub(name, ClubCategory.SPORTS, activeDaysCsv);
    }

    private Club saveActiveClub(String name, ClubCategory category, String activeDaysCsv) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, category, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);

        Field activeDaysField = Club.class.getDeclaredField("activeDays");
        activeDaysField.setAccessible(true);
        activeDaysField.set(created, activeDaysCsv);

        return clubRepository.save(created);
    }
}
```

- [ ] **Step 6-2: 테스트 실행 → 성공 확인**

```bash
cd backend && ./gradlew test --tests "ClubSearchActiveDaysControllerTest" -i
```

Expected: 7개 테스트 모두 PASS.

- [ ] **Step 6-3: 전체 테스트 회귀 확인**

```bash
cd backend && ./gradlew test
```

Expected: BUILD SUCCESSFUL. 기존 테스트 깨짐 없음.

- [ ] **Step 6-4: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/club/controller/ClubSearchActiveDaysControllerTest.java
git commit -m "test(backend): activeDays 필터 E2E 테스트 추가 — 단일/다중 OR/중복/NULL/잘못된 enum/7개/AND 결합"
```

---

## Task 7: 백엔드 PR 푸시 & PR 생성

- [ ] **Step 7-1: 푸시**

```bash
git push -u origin HEAD
```

- [ ] **Step 7-2: PR 생성**

```bash
gh pr create --base develop --title "feat(backend): /clubs 활동요일 필터 추가" --body "$(cat <<'EOF'
## 🚀 작업 내용
`/clubs` 탐색 API 에 활동요일 필터를 추가했다. `?activeDays=MONDAY&activeDays=WEDNESDAY` 처럼 반복 쿼리 파라미터로 다중 요일을 받아 OR 매칭한다. 학생이 가능한 요일을 늘릴수록 결과가 줄어드는 직관 반대 현상이 없도록 OR 의미론을 택했고, 기존 `tags` 필터와 같은 동작이다.

CSV TEXT 컬럼(`active_days`) 을 PostgreSQL 배열 연산자로 다루기 위해 `array_overlap_csv` HQL 패턴 1개를 신규 등록했다. 기존 `array_overlap_text` 와 시그니처가 대칭이고, 빈 문자열 레거시 데이터는 `nullif` 로 NULL 정규화해 매칭에서 자연 탈락시킨다. 7개 전체 선택은 백엔드 `effectiveActiveDays()` 가 `null` 로 정규화해 필터 미적용과 동치로 만든다.

## 🤔 고민했던 내용
파라미터 직렬화 방식으로 CSV 단일(`?activeDays=A,B`) vs 반복(`?activeDays=A&activeDays=B`) 을 비교했는데 후자가 Spring `List<Enum>` 기본 바인딩과 맞물려 컨버터 없이 동작하고, 코드베이스의 기존 `tags` 와 일관된다. 저장 구조는 그대로 CSV TEXT 를 유지했다 — native `text[]` 마이그레이션은 의미상 정당하지만 본 변경 범위를 넘어서고, 동작 가능한 인터페이스를 먼저 깔고 추후 정리할 수 있다.

`active_days` 가 NULL 인 동아리는 필터 적용 시 제외하는 게 의미 일관성에 맞다고 봤다 (미설정 ≠ 모든 요일 매칭). NULL 동아리도 매칭 후보로 넣고 싶었다면 별도 정책 결정이 필요한데, 현재는 활동요일 미설정 동아리가 검색 결과로 노출되는 게 학생 입장에서 더 혼란스럽다.

## 💬 리뷰 중점사항
- `array_overlap_csv` HQL 패턴의 `nullif(?1, '')` 처리가 빈 문자열 레거시 데이터를 의도대로 제외하는지
- `ClubSearchCondition.effectiveActiveDays()` 정규화 규칙 (0개·null·7개 → null) 이 다른 `effective*` 헬퍼들과 일관된 톤인지
- E2E 테스트의 7개 케이스 (단일/다중 OR/중복/NULL/잘못된 enum/7개/AND 결합) 가 의미론을 충분히 잠그는지
EOF
)"
```

---

# PR 2 — Frontend (BE 머지 후 시작)

## Task 8: `activeDaysLabel.ts` 를 `_lib/` 로 승격 이동

**Files:**
- Create: `frontend/apps/web/app/clubs/_lib/activeDaysLabel.ts`
- Delete: `frontend/apps/web/app/clubs/[clubId]/_lib/activeDaysLabel.ts`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailStats.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailActivity.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx`
- Modify: `frontend/apps/web/test/clubs/active-days-label.test.ts`

- [ ] **Step 8-1: 파일 이동**

```bash
cd frontend/apps/web
git mv app/clubs/[clubId]/_lib/activeDaysLabel.ts app/clubs/_lib/activeDaysLabel.ts
```

- [ ] **Step 8-2: import 경로 갱신 — 의존 파일 식별**

```bash
cd frontend && grep -rln "from.*\[clubId\]/_lib/activeDaysLabel\|from.*clubs/\[clubId\]/_lib/activeDaysLabel" apps/web --include="*.ts" --include="*.tsx"
```

Expected: 다음 파일 목록 (없으면 다른 호출자 추가 확인):
- `app/clubs/[clubId]/_components/ClubDetailStats.tsx`
- `app/clubs/[clubId]/_components/ClubDetailActivity.tsx`
- `app/clubs/[clubId]/_components/ClubDetailTabs.tsx`
- `test/clubs/active-days-label.test.ts`
- (옵션) `test/clubs/club-detail-tabs.test.tsx`

- [ ] **Step 8-3: 각 파일의 import 경로 수정**

`ClubDetailStats.tsx`, `ClubDetailActivity.tsx`, `ClubDetailTabs.tsx` 는 `_lib/activeDaysLabel` 상대 import 가 한 단계 더 올라간 형태로 바뀐다. 각 파일에서:

```ts
// before
import { activityScheduleLabel } from '../_lib/activeDaysLabel';
// after
import { activityScheduleLabel } from '../../_lib/activeDaysLabel';
```

(다른 export `dayLabel` 도 마찬가지)

`test/clubs/active-days-label.test.ts:6`:

```ts
// before
import { activityScheduleLabel, dayLabel } from '../../app/clubs/[clubId]/_lib/activeDaysLabel';
// after
import { activityScheduleLabel, dayLabel } from '../../app/clubs/_lib/activeDaysLabel';
```

다른 테스트도 같은 패턴으로.

- [ ] **Step 8-4: typecheck / 테스트 실행**

```bash
cd frontend && pnpm -F web typecheck && pnpm -F web test --run
```

Expected: 모든 typecheck PASS, 기존 `active-days-label` 테스트 7개 + 기타 테스트 모두 PASS.

- [ ] **Step 8-5: 커밋**

```bash
git add frontend/apps/web/app/clubs/_lib/activeDaysLabel.ts \
        frontend/apps/web/app/clubs/[clubId]/_lib \
        frontend/apps/web/app/clubs/[clubId]/_components \
        frontend/apps/web/test/clubs
git commit -m "refactor(frontend): activeDaysLabel 을 /clubs/_lib 으로 승격 — 탐색·상세 공통 사용"
```

---

## Task 9: `ClubSearchParams.activeDays` + API 클라이언트 직렬화

**Files:**
- Modify: `frontend/packages/types/src/club.ts`
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 9-1: 타입 필드 추가**

`frontend/packages/types/src/club.ts:94-106` 의 `ClubSearchParams` 타입에 한 줄 추가:

```ts
export type ClubSearchParams = {
  category?: ClubCategory;
  division?: string;
  keyword?: string;
  tags?: string[];
  recruiting?: boolean;                                              // deprecated
  recruitmentStatus?: 'AVAILABLE' | 'UPCOMING' | 'CLOSED';
  centralClub?: boolean;
  college?: College;
  activeDays?: ClubDayOfWeek[];
  page?: number;
  size?: number;
  sort?: string;
};
```

- [ ] **Step 9-2: API 클라이언트 직렬화 위치 확인**

`frontend/packages/api/src/client.ts` 에서 `clubs.list(...)` 의 searchParams 빌드 위치를 찾는다.

```bash
cd frontend && grep -n "clubs.*list\|category.*append\|recruitmentStatus.*append" packages/api/src/client.ts | head -10
```

`list:` 메서드 내부 또는 공용 `appendSearchParam` 헬퍼 위치 확인 후 다음 단계로.

- [ ] **Step 9-3: searchParams 빌더에 `activeDays` 직렬화 추가**

기존 패턴이 단일 객체 `searchParams` 옵션을 ky 에 직접 넘기는 경우 (line 764-768 의 generic helper 참고), 헬퍼가 배열을 자동으로 반복 직렬화한다면 그대로 동작한다. 그렇지 않으면 명시적으로:

```ts
// clubs.list(...) 내부, 다른 필드 처리와 같은 위치
(params?.activeDays ?? []).forEach((day) => searchParams.append('activeDays', day));
```

타입 안전을 위해 `params` 가 정의되어 있어야 한다.

- [ ] **Step 9-4: typecheck**

```bash
cd frontend && pnpm -F @duing/api build && pnpm -F web typecheck
```

Expected: 둘 다 통과.

- [ ] **Step 9-5: 커밋**

```bash
git add frontend/packages/types/src/club.ts frontend/packages/api/src/client.ts
git commit -m "feat(frontend): ClubSearchParams.activeDays + API 클라이언트 반복 직렬화"
```

---

## Task 10: `exploreParams.ts` TDD — 라운드트립 / 정규화

**Files:**
- Modify: `frontend/apps/web/test/clubs/explore-params.test.ts`
- Modify: `frontend/apps/web/app/clubs/_lib/exploreParams.ts`

- [ ] **Step 10-1: 실패 테스트 추가**

`frontend/apps/web/test/clubs/explore-params.test.ts` 끝부분에 새 `describe` 블록 추가:

```ts
describe('exploreParams — activeDays 라운드 트립 및 정규화', () => {
  it('activeDays 값들이 URL 직렬화 후 같은 값으로 파싱된다', () => {
    const query = serializeExploreParams({
      ...DEFAULT_EXPLORE_PARAMS,
      activeDays: ['MONDAY', 'WEDNESDAY'],
    });
    const parsed = parseExploreParams(new URLSearchParams(query));
    expect(parsed.activeDays).toEqual(['MONDAY', 'WEDNESDAY']);
  });

  it('URL 의 잘못된 활동요일 값은 화이트리스트 필터링되어 무시된다', () => {
    const parsed = parseExploreParams(
      new URLSearchParams('activeDays=MONDAY&activeDays=BANANA'),
    );
    expect(parsed.activeDays).toEqual(['MONDAY']);
  });

  it('URL 에 activeDays 가 없으면 빈 배열로 파싱된다', () => {
    const parsed = parseExploreParams(new URLSearchParams(''));
    expect(parsed.activeDays).toEqual([]);
  });

  it('activeDays 빈 배열이면 toApiParams 에서 undefined', () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, activeDays: [] }, 20);
    expect(api.activeDays).toBeUndefined();
  });

  it('activeDays 7개 전체이면 toApiParams 에서 undefined (정규화)', () => {
    const api = toApiParams(
      {
        ...DEFAULT_EXPLORE_PARAMS,
        activeDays: [
          'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY',
          'FRIDAY', 'SATURDAY', 'SUNDAY',
        ],
      },
      20,
    );
    expect(api.activeDays).toBeUndefined();
  });

  it('activeDays 부분 선택은 toApiParams 에 그대로 전달된다', () => {
    const api = toApiParams(
      { ...DEFAULT_EXPLORE_PARAMS, activeDays: ['MONDAY', 'WEDNESDAY'] },
      20,
    );
    expect(api.activeDays).toEqual(['MONDAY', 'WEDNESDAY']);
  });
});
```

- [ ] **Step 10-2: 테스트 실행 → 실패 확인**

```bash
cd frontend && pnpm -F web test --run test/clubs/explore-params.test.ts
```

Expected: 새 `describe` 블록 6개 테스트 FAIL (속성 `activeDays` 미정의 또는 타입 에러).

- [ ] **Step 10-3: `exploreParams.ts` 갱신**

`frontend/apps/web/app/clubs/_lib/exploreParams.ts` 의 다음 부분들을 수정:

**(1) import 추가**

```ts
import type { ClubCategory, ClubDayOfWeek, ClubSearchParams, College } from '@duing/types';
```

**(2) `DAY_OF_WEEK` 화이트리스트 상수 추가 (파일 상단 상수 블록 부근)**

```ts
const DAY_OF_WEEK: readonly ClubDayOfWeek[] = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
];
const VALID_DAYS = new Set<string>(DAY_OF_WEEK);

function isClubDayOfWeek(value: string): value is ClubDayOfWeek {
  return VALID_DAYS.has(value);
}
```

**(3) `ExploreParams` 타입에 필드 추가**

```ts
export type ExploreParams = {
  scope: Scope;
  division: DivisionFilter;
  keyword: string;
  recruitment: RecruitmentFilter;
  college: College | null;
  category: ClubCategory | null;
  activeDays: ClubDayOfWeek[];
  sort: SortKey;
  page: number;
};
```

**(4) `DEFAULT_EXPLORE_PARAMS` 갱신**

```ts
export const DEFAULT_EXPLORE_PARAMS: ExploreParams = {
  scope: '전체',
  division: '전체',
  keyword: '',
  recruitment: 'all',
  college: null,
  category: null,
  activeDays: [],
  sort: 'RECENT',
  page: 1,
};
```

**(5) `parseExploreParams` 끝의 return 직전에 추가**

```ts
  const activeDays = search.getAll('activeDays').filter(isClubDayOfWeek);
```

return 객체에도 `activeDays` 포함:

```ts
  return { scope, division, keyword, recruitment, college, category, activeDays, sort, page };
```

**(6) `serializeExploreParams` 에 추가** (`if (params.page > 1) ...` 위)

```ts
  params.activeDays.forEach((day) => next.append('activeDays', day));
```

**(7) `toApiParams` 에 정규화 로직 추가** (return 객체에 필드 추가)

```ts
  const activeDays =
    params.activeDays.length === 0 || params.activeDays.length === 7
      ? undefined
      : params.activeDays;

  return {
    keyword: params.keyword || undefined,
    division: params.division !== '전체' ? params.division : undefined,
    recruitmentStatus,
    centralClub,
    college: params.college ?? undefined,
    category: params.category ?? undefined,
    activeDays,
    sort: params.sort,
    page: Math.max(0, params.page - 1),
    size: pageSize,
  };
```

- [ ] **Step 10-4: 테스트 실행 → 성공 확인**

```bash
cd frontend && pnpm -F web test --run test/clubs/explore-params.test.ts
```

Expected: 새 6개 + 기존 6개 모두 PASS.

- [ ] **Step 10-5: typecheck 회귀 확인**

```bash
cd frontend && pnpm -F web typecheck
```

Expected: PASS. `ClubExplorePage` 가 `params.activeDays` 를 아직 안 쓰지만 `DEFAULT_EXPLORE_PARAMS` 확장으로 컴파일은 통과.

- [ ] **Step 10-6: 커밋**

```bash
git add frontend/apps/web/app/clubs/_lib/exploreParams.ts \
        frontend/apps/web/test/clubs/explore-params.test.ts
git commit -m "feat(frontend): exploreParams 에 activeDays 라운드트립 + 7개 정규화"
```

---

## Task 11: `ClubExplorePage` 토글 UI 활성화

**Files:**
- Modify: `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx`

- [ ] **Step 11-1: import 추가**

상단 import 블록에:

```ts
import type { ClubDayOfWeek } from '@duing/types';

import { dayLabel } from '../_lib/activeDaysLabel';
```

ORDER 가 외부에 필요하면 `activeDaysLabel` 에서 export 안 되어 있을 수 있다. 정렬용 ORDER 가 필요하면 직접 인라인:

```ts
const DAY_ORDER: readonly ClubDayOfWeek[] = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
];
```

(혹은 `activeDaysLabel.ts` 에 `ORDER` 를 `export` 로 노출시키는 작은 수정 — 이쪽이 더 깔끔. Step 11-2 로 분리)

- [ ] **Step 11-2: `activeDaysLabel.ts` 의 `ORDER` export**

`frontend/apps/web/app/clubs/_lib/activeDaysLabel.ts:13` 의 `const ORDER` 앞에 `export` 추가:

```ts
export const ORDER: ClubDayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];
```

`ClubExplorePage.tsx` import 에 `ORDER` 추가:

```ts
import { dayLabel, ORDER as DAY_ORDER } from '../_lib/activeDaysLabel';
```

- [ ] **Step 11-3: 토글 핸들러 추가**

`ClubExplorePage` 함수 본문, 다른 `handle*` 핸들러들 (라인 107-130 부근) 옆에 추가:

```tsx
  const handleToggleActiveDay = (day: ClubDayOfWeek) => {
    const current = params.activeDays;
    const next = current.includes(day)
      ? current.filter((value) => value !== day)
      : [...current, day];
    updateParams({ activeDays: next, page: 1 });
  };
```

- [ ] **Step 11-4: 활동 요일 토글 UI 교체**

기존 라인 282-297 의 `<FilterGroup title="활동 요일">` 블록을 다음으로 교체:

```tsx
              <FilterGroup title="활동 요일">
                <div className="flex gap-1 flex-wrap">
                  {DAY_ORDER.map((day) => {
                    const on = params.activeDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleToggleActiveDay(day)}
                        className={`w-[30px] h-[30px] rounded-full text-[13px] font-semibold border ${on ? 'bg-ink text-white border-ink' : 'bg-paper text-charcoal-2 border-line'}`}
                      >
                        {dayLabel(day)}
                      </button>
                    );
                  })}
                </div>
              </FilterGroup>
```

기존의 `<p className="mt-2 text-[11px] text-charcoal-3">활동 요일 필터는 다음 업데이트에 추가될 예정입니다.</p>` 안내문은 제거.

- [ ] **Step 11-5: 액티브 필터 칩 추가**

기존 라인 351-405 부근의 액티브 필터 칩 블록에서, `params.activeDays.length > 0` 조건의 칩을 추가. `params.keyword && (...)` 칩 다음에 삽입:

```tsx
              {params.activeDays.length > 0 && params.activeDays.length < 7 && (
                <ActiveFilterChip
                  label={`요일: ${[...params.activeDays].sort((left, right) => DAY_ORDER.indexOf(left) - DAY_ORDER.indexOf(right)).map(dayLabel).join('·')}`}
                  variant="soft"
                  onRemove={() => updateParams({ activeDays: [], page: 1 })}
                />
              )}
```

또한 "필터:" 라벨이 나오는 조건문 (라인 352-357) 에 `params.activeDays.length > 0` 도 OR 로 추가:

```tsx
              {(params.scope !== '전체' ||
                params.division !== '전체' ||
                params.keyword !== '' ||
                params.recruitment !== 'all' ||
                params.college !== null ||
                params.category !== null ||
                (params.activeDays.length > 0 && params.activeDays.length < 7)) && (
                <span className="text-[13px] text-charcoal-3 pt-1.5">필터:</span>
              )}
```

- [ ] **Step 11-6: typecheck**

```bash
cd frontend && pnpm -F web typecheck
```

Expected: PASS.

- [ ] **Step 11-7: dev 서버로 수동 검증**

```bash
cd frontend && pnpm -F web dev
```

브라우저에서 `http://localhost:3000/clubs` 열고:

1. 활동요일 토글이 활성화되어 있고 (회색이 아닌) 클릭 가능한지
2. 월요일 클릭 → 검은 배경으로 active 표시, URL `?activeDays=MONDAY` 추가, 결과 갱신
3. 월·수 추가 클릭 → URL `?activeDays=MONDAY&activeDays=WEDNESDAY`, 활성 칩 `요일: 월·수` 노출
4. 7개 다 클릭 → URL 에서 `activeDays` 파라미터 자체 제거, 칩 사라짐, 결과는 전체와 동일
5. 칩 X 버튼 클릭 → 토글 모두 해제, URL 깨끗
6. 초기화 버튼 클릭 → 토글 모두 해제
7. URL 에 직접 `?activeDays=BANANA&activeDays=MONDAY` 입력 → 페이지 진입 시 MONDAY 만 active
8. 새로고침 시 활동요일 상태 보존

서버는 `Ctrl+C` 로 종료.

- [ ] **Step 11-8: 테스트 회귀 확인**

```bash
cd frontend && pnpm -F web test --run
```

Expected: 전체 테스트 PASS.

- [ ] **Step 11-9: 커밋**

```bash
git add frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx \
        frontend/apps/web/app/clubs/_lib/activeDaysLabel.ts
git commit -m "feat(frontend): /clubs 활동요일 필터 UI 활성화 — 토글·active state·필터 칩"
```

---

## Task 12: 프론트엔드 PR 푸시 & PR 생성

- [ ] **Step 12-1: 푸시**

```bash
git push -u origin HEAD
```

- [ ] **Step 12-2: PR 생성**

```bash
gh pr create --base develop --title "feat(frontend): /clubs 활동요일 필터 UI 활성화" --body "$(cat <<'EOF'
## 🚀 작업 내용
`/clubs` 탐색 페이지 좌측 필터 패널의 활동요일 토글을 활성화했다. 기존에는 "다음 업데이트에 추가될 예정입니다" 안내와 함께 disabled 였는데, 이번 라운드의 백엔드 PR 로 `activeDays` 쿼리 파라미터가 열리면서 실제 동작이 가능해졌다.

토글 7개는 `params.activeDays` 와 URL `?activeDays=MONDAY&activeDays=WEDNESDAY` 형태로 양방향 바인딩되고, 다중 선택 시 OR 매칭으로 결과를 좁힌다. 0개나 7개 전체 선택은 `toApiParams` 가 `undefined` 로 정규화해서 네트워크 호출에서 파라미터를 제거하고, 활성 필터 칩에서도 숨긴다. URL 의 잘못된 enum 값은 화이트리스트로 걸러낸다.

탐색 페이지와 상세 페이지가 같은 한글 라벨 매핑을 공유하므로 `[clubId]/_lib/activeDaysLabel.ts` 를 `_lib/` 한 단계 위로 승격시켰다.

## 🤔 고민했던 내용
정규화 책임을 프론트와 백 양쪽에 두는 게 처음엔 중복으로 보였지만, 기존 `effectiveRecruitmentStatus()` 가 같은 패턴이고 — 프론트는 URL/네트워크 최적화, 백엔드는 단일 진실 소스 — 둘의 목적이 다르다고 봤다. 0개와 7개를 묶어서 "필터 미적용" 으로 통일하면 칩 표시 로직과 URL 표현이 자연스럽게 정리된다.

`activeDaysLabel.ts` 위치는 두 라우트에서 같은 함수를 쓰므로 공유 라이브러리로 올렸다. CLAUDE.md 의 "두 곳 이상에서 쓰이면 상위로 승격" 규칙을 따른 것이다.

## 💬 리뷰 중점사항
- `exploreParams` 의 7개 정규화가 백엔드와 동일한 의미인지 (테스트로 검증 중)
- URL 직접 접근 / 새로고침 시 활동요일 상태 복원이 깨지지 않는지
- `activeDaysLabel.ts` 이동에 따른 import 갱신 누락이 없는지
EOF
)"
```

---

## Self-Review (작성 후 점검)

이 섹션은 plan 작성 직후 자체 검토 결과를 남긴 것이다. 실행 단계에서는 건너뛴다.

**1. Spec 커버리지:**
- §2 In scope 항목 전부 → Task 1~11 에 매핑 ✅
- §3 검색 의미론 (OR / 정규화 / NULL 제외) → Task 3, 4, 6 의 테스트 ✅
- §4 API 명세 (반복 파라미터·Swagger·잘못된 enum) → Task 5, 6 ✅
- §5 구현 파일 목록 전부 → Task 1, 2, 4, 5, 8, 9, 10, 11 ✅
- §6 테스트 케이스 (단일/다중/중복/0건/NULL/잘못된 enum/7개/AND 결합) → Task 6 의 7개 케이스 ✅
- §6 프론트 테스트 (라운드트립/잘못된 값/0개/7개) → Task 10 의 6개 케이스 ✅
- §7 deferred decisions → A1 확정 채택, 정규화 양쪽 책임 → Task 1, 2, 10 ✅
- §9 NULL · 빈 문자열 방어 → Task 1 의 `nullif`, Task 3 의 빈 문자열 테스트 ✅

**2. Placeholder 스캔:** "TBD", "implement later" 등 없음. 모든 코드 블록 실제 동작 코드 포함.

**3. 타입 일관성:**
- `activeDays` Java 타입: `List<DayOfWeek>` (Controller·Api) ↔ `Set<DayOfWeek>` (SearchCondition·Repository) — 변환 지점 Task 2 Step 2-3 에서 명시.
- `ClubDayOfWeek` TS 타입은 기존 `@duing/types` 에 존재 — 신규 정의 불필요.
- `array_overlap_csv` 함수명: Task 1, Task 4 일관.
- `effectiveActiveDays()` 메서드명: Task 2, Task 4, Task 6 일관.
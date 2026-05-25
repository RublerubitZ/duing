# PR-A (BE): /clubs 모집 정보 노출 + 모집 상태 필터 + 기본 정렬 재정의 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ClubSummaryResponse` 에 활성 모집 정보를 노출하고, `GET /api/v1/clubs` 에 `recruitmentStatus` 필터 파라미터를 추가하며, 기본 정렬(`RECENT`)을 "모집 상태 그룹 우선" 으로 재정의한다.

**Architecture:** ClubSearchCondition 에 `RecruitmentStatusFilter` 추가, ClubRepositoryImpl 에서 displayStatus 도출 CASE 식으로 필터·정렬, 서비스 계층에서 페이지 결과 club id 들을 RecruitmentRepository 의 batch lookup 으로 활성/최근마감 모집 1건씩 첨부.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / RestAssured + TestContainers

**Spec:** `docs/superpowers/specs/2026-05-25-clubs-recruitment-status-filter-design.md`

**브랜치:** `feat/club-summary-active-recruitment` (develop 에서 분기)

---

## File Structure

**Create:**
- `backend/src/main/java/com/duing/domain/club/service/dto/query/RecruitmentStatusFilter.java` — 필터 enum
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ActiveRecruitmentSummaryQuery.java` — 카드용 모집 요약 record (club_id 묶음 lookup 반환 타입)
- `backend/src/main/java/com/duing/domain/recruitment/repository/ClubActiveRecruitmentRow.java` — repository 반환 projection (clubId + 모집 필드)
- `backend/src/test/java/com/duing/domain/club/controller/ClubSearchRecruitmentStatusTest.java` — 새 필터·정렬·응답 통합 테스트

**Modify:**
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java` — `recruitmentStatus` 필드 추가 + 하위호환 헬퍼
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSummaryQuery.java` — `activeRecruitment` 필드 추가
- `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubSummaryResponse.java` — `activeRecruitment` 중첩 record 추가
- `backend/src/main/java/com/duing/domain/club/api/ClubApi.java` — `recruitmentStatus` 파라미터
- `backend/src/main/java/com/duing/domain/club/controller/ClubController.java` — 파라미터 전달
- `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryCustom.java` — (변경 없음, search 시그니처 동일)
- `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java` — 필터 + RECENT 정렬 재정의
- `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java` — page 결과에 활성모집 attach
- `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryCustom.java` — batch lookup 메서드 시그니처
- `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryImpl.java` — batch lookup 구현

---

### Task 1: RecruitmentStatusFilter enum 신설

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/query/RecruitmentStatusFilter.java`

- [ ] **Step 1: enum 작성**

```java
package com.duing.domain.club.service.dto.query;

/**
 * /clubs 목록 필터에서 사용자가 고르는 모집 상태 그룹.
 * RecruitmentDisplayStatus 와는 별도 (UI 옵션 묶음).
 */
public enum RecruitmentStatusFilter {
    /** OPEN ∨ ALWAYS_OPEN — 지금 지원 가능한 모집. */
    AVAILABLE,
    /** UPCOMING — 시작 전 모집. */
    UPCOMING,
    /** CLOSED — 활성 모집 없는 동아리는 제외, 과거 마감 이력만. */
    CLOSED
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `./gradlew :backend:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/service/dto/query/RecruitmentStatusFilter.java
git commit -m "feat(backend): RecruitmentStatusFilter enum 추가"
```

---

### Task 2: ClubSearchCondition 에 recruitmentStatus 필드 + 하위호환 헬퍼

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/ClubController.java` (생성자 호출 사이트 동기화)

- [ ] **Step 1: ClubSearchCondition 확장**

```java
package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.user.entity.College;
import java.util.List;

public record ClubSearchCondition(
        ClubCategory category,
        String division,
        String keyword,
        List<String> tags,
        Boolean recruiting,
        RecruitmentStatusFilter recruitmentStatus,
        Boolean centralClub,
        College college,
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
}
```

- [ ] **Step 2: ClubController 생성자 호출 동기화**

`ClubController.getClubs` 의 `new ClubSearchCondition(...)` 호출에서 `recruitmentStatus` 자리에 `null` 을 넣어 임시로 컴파일만 통과시킨다 (Task 7 에서 파라미터로 받음).

```java
ClubSearchCondition condition = new ClubSearchCondition(
        category, division, keyword, tags, recruiting, null, centralClub, college, sort);
```

- [ ] **Step 3: 컴파일 확인 + 기존 테스트 회귀 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.club.controller.ClubSearchControllerTest"`
Expected: 모두 PASS (필드 추가는 호환 가능, 신규 동작은 다음 태스크들에서 도입)

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java backend/src/main/java/com/duing/domain/club/controller/ClubController.java
git commit -m "feat(backend): ClubSearchCondition 에 recruitmentStatus 필드 추가"
```

---

### Task 3: ClubSummaryQuery + ClubSummaryResponse 에 activeRecruitment 노출

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSummaryQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubSummaryResponse.java`

- [ ] **Step 1: ClubSummaryQuery 확장 — activeRecruitment 필드 + withActiveRecruitment 헬퍼**

```java
package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.user.entity.College;
import java.time.LocalDate;
import java.util.List;

public record ClubSummaryQuery(
        Long id,
        String name,
        ClubCategory category,
        String division,
        College college,
        String logoUrl,
        ClubStatus status,
        List<String> tags,
        ActiveRecruitmentSummary activeRecruitment
) {
    public record ActiveRecruitmentSummary(
            Long recruitmentId,
            RecruitmentDisplayStatus displayStatus,
            LocalDate startDate,
            LocalDate endDate
    ) {}

    public static ClubSummaryQuery from(Club club) {
        return new ClubSummaryQuery(
                club.getId(),
                club.getName(),
                club.getCategory(),
                club.getDivision(),
                club.getCollege(),
                club.getLogoUrl(),
                club.getStatus(),
                club.getTags(),
                null
        );
    }

    public ClubSummaryQuery withActiveRecruitment(ActiveRecruitmentSummary recruitmentSummary) {
        return new ClubSummaryQuery(id, name, category, division, college, logoUrl, status, tags, recruitmentSummary);
    }
}
```

- [ ] **Step 2: ClubSummaryResponse 확장 — 중첩 response record + 매핑**

```java
package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.user.entity.College;
import java.time.LocalDate;
import java.util.List;

public record ClubSummaryResponse(
        Long id,
        String name,
        ClubCategory category,
        String division,
        College college,
        String logoUrl,
        ClubStatus status,
        List<String> tags,
        ActiveRecruitmentSummaryResponse activeRecruitment
) {
    public record ActiveRecruitmentSummaryResponse(
            Long recruitmentId,
            RecruitmentDisplayStatus displayStatus,
            LocalDate startDate,
            LocalDate endDate
    ) {
        public static ActiveRecruitmentSummaryResponse from(ClubSummaryQuery.ActiveRecruitmentSummary source) {
            return new ActiveRecruitmentSummaryResponse(
                    source.recruitmentId(),
                    source.displayStatus(),
                    source.startDate(),
                    source.endDate()
            );
        }
    }

    public static ClubSummaryResponse from(ClubSummaryQuery summaryQuery) {
        return new ClubSummaryResponse(
                summaryQuery.id(),
                summaryQuery.name(),
                summaryQuery.category(),
                summaryQuery.division(),
                summaryQuery.college(),
                summaryQuery.logoUrl(),
                summaryQuery.status(),
                summaryQuery.tags(),
                summaryQuery.activeRecruitment() == null
                        ? null
                        : ActiveRecruitmentSummaryResponse.from(summaryQuery.activeRecruitment())
        );
    }
}
```

- [ ] **Step 3: 컴파일 확인**

Run: `./gradlew :backend:compileJava :backend:compileTestJava`
Expected: BUILD SUCCESSFUL — `activeRecruitment` 가 null 인 상태로 기존 동작 유지.

- [ ] **Step 4: 기존 테스트 회귀 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.club.*"`
Expected: 모두 PASS. 신규 응답 필드는 null 로 직렬화.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSummaryQuery.java backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubSummaryResponse.java
git commit -m "feat(backend): ClubSummary 에 activeRecruitment 필드 추가"
```

---

### Task 4: RecruitmentRepository — 동아리 묶음별 대표 모집 1건 batch lookup

**Files:**
- Create: `backend/src/main/java/com/duing/domain/recruitment/repository/ClubActiveRecruitmentRow.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryCustom.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryImpl.java`
- Test: `backend/src/test/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryActiveLookupTest.java` (신규)

- [ ] **Step 1: Projection record 작성**

```java
// ClubActiveRecruitmentRow.java
package com.duing.domain.recruitment.repository;

import com.duing.domain.recruitment.entity.RecruitmentStatus;
import java.time.LocalDate;

/**
 * 동아리 id 묶음에 대한 대표 모집 1건 lookup row.
 * displayStatus 는 서비스 단에서 today 와 함께 계산한다.
 */
public record ClubActiveRecruitmentRow(
        Long clubId,
        Long recruitmentId,
        RecruitmentStatus status,
        LocalDate startDate,
        LocalDate endDate
) {}
```

- [ ] **Step 2: 실패 테스트 작성**

```java
// RecruitmentRepositoryActiveLookupTest.java
package com.duing.domain.recruitment.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class RecruitmentRepositoryActiveLookupTest {

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("활성 모집(OPEN 이며 endDate null 또는 미래)이 있으면 그 모집이 우선 반환된다")
    void activeRecruitmentTakesPrecedenceOverClosedHistory() throws Exception {
        Club clubA = saveActiveClub("lookupA");
        Recruitment closed = saveRecruitment(clubA, LocalDate.now().minusDays(30), LocalDate.now().minusDays(10));
        closed.close();
        recruitmentRepository.save(closed);
        Recruitment active = saveRecruitment(clubA, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7));

        Map<Long, ClubActiveRecruitmentRow> result = recruitmentRepository.findRepresentativeByClubIds(
                List.of(clubA.getId()), LocalDate.now());

        assertThat(result.get(clubA.getId()).recruitmentId()).isEqualTo(active.getId());
    }

    @Test
    @DisplayName("활성 모집이 없으면 가장 최근에 마감된 모집이 반환된다")
    void mostRecentlyClosedRecruitmentReturnedWhenNoActive() throws Exception {
        Club clubB = saveActiveClub("lookupB");
        Recruitment older = saveRecruitment(clubB, LocalDate.now().minusDays(60), LocalDate.now().minusDays(40));
        older.close();
        recruitmentRepository.save(older);
        Recruitment newer = saveRecruitment(clubB, LocalDate.now().minusDays(30), LocalDate.now().minusDays(5));
        newer.close();
        recruitmentRepository.save(newer);

        Map<Long, ClubActiveRecruitmentRow> result = recruitmentRepository.findRepresentativeByClubIds(
                List.of(clubB.getId()), LocalDate.now());

        assertThat(result.get(clubB.getId()).recruitmentId()).isEqualTo(newer.getId());
    }

    @Test
    @DisplayName("모집 이력이 없는 동아리는 결과 맵에 키가 없다")
    void clubWithoutRecruitmentIsAbsent() throws Exception {
        Club clubC = saveActiveClub("lookupC");

        Map<Long, ClubActiveRecruitmentRow> result = recruitmentRepository.findRepresentativeByClubIds(
                List.of(clubC.getId()), LocalDate.now());

        assertThat(result).doesNotContainKey(clubC.getId());
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    private Recruitment saveRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        Recruitment created = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        return recruitmentRepository.save(created);
    }
}
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.recruitment.repository.RecruitmentRepositoryActiveLookupTest"`
Expected: COMPILE FAIL (메서드 `findRepresentativeByClubIds` 미정의)

- [ ] **Step 4: RecruitmentRepositoryCustom 시그니처 추가**

`RecruitmentRepositoryCustom.java` 에 메서드 추가 (기존 인터페이스 본문 끝):

```java
import com.duing.domain.recruitment.repository.ClubActiveRecruitmentRow;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

// ... 기존 메서드들 ...

/**
 * 동아리 id 묶음에 대해 대표 모집을 1건씩 조회한다.
 *
 * <p>대표 선택 규칙:
 * <ol>
 *   <li>status=OPEN ∧ (endDate IS NULL ∨ endDate ≥ today) 인 모집이 있으면 그 중 createdAt 최신</li>
 *   <li>그렇지 않으면 endDate 가 가장 최근인 마감 모집 (endDate IS NULL 은 활성에 우선 매칭되므로 여기 도달하지 않음)</li>
 * </ol>
 *
 * @return key=clubId, value=대표 모집 row. 모집이 한 건도 없는 club id 는 키가 없다.
 */
Map<Long, ClubActiveRecruitmentRow> findRepresentativeByClubIds(List<Long> clubIds, LocalDate today);
```

- [ ] **Step 5: RecruitmentRepositoryImpl 구현 추가**

`RecruitmentRepositoryImpl` 에 메서드 추가:

```java
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import java.util.HashMap;
import java.util.Map;

@Override
public Map<Long, ClubActiveRecruitmentRow> findRepresentativeByClubIds(List<Long> clubIds, LocalDate today) {
    if (clubIds == null || clubIds.isEmpty()) {
        return Map.of();
    }

    // 우선순위 정렬용 priority 식:
    //   0 = isEffectivelyOpen (status=OPEN ∧ (endDate IS NULL ∨ endDate ≥ today))
    //   1 = 그 외 (CLOSED 또는 status=OPEN 인데 endDate 가 과거)
    com.querydsl.core.types.dsl.NumberExpression<Integer> priority = new com.querydsl.core.types.dsl.CaseBuilder()
            .when(recruitment.status.eq(RecruitmentStatus.OPEN)
                    .and(recruitment.endDate.isNull().or(recruitment.endDate.goe(today))))
            .then(0)
            .otherwise(1);

    List<Tuple> rows = queryFactory
            .select(
                    recruitment.club.id,
                    recruitment.id,
                    recruitment.status,
                    recruitment.startDate,
                    recruitment.endDate,
                    priority,
                    recruitment.endDate.coalesce(LocalDate.of(9999, 12, 31)),
                    recruitment.createdAt
            )
            .from(recruitment)
            .where(recruitment.club.id.in(clubIds))
            .orderBy(
                    recruitment.club.id.asc(),
                    priority.asc(),
                    // 활성 그룹: createdAt 최신 우선
                    // 마감 그룹: endDate DESC (NULL coalesce 로 처리)
                    recruitment.endDate.coalesce(LocalDate.of(9999, 12, 31)).desc(),
                    recruitment.createdAt.desc()
            )
            .fetch();

    Map<Long, ClubActiveRecruitmentRow> picked = new HashMap<>();
    for (Tuple row : rows) {
        Long clubId = row.get(recruitment.club.id);
        if (clubId == null || picked.containsKey(clubId)) {
            continue;
        }
        picked.put(clubId, new ClubActiveRecruitmentRow(
                clubId,
                row.get(recruitment.id),
                row.get(recruitment.status),
                row.get(recruitment.startDate),
                row.get(recruitment.endDate)
        ));
    }
    return picked;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.recruitment.repository.RecruitmentRepositoryActiveLookupTest"`
Expected: 3개 PASS

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/recruitment/repository/ClubActiveRecruitmentRow.java \
        backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryCustom.java \
        backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryImpl.java \
        backend/src/test/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryActiveLookupTest.java
git commit -m "feat(backend): 동아리 묶음별 대표 모집 1건 batch lookup 추가"
```

---

### Task 5: GeneralClubService — page 결과에 활성 모집 attach

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`

- [ ] **Step 1: 서비스에 RecruitmentRepository 주입 + search() 후처리**

```java
// GeneralClubService.java 의 search 메서드 교체

import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.repository.ClubActiveRecruitmentRow;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

// 필드 추가
private final RecruitmentRepository recruitmentRepository;  // 이미 있다면 재사용

@Override
public Page<ClubSummaryQuery> search(ClubSearchCondition condition, Pageable pageable) {
    Page<Club> clubPage = clubRepository.findByCondition(condition, pageable);
    List<Club> clubs = clubPage.getContent();
    if (clubs.isEmpty()) {
        return clubPage.map(ClubSummaryQuery::from);
    }

    List<Long> clubIds = clubs.stream().map(Club::getId).toList();
    LocalDate today = LocalDate.now();
    Map<Long, ClubActiveRecruitmentRow> representativeByClubId =
            recruitmentRepository.findRepresentativeByClubIds(clubIds, today);

    return clubPage.map(eachClub -> {
        ClubSummaryQuery base = ClubSummaryQuery.from(eachClub);
        ClubActiveRecruitmentRow row = representativeByClubId.get(eachClub.getId());
        if (row == null) {
            return base;
        }
        RecruitmentDisplayStatus displayStatus = RecruitmentDisplayStatus.resolve(
                row.status(), row.startDate(), row.endDate(), today);
        return base.withActiveRecruitment(new ClubSummaryQuery.ActiveRecruitmentSummary(
                row.recruitmentId(), displayStatus, row.startDate(), row.endDate()));
    });
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `./gradlew :backend:compileJava`
Expected: BUILD SUCCESSFUL. 만약 `recruitmentRepository` 가 이미 주입되어 있지 않다면 lombok `@RequiredArgsConstructor` 가 알아서 생성자에 추가.

- [ ] **Step 3: 회귀 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.club.*"`
Expected: 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java
git commit -m "feat(backend): /clubs 응답에 활성 모집 1건 attach"
```

---

### Task 6: ClubRepositoryImpl — recruitmentStatus 필터 적용

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java`

- [ ] **Step 1: recruitmentStatusFilter BooleanExpression 메서드 추가**

```java
import com.duing.domain.club.service.dto.query.RecruitmentStatusFilter;

private BooleanExpression recruitmentStatusFilter(RecruitmentStatusFilter filter) {
    if (filter == null) return null;
    LocalDate today = LocalDate.now();
    return switch (filter) {
        case AVAILABLE -> JPAExpressions
                .selectOne()
                .from(recruitment)
                .where(
                        recruitment.club.id.eq(club.id),
                        recruitment.status.eq(RecruitmentStatus.OPEN),
                        recruitment.endDate.isNull().or(recruitment.endDate.goe(today)),
                        recruitment.startDate.loe(today)
                )
                .exists();
        case UPCOMING -> JPAExpressions
                .selectOne()
                .from(recruitment)
                .where(
                        recruitment.club.id.eq(club.id),
                        recruitment.status.eq(RecruitmentStatus.OPEN),
                        recruitment.startDate.gt(today)
                )
                .exists();
        case CLOSED -> JPAExpressions
                .selectOne()
                .from(recruitment)
                .where(
                        recruitment.club.id.eq(club.id),
                        recruitment.status.eq(RecruitmentStatus.CLOSED)
                                .or(recruitment.endDate.isNotNull().and(recruitment.endDate.lt(today)))
                )
                .exists()
                .and(JPAExpressions  // 활성 모집이 있으면 CLOSED 필터에서 제외
                        .selectOne()
                        .from(recruitment)
                        .where(
                                recruitment.club.id.eq(club.id),
                                recruitment.status.eq(RecruitmentStatus.OPEN),
                                recruitment.endDate.isNull().or(recruitment.endDate.goe(today))
                        )
                        .notExists());
    };
}
```

- [ ] **Step 2: findByCondition 의 predicates 배열에 필터 추가, recruiting 하위호환은 effectiveRecruitmentStatus() 로 처리**

```java
// findByCondition 의 predicates 교체:
RecruitmentStatusFilter effectiveStatus = condition.effectiveRecruitmentStatus();

BooleanExpression[] predicates = {
        club.status.eq(ClubStatus.ACTIVE),
        categoryEq(condition.category()),
        divisionEq(condition.division()),
        keywordContains(condition.keyword()),
        tagsOverlap(condition.tags()),
        recruitmentStatusFilter(effectiveStatus),
        centralClubEq(condition.centralClub()),
        collegeEq(condition.college()),
};
```

기존 `hasActiveRecruitment(condition.recruitingOnly())` 호출은 `recruitmentStatusFilter(effectiveStatus)` 가 대체하므로 제거. 메서드 정의 `hasActiveRecruitment` 도 삭제.

- [ ] **Step 3: 컴파일 + 기존 테스트 회귀 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.club.controller.ClubSearchControllerTest" --tests "com.duing.domain.club.service.ClubSearchTagsRecruitingTest"`
Expected: 모두 PASS (recruiting=true → AVAILABLE 하위호환)

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java
git commit -m "feat(backend): recruitmentStatus 필터 QueryDSL 적용 및 recruiting 하위호환"
```

---

### Task 7: ClubRepositoryImpl — RECENT 기본 정렬을 그룹 + 보조 정렬로 재정의

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java`

- [ ] **Step 1: applySort 의 RECENT 분기 교체**

```java
// applySort 의 case RECENT 만 교체:
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.core.types.dsl.NumberExpression;

case RECENT -> {
    // 동아리당 대표 모집을 sub-select 로 한 번 lookup 해서 그룹 번호와 보조 정렬 키를 만든다.
    // 운영 가정상 동아리당 활성 모집은 1건. 다중일 때는 createdAt 최신을 대표로 본다.
    LocalDate today = LocalDate.now();

    // OPEN(기간모집): status=OPEN ∧ endDate IS NOT NULL ∧ today BETWEEN startDate AND endDate
    // ALWAYS_OPEN: status=OPEN ∧ endDate IS NULL
    // UPCOMING: status=OPEN ∧ today < startDate
    // CLOSED: status=CLOSED ∨ (status=OPEN ∧ today > endDate)
    // 모집 없음: 동아리에 모집 row 가 없거나 위 어디에도 매칭되지 않는 경우
    //
    // 그룹 우선순위 컬럼은 club 1개당 1행을 만들기 위해 sub-select min(priority) 사용.
    // 주의: CASE 절은 위에서부터 평가된다. RecruitmentDisplayStatus.resolve() 의 우선순위와 맞추기 위해
    // (1) CLOSED → 그룹 4
    // (2) status=OPEN ∧ today < startDate → UPCOMING → 그룹 3
    // (3) status=OPEN ∧ endDate IS NULL → ALWAYS_OPEN → 그룹 2  (startDate.loe(today) 는 이미 (2) 가 걸러냄)
    // (4) status=OPEN ∧ today > endDate → CLOSED → 그룹 4
    // (5) 이외(OPEN ∧ startDate ≤ today ≤ endDate) → OPEN → 그룹 1
    NumberExpression<Integer> recruitmentPriority = JPAExpressions
            .select(new CaseBuilder()
                    .when(recruitment.status.eq(RecruitmentStatus.CLOSED))
                    .then(4)
                    .when(recruitment.startDate.gt(today))
                    .then(3)
                    .when(recruitment.endDate.isNull())
                    .then(2)
                    .when(recruitment.endDate.lt(today))
                    .then(4)
                    .otherwise(1)
                    .min())
            .from(recruitment)
            .where(recruitment.club.eq(club));

    // 그룹 내 보조 정렬용 정렬키들 (모두 sub-select). 그룹에 안 맞으면 null → NULLS LAST 로 영향 없음.
    var openEndDateAsc = JPAExpressions.select(recruitment.endDate.min())
            .from(recruitment)
            .where(recruitment.club.eq(club),
                    recruitment.status.eq(RecruitmentStatus.OPEN),
                    recruitment.startDate.loe(today),
                    recruitment.endDate.goe(today));
    var upcomingStartDateAsc = JPAExpressions.select(recruitment.startDate.min())
            .from(recruitment)
            .where(recruitment.club.eq(club),
                    recruitment.status.eq(RecruitmentStatus.OPEN),
                    recruitment.startDate.gt(today));
    var closedEndDateDesc = JPAExpressions.select(recruitment.endDate.max())
            .from(recruitment)
            .where(recruitment.club.eq(club),
                    recruitment.status.eq(RecruitmentStatus.CLOSED)
                            .or(recruitment.endDate.isNotNull().and(recruitment.endDate.lt(today))));

    yield new OrderSpecifier<?>[]{
            new OrderSpecifier<>(Order.ASC, recruitmentPriority.coalesce(5),
                    OrderSpecifier.NullHandling.NullsLast),
            new OrderSpecifier<>(Order.ASC, openEndDateAsc, OrderSpecifier.NullHandling.NullsLast),
            new OrderSpecifier<>(Order.ASC, upcomingStartDateAsc, OrderSpecifier.NullHandling.NullsLast),
            new OrderSpecifier<>(Order.DESC, closedEndDateDesc, OrderSpecifier.NullHandling.NullsLast),
            club.createdAt.desc()
    };
}
```

(`yield` 사용을 위해 `switch ... -> { ... yield ...; }` 블록 형태로 변경.)

- [ ] **Step 2: 컴파일 확인**

Run: `./gradlew :backend:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 기존 RECENT 정렬 회귀 — 모집 없는 동아리 두 개의 상대 순서는 createdAt DESC 그대로**

Run: `./gradlew :backend:test --tests "com.duing.domain.club.controller.ClubSearchSortTest.defaultSortReturnsRecentlyCreatedClubFirst"`
Expected: PASS (둘 다 모집 없음 → priority 5 동일 → club.createdAt DESC tiebreak)

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java
git commit -m "feat(backend): RECENT 정렬을 모집 상태 그룹 + 보조 정렬로 재정의"
```

---

### Task 8: ClubApi/ClubController 에 recruitmentStatus 파라미터 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/ClubController.java`

- [ ] **Step 1: ClubApi.getClubs 시그니처에 recruitmentStatus 추가**

`ClubApi.getClubs` 의 파라미터 목록에 추가 (`recruiting` 다음 자리):

```java
import com.duing.domain.club.service.dto.query.RecruitmentStatusFilter;

@Parameter(description = "모집 상태 필터 (AVAILABLE / UPCOMING / CLOSED). 미지정 시 전체. recruiting 보다 우선 적용.")
@RequestParam(required = false) RecruitmentStatusFilter recruitmentStatus,
```

기존 `recruiting` 파라미터의 `description` 도 `"deprecated — recruitmentStatus 로 대체. true 이면 AVAILABLE 과 동일."` 로 갱신.

- [ ] **Step 2: ClubController.getClubs 메서드 파라미터 + 호출 동기화**

`getClubs` 시그니처에 `RecruitmentStatusFilter recruitmentStatus` 추가, `ClubSearchCondition` 생성 시 `recruitmentStatus` 전달:

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
        @RequestParam(required = false) ClubSortOption sort,
        Pageable pageable
) {
    ClubSearchCondition condition = new ClubSearchCondition(
            category, division, keyword, tags, recruiting, recruitmentStatus, centralClub, college, sort);
    Page<ClubSummaryResponse> page = clubService.search(condition, pageable)
            .map(ClubSummaryResponse::from);
    return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
}
```

- [ ] **Step 3: 컴파일**

Run: `./gradlew :backend:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/api/ClubApi.java backend/src/main/java/com/duing/domain/club/controller/ClubController.java
git commit -m "feat(backend): GET /clubs 에 recruitmentStatus 파라미터 추가"
```

---

### Task 9: 통합 테스트 — recruitmentStatus 필터 + activeRecruitment 응답 + RECENT 그룹 정렬

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/controller/ClubSearchRecruitmentStatusTest.java`

- [ ] **Step 1: 실패 테스트 작성**

```java
package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.time.LocalDate;
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
class ClubSearchRecruitmentStatusTest {

    @LocalServerPort int port;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() { RestAssured.port = port; }

    @Test
    @DisplayName("recruitmentStatus=AVAILABLE 이면 OPEN/ALWAYS_OPEN 동아리만 반환된다")
    void availableFilterReturnsOpenAndAlwaysOpen() throws Exception {
        Club openClub = saveActiveClub("availOpen");
        Club alwaysClub = saveActiveClub("availAlways");
        Club upcomingClub = saveActiveClub("availUpcoming");
        Club closedClub = saveActiveClub("availClosed");

        saveOpenRecruitment(openClub, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveOpenRecruitment(alwaysClub, LocalDate.now().minusDays(2), null);
        saveOpenRecruitment(upcomingClub, LocalDate.now().plusDays(5), LocalDate.now().plusDays(10));
        saveClosedRecruitment(closedClub, LocalDate.now().minusDays(10), LocalDate.now().minusDays(1));

        RestAssured.given()
                .when().get("/api/v1/clubs?recruitmentStatus=AVAILABLE&keyword=avail&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(openClub.getName()))
                .body("data.content.name", hasItem(alwaysClub.getName()))
                .body("data.content.name", not(hasItem(upcomingClub.getName())))
                .body("data.content.name", not(hasItem(closedClub.getName())));
    }

    @Test
    @DisplayName("recruitmentStatus=UPCOMING 이면 시작 전 모집을 가진 동아리만 반환된다")
    void upcomingFilterReturnsFuturePending() throws Exception {
        Club futureClub = saveActiveClub("upcomingFuture");
        Club openClub = saveActiveClub("upcomingOpen");

        saveOpenRecruitment(futureClub, LocalDate.now().plusDays(3), LocalDate.now().plusDays(10));
        saveOpenRecruitment(openClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(5));

        RestAssured.given()
                .when().get("/api/v1/clubs?recruitmentStatus=UPCOMING&keyword=upcoming&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(futureClub.getName()))
                .body("data.content.name", not(hasItem(openClub.getName())));
    }

    @Test
    @DisplayName("recruitmentStatus=CLOSED 이면 마감 이력만 있고 활성 모집이 없는 동아리만 반환된다")
    void closedFilterExcludesClubsWithActiveRecruitment() throws Exception {
        Club bothClub = saveActiveClub("closedBoth");
        Club closedOnlyClub = saveActiveClub("closedOnly");
        Club noneClub = saveActiveClub("closedNone");

        saveClosedRecruitment(bothClub, LocalDate.now().minusDays(20), LocalDate.now().minusDays(10));
        saveOpenRecruitment(bothClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(5));
        saveClosedRecruitment(closedOnlyClub, LocalDate.now().minusDays(20), LocalDate.now().minusDays(5));

        RestAssured.given()
                .when().get("/api/v1/clubs?recruitmentStatus=CLOSED&keyword=closed&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(closedOnlyClub.getName()))
                .body("data.content.name", not(hasItem(bothClub.getName())))
                .body("data.content.name", not(hasItem(noneClub.getName())));
    }

    @Test
    @DisplayName("recruiting=true 단독은 AVAILABLE 과 동일하게 처리된다 (하위호환)")
    void legacyRecruitingTrueMapsToAvailable() throws Exception {
        Club openClub = saveActiveClub("legacyOpen");
        Club closedClub = saveActiveClub("legacyClosed");

        saveOpenRecruitment(openClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(5));
        saveClosedRecruitment(closedClub, LocalDate.now().minusDays(10), LocalDate.now().minusDays(1));

        RestAssured.given()
                .when().get("/api/v1/clubs?recruiting=true&keyword=legacy&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(openClub.getName()))
                .body("data.content.name", not(hasItem(closedClub.getName())));
    }

    @Test
    @DisplayName("활성 모집이 있는 동아리는 activeRecruitment 가 OPEN 상태로 응답에 포함된다")
    void activeRecruitmentEmbeddedInResponse() throws Exception {
        Club openClub = saveActiveClub("embedOpen");
        saveOpenRecruitment(openClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7));

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=embedOpen&size=10")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].activeRecruitment", notNullValue())
                .body("data.content[0].activeRecruitment.displayStatus", equalTo("OPEN"))
                .body("data.content[0].activeRecruitment.endDate", notNullValue());
    }

    @Test
    @DisplayName("상시모집(endDate=null) 동아리는 activeRecruitment.displayStatus=ALWAYS_OPEN, endDate=null 로 응답된다")
    void alwaysOpenRecruitmentEmbedded() throws Exception {
        Club alwaysClub = saveActiveClub("embedAlways");
        saveOpenRecruitment(alwaysClub, LocalDate.now().minusDays(2), null);

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=embedAlways&size=10")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].activeRecruitment.displayStatus", equalTo("ALWAYS_OPEN"))
                .body("data.content[0].activeRecruitment.endDate", nullValue());
    }

    @Test
    @DisplayName("모집 이력이 없는 동아리는 activeRecruitment 가 null 이다")
    void clubWithoutRecruitmentHasNullActive() throws Exception {
        Club bareClub = saveActiveClub("embedBare");

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=embedBare&size=10")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].activeRecruitment", nullValue());
    }

    @Test
    @DisplayName("기본 정렬은 OPEN > ALWAYS_OPEN > UPCOMING > CLOSED > 모집없음 순으로 동아리를 노출한다")
    void defaultSortGroupsByRecruitmentStatus() throws Exception {
        Club bareClub = saveActiveClub("sortGroupBare");
        Club closedClub = saveActiveClub("sortGroupClosed");
        Club upcomingClub = saveActiveClub("sortGroupUpcoming");
        Club alwaysClub = saveActiveClub("sortGroupAlways");
        Club openClub = saveActiveClub("sortGroupOpen");

        saveClosedRecruitment(closedClub, LocalDate.now().minusDays(20), LocalDate.now().minusDays(5));
        saveOpenRecruitment(upcomingClub, LocalDate.now().plusDays(5), LocalDate.now().plusDays(15));
        saveOpenRecruitment(alwaysClub, LocalDate.now().minusDays(3), null);
        saveOpenRecruitment(openClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7));

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=sortGroup&size=10")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(5))
                .body("data.content[0].name", equalTo(openClub.getName()))
                .body("data.content[1].name", equalTo(alwaysClub.getName()))
                .body("data.content[2].name", equalTo(upcomingClub.getName()))
                .body("data.content[3].name", equalTo(closedClub.getName()))
                .body("data.content[4].name", equalTo(bareClub.getName()));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    private Recruitment saveOpenRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        Recruitment created = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        return recruitmentRepository.save(created);
    }

    private Recruitment saveClosedRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        Recruitment created = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        created.close();
        return recruitmentRepository.save(created);
    }
}
```

- [ ] **Step 2: 테스트 전체 실행**

Run: `./gradlew :backend:test --tests "com.duing.domain.club.controller.ClubSearchRecruitmentStatusTest"`
Expected: 모든 케이스 PASS

- [ ] **Step 3: 기존 정렬·검색 회귀 재확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.club.*"`
Expected: 전체 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/club/controller/ClubSearchRecruitmentStatusTest.java
git commit -m "test(backend): /clubs 모집 상태 필터·응답·기본 정렬 통합 테스트"
```

---

### Task 10: PR 생성 전 self-check

- [ ] 시크릿 미포함 확인
- [ ] 의사코드 없음
- [ ] 변수명 명확 (`r`, `dto` 등 축약 없음)
- [ ] api 인터페이스 우선 작성 → Controller implements 패턴 유지
- [ ] `@Transactional(readOnly = true)` 기본, FetchType.LAZY
- [ ] Flyway 신규 파일 추가 없음 (스키마 변경 없음)
- [ ] 커밋 메시지 Conventional Commits (`feat(backend): ...`)
- [ ] PR 본문에 Co-Authored-By / Claude 어트리뷰션 없음

- [ ] **PR 생성**

```bash
git push -u origin feat/club-summary-active-recruitment
gh pr create --base develop --title "feat(backend): /clubs 모집 상태 필터 + activeRecruitment 응답 + 기본 정렬 재정의" --body "$(cat <<'EOF'
## 🚀 작업 내용

- `ClubSummaryResponse` 에 `activeRecruitment`(displayStatus + 기간) 중첩 객체를 노출했다.
- `GET /api/v1/clubs` 에 `recruitmentStatus` 파라미터(`AVAILABLE | UPCOMING | CLOSED`)를 추가했다. 기존 `recruiting` 은 deprecated 이며 `true` 단독 사용 시 `AVAILABLE` 과 동일 동작.
- 기본 정렬(`RECENT`)을 "모집 상태 그룹(OPEN→ALWAYS_OPEN→UPCOMING→CLOSED→모집없음) + 그룹내 보조 정렬" 로 재정의했다.

## 🤔 고민했던 내용

활성/마감 대표 모집 1건을 동아리당 어떻게 매핑할지 — N+1 회피를 위해 페이지 결과의 club id 묶음을 별도 batch 쿼리로 한 번에 lookup 한 뒤 서비스 단에서 attach 하는 방식을 택했다. QueryDSL 의 LATERAL JOIN 표현이 까다로워 두 번째 쿼리 + 메모리 매핑이 명료했다.

## 💬 리뷰 중점사항

- `RECENT` 정렬 의미 변경이 다른 호출 사이트에 영향이 있는지
- `recruitmentStatus=CLOSED` 가 활성 모집 있는 동아리를 제대로 제외하는지
- 기본 정렬의 sub-select 비용 — 대량 데이터에서 인덱스 활용 여부

Spec: `docs/superpowers/specs/2026-05-25-clubs-recruitment-status-filter-design.md`
EOF
)"
```

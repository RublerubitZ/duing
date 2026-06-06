# 홈 화면 Mock 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 랜딩(`/`) 의 4개 섹션(추천 검색어 / Categories / FeaturedClubs / RecruitmentTicker)을 mock 의존에서 실데이터로 전환한다.

**Architecture:** 백엔드는 기존 `ClubRepositoryImpl.applySort` 의 switch 패턴에 `POPULAR` 한 케이스만 추가 — application/favorite/recruitment 서브쿼리 3개로 4-tier OrderSpecifier 배열을 구성한다. `@SQLRestriction` 의 서브쿼리 자동 적용 가정은 soft-delete 테스트로 잠근다. 프론트는 mock import 4종을 제거하고, FeaturedClubs/RecruitmentTicker 는 서버 컴포넌트에서 `createApiClient` 로 직접 fetch (HomeHero.fetchClubStats 패턴 동일), Categories 는 정적 8 enum 상수, 추천 검색어는 5개 키워드 갱신.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Hibernate 6 / QueryDSL — Next.js 15 / React 19 (Server Component) / Vitest

**Spec:** [`docs/superpowers/specs/2026-06-06-home-real-data-design.md`](../specs/2026-06-06-home-real-data-design.md)

---

## 파일 구조

### PR-A: Backend POPULAR 정렬 (`feat/clubs-popular-sort`)

| 파일 | 종류 | 책임 |
|---|---|---|
| `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSortOption.java` | 수정 | `POPULAR` enum 값 + Javadoc |
| `backend/src/main/java/com/duing/domain/club/api/ClubApi.java` | 수정 | Swagger `sort` 설명에 `POPULAR` 추가 |
| `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java` | 수정 | `applySort()` switch 에 `POPULAR` case + QApplication / QClubFavorite import |
| `backend/src/test/java/com/duing/domain/club/service/ClubSearchPopularSortTest.java` | 신규 | 인기순 정렬 7개 검증 (tier tiebreak / soft-delete 가정 / 합산 / AVAILABLE 조합) |

### PR-B: FeaturedClubs + RecruitmentTicker (`feat/home-featured-and-ticker`)

| 파일 | 종류 | 책임 |
|---|---|---|
| `frontend/apps/web/app/_lib/home-data.ts` | 신규 | 서버 컴포넌트에서 사용할 `fetchPopularClubs()`, `fetchUpcomingDeadlineClubs()` (createApiClient 래핑) |
| `frontend/apps/web/app/_lib/dday.ts` | 신규 | `computeDday(endDate, today)` 순수 함수 |
| `frontend/apps/web/app/_components/sections/FeaturedClubs.tsx` | 수정 | mock import 제거, async server component 전환, 4건 fetch + 0건 시 null |
| `frontend/apps/web/app/_components/sections/RecruitmentTicker.tsx` | 수정 | mock import 제거, async server component, 상시모집 필터 + d-Day 표시 + 0건 시 null |
| `frontend/apps/web/app/_mocks.ts` | 수정 | `featuredClubs`, `recruitmentTickers` export 제거 + `FeaturedClub` / `RecruitmentTicker` 타입 제거 |
| `frontend/apps/web/test/home/dday.test.ts` | 신규 | `computeDday` 미래/당일/null 입력 처리 |
| `frontend/apps/web/test/home/featured-clubs.test.tsx` | 신규 | 4건 응답 → 4개 카드 / 0건 → 미렌더 |
| `frontend/apps/web/test/home/recruitment-ticker.test.tsx` | 신규 | 상시모집 1건 포함 → 필터 후 렌더 / 필터 후 0건 → 미렌더 |

### PR-C: Categories + HomeHero 추천 검색어 (`feat/home-categories-and-hero-queries`)

| 파일 | 종류 | 책임 |
|---|---|---|
| `frontend/apps/web/app/_lib/homeCategories.ts` | 신규 | `HOME_CATEGORIES` 상수 8개 (ClubCategory enum 정합) + `HomeCategoryMeta` 타입 |
| `frontend/apps/web/app/_components/sections/Categories.tsx` | 수정 | mock import 제거, `HOME_CATEGORIES` 사용, URL = enum 값, 카운트 표시 제거 |
| `frontend/apps/web/app/_components/sections/HomeHero.tsx` | 수정 | `SUGGESTED_QUERIES` 키워드 5개 갱신 |
| `frontend/apps/web/app/_mocks.ts` | 수정 | `landingCategories` export + `LandingCategory` 타입 제거 |
| `frontend/apps/web/test/home/home-categories.test.ts` | 신규 | `HOME_CATEGORIES` 정합성 검증 (8개 + enum 매핑) |
| `frontend/apps/web/test/home/categories-render.test.tsx` | 신규 | 8개 enum 카테고리 모두 렌더, URL 이 enum 값 사용 |

---

# PR-A — Backend POPULAR 정렬

## 사전 점검

- [ ] **Step 0-1: develop 동기화 + 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git checkout develop && \
git pull --ff-only origin develop && \
git checkout -b feat/clubs-popular-sort
```

Docker 가 떠 있는지 확인 (Testcontainers 가 필요):

```bash
docker ps | head -3
```

## Task A1: `ClubSortOption.POPULAR` enum 값 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSortOption.java`

- [ ] **Step A1-1: 현재 파일 내용 확인**

`/Users/ksy/Desktop/BASIC/Coding/Duing/backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSortOption.java` 를 읽어 기존 3개 enum 형식을 확인.

- [ ] **Step A1-2: `POPULAR` enum 값 추가**

`ALPHABETICAL` 다음에 추가:

```java
    /** 이름 가나다순 ASC. */
    ALPHABETICAL,
    /**
     * 인기순. 다음 우선순위로 정렬:
     * <ol>
     *   <li>활성 모집 지원자수 합 DESC</li>
     *   <li>즐겨찾기 수 DESC</li>
     *   <li>가장 최근 활성 모집의 시작일 DESC (활성 모집 없으면 NULL → NULLS LAST)</li>
     *   <li>{@code club.createdAt} DESC (최종 tiebreak)</li>
     * </ol>
     * 활성 모집이 없는 동아리는 tier 1 = 0 으로 자연 후순위, tier 3 NULL → NULLS LAST.
     * "현재 모집 중인 동아리 중 인기순" 사용 시 {@code recruitmentStatus=AVAILABLE} 와 조합.
     */
    POPULAR
```

기존 마지막 enum 의 trailing 마침표(`ALPHABETICAL`) 를 콤마로 바꾸는 것 주의.

- [ ] **Step A1-3: 컴파일 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step A1-4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSortOption.java && \
git commit -m "feat(backend): ClubSortOption 에 POPULAR enum 값 추가"
```

DO NOT use `--no-verify`. DO NOT add Co-Authored-By or 🤖.

## Task A2: `ClubApi` Swagger 갱신

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java`

- [ ] **Step A2-1: `@Parameter(description = ...)` 갱신**

`ClubApi.java` 의 `sort` 파라미터 (라인 47 부근) 의 `@Parameter` 설명을 다음으로 교체:

```java
            @Parameter(description = "정렬 옵션 (DEADLINE_SOON / RECENT / ALPHABETICAL / POPULAR). 미지정 시 RECENT. POPULAR 는 활성 모집 지원자수 → 즐겨찾기수 → 활성 모집 시작일.") @RequestParam(required = false) ClubSortOption sort,
```

- [ ] **Step A2-2: 컴파일**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step A2-3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add backend/src/main/java/com/duing/domain/club/api/ClubApi.java && \
git commit -m "feat(backend): ClubApi sort 파라미터 Swagger 에 POPULAR 옵션 추가"
```

## Task A3: POPULAR 정렬 실패 테스트 작성 (TDD Red)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/service/ClubSearchPopularSortTest.java`

- [ ] **Step A3-1: 신규 테스트 클래스 작성**

`/Users/ksy/Desktop/BASIC/Coding/Duing/backend/src/test/java/com/duing/domain/club/service/ClubSearchPopularSortTest.java` 에 다음 내용 작성:

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSortOption;
import com.duing.domain.club.service.dto.query.RecruitmentStatusFilter;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
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
class ClubSearchPopularSortTest {

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubFavoriteRepository clubFavoriteRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("POPULAR — applicationCount 가 많은 동아리가 앞 순위로 정렬된다")
    void applicationCountIsPrimaryOrder() throws Exception {
        Club few = saveActiveClub("popAppFew");
        Club many = saveActiveClub("popAppMany");
        Recruitment fewRec = saveOpenRecruitment(few, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        Recruitment manyRec = saveOpenRecruitment(many, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(fewRec, 1);
        saveApplications(manyRec, 5);

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popApp"),
                PageRequest.of(0, 50)).getContent();

        assertThat(page).extracting(Club::getName).containsSubsequence(many.getName(), few.getName());
    }

    @Test
    @DisplayName("POPULAR — applicationCount 동률 시 favoriteCount 가 더 많은 동아리가 앞에 온다")
    void favoriteCountIsSecondaryTiebreak() throws Exception {
        Club lessFav = saveActiveClub("popFavLess");
        Club moreFav = saveActiveClub("popFavMore");
        Recruitment lessFavRec = saveOpenRecruitment(lessFav, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        Recruitment moreFavRec = saveOpenRecruitment(moreFav, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(lessFavRec, 2);
        saveApplications(moreFavRec, 2);
        saveFavorites(lessFav, 1);
        saveFavorites(moreFav, 3);

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popFav"),
                PageRequest.of(0, 50)).getContent();

        assertThat(page).extracting(Club::getName).containsSubsequence(moreFav.getName(), lessFav.getName());
    }

    @Test
    @DisplayName("POPULAR — application/favorite 동률 시 활성 모집 시작일이 늦은 동아리가 앞에 온다")
    void recruitmentStartDateIsTertiaryTiebreak() throws Exception {
        Club earlier = saveActiveClub("popStartEarlier");
        Club later = saveActiveClub("popStartLater");
        saveOpenRecruitment(earlier, LocalDate.now().minusDays(10), LocalDate.now().plusDays(7));
        saveOpenRecruitment(later, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popStart"),
                PageRequest.of(0, 50)).getContent();

        assertThat(page).extracting(Club::getName).containsSubsequence(later.getName(), earlier.getName());
    }

    @Test
    @DisplayName("POPULAR — 활성 모집 없는 동아리는 favoriteCount 가 많아도 활성 모집 있는 동아리 뒤로 밀린다")
    void clubsWithoutActiveRecruitmentFallBack() throws Exception {
        Club withRec = saveActiveClub("popWithRec");
        Club withoutRec = saveActiveClub("popWithoutRec");
        Recruitment withRecRec = saveOpenRecruitment(withRec, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(withRecRec, 1);
        saveFavorites(withoutRec, 99);

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popWithout"),
                PageRequest.of(0, 50)).getContent();

        assertThat(page).extracting(Club::getName).containsSubsequence(withRec.getName(), withoutRec.getName());
    }

    @Test
    @DisplayName("POPULAR + recruitmentStatus=AVAILABLE — 활성 모집 없는 동아리는 결과에서 완전히 빠진다")
    void availableFilterRemovesClubsWithoutActiveRecruitment() throws Exception {
        Club withRec = saveActiveClub("popAvailWith");
        Club withoutRec = saveActiveClub("popAvailWithout");
        Recruitment rec = saveOpenRecruitment(withRec, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(rec, 1);
        saveFavorites(withoutRec, 10);

        ClubSearchCondition condition = new ClubSearchCondition(
                null, null, "popAvail", null, null,
                RecruitmentStatusFilter.AVAILABLE, null, null, null, ClubSortOption.POPULAR);

        List<Club> page = clubRepository.findByCondition(condition, PageRequest.of(0, 50)).getContent();

        assertThat(page).extracting(Club::getName)
                .contains(withRec.getName())
                .doesNotContain(withoutRec.getName());
    }

    @Test
    @DisplayName("POPULAR — 활성 모집이 2개인 동아리의 applicationCount 는 모든 활성 모집 application 의 합산이다")
    void multipleActiveRecruitmentsSumApplications() throws Exception {
        Club multi = saveActiveClub("popMultiRec");
        Club single = saveActiveClub("popSingleRec");
        Recruitment recA = saveOpenRecruitment(multi, LocalDate.now().minusDays(5), LocalDate.now().plusDays(7));
        Recruitment recB = saveOpenRecruitment(multi, LocalDate.now().minusDays(2), LocalDate.now().plusDays(10));
        Recruitment recSingle = saveOpenRecruitment(single, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(recA, 3);
        saveApplications(recB, 2);
        saveApplications(recSingle, 4);

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popMultiRec"),
                PageRequest.of(0, 50)).getContent();

        // multi(3+2=5) > single(4)
        assertThat(page).extracting(Club::getName).containsSubsequence(multi.getName(), single.getName());
    }

    @Test
    @DisplayName("POPULAR — soft-delete 된 application 은 applicationCount 에서 제외된다 (@SQLRestriction 자동 적용 검증)")
    void softDeletedApplicationsAreExcludedFromCount() throws Exception {
        Club alive = saveActiveClub("popSoftAlive");
        Club deleted = saveActiveClub("popSoftDeleted");
        Recruitment aliveRec = saveOpenRecruitment(alive, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        Recruitment deletedRec = saveOpenRecruitment(deleted, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(aliveRec, 2);
        List<Application> toDelete = saveApplications(deletedRec, 5);
        // 5개 중 4개 soft-delete → 살아있는 application 1개만 카운트
        for (int i = 0; i < 4; i++) {
            applicationRepository.delete(toDelete.get(i));
        }
        applicationRepository.flush();

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popSoft"),
                PageRequest.of(0, 50)).getContent();

        // alive(2) > deleted(1 살아남음)
        assertThat(page).extracting(Club::getName).containsSubsequence(alive.getName(), deleted.getName());
    }

    private ClubSearchCondition conditionPopular(String keyword) {
        return new ClubSearchCondition(
                null, null, keyword, null, null, null, null, null, null, ClubSortOption.POPULAR);
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

    private List<Application> saveApplications(Recruitment recruitment, int count) throws Exception {
        return java.util.stream.IntStream.range(0, count)
                .mapToObj(i -> {
                    try {
                        User user = saveUser("popAppUser");
                        Application application = Application.submit(recruitment, user, List.of("answer"));
                        Field statusField = Application.class.getDeclaredField("status");
                        statusField.setAccessible(true);
                        statusField.set(application, ApplicationStatus.SUBMITTED);
                        return applicationRepository.save(application);
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                })
                .toList();
    }

    private void saveFavorites(Club club, int count) throws Exception {
        for (int i = 0; i < count; i++) {
            User user = saveUser("popFavUser");
            clubFavoriteRepository.save(ClubFavorite.create(user, club));
        }
    }

    private User saveUser(String prefix) throws Exception {
        long seq = sequence.getAndIncrement();
        User user = User.create(
                prefix + seq + "@test.com",
                prefix + seq,
                "1234567" + seq,
                "01000000000",
                UserRole.STUDENT);
        return userRepository.save(user);
    }
}
```

> 픽스처 helper 는 기존 `ClubSearchRecruitmentStatusTest` 패턴 차용. `User.create` 시그니처는 프로젝트 표준 (`email, name, studentId, phone, role`) — 실제 코드와 다르면 컴파일 에러로 노출되므로 해당 시점에 시그니처 확인하여 갱신.

- [ ] **Step A3-2: User.create 시그니처 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
grep -n "public static User create\|public static User of\|User.create(" backend/src/main/java/com/duing/domain/user/entity/User.java | head -5 && \
grep -rn "User.create(\|User.of(" backend/src/test --include="*.java" | head -5
```

기존 호출 패턴 1개를 참고해서 위 테스트의 `saveUser` 메서드 본문을 그 시그니처에 맞게 조정.

- [ ] **Step A3-3: 테스트 실행 → 실패 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "ClubSearchPopularSortTest" -i 2>&1 | tail -40
```

Expected: 모든 테스트 FAIL — `POPULAR` 가 `applySort` switch 에서 매칭되지 않아 `MatchException` 또는 `IllegalArgumentException` 발생 (현재 switch 는 3개 케이스만 처리).

만약 컴파일 자체가 실패하면 (예: User.create 시그니처 불일치) 먼저 A3-2 로 돌아가 수정.

- [ ] **Step A3-4: 커밋하지 않음**

Task A4 (구현) 와 함께 커밋. 신규 테스트 파일은 untracked 상태 유지.

## Task A4: `applySort(POPULAR)` 구현 (TDD Green)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java`

- [ ] **Step A4-1: import 추가**

다음 static import 와 일반 import 추가:

```java
import static com.duing.domain.application.entity.QApplication.application;
import static com.duing.domain.favorite.entity.QClubFavorite.clubFavorite;
```

이미 `import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;` 가 있을 것 — 확인.

- [ ] **Step A4-2: `applySort` switch 에 POPULAR case 추가**

`applySort(ClubSortOption sortOption)` 메서드 내부 switch (`case ALPHABETICAL` 다음 `case RECENT` 케이스 끝, switch 의 마지막 `}` 직전) 에 다음 case 추가:

```java
            case POPULAR -> {
                LocalDate today = LocalDate.now();

                // tier 1: 활성 모집들의 application 수 합
                var applicationCount = JPAExpressions.select(application.count())
                        .from(application)
                        .join(application.recruitment, recruitment)
                        .where(recruitment.club.eq(club),
                                recruitment.status.eq(RecruitmentStatus.OPEN),
                                recruitment.startDate.loe(today),
                                recruitment.endDate.isNull().or(recruitment.endDate.goe(today)));

                // tier 2: 즐겨찾기 수
                var favoriteCount = JPAExpressions.select(clubFavorite.count())
                        .from(clubFavorite)
                        .where(clubFavorite.club.eq(club));

                // tier 3: 가장 최근 활성 모집의 시작일
                var latestActiveStart = JPAExpressions.select(recruitment.startDate.max())
                        .from(recruitment)
                        .where(recruitment.club.eq(club),
                                recruitment.status.eq(RecruitmentStatus.OPEN),
                                recruitment.startDate.loe(today),
                                recruitment.endDate.isNull().or(recruitment.endDate.goe(today)));

                // tier 1·2 는 COUNT 가 0 반환 → DESC 정렬 시 자연스럽게 후순위.
                // tier 3 만 활성 모집 부재 시 NULL 가능 → NULLS LAST 명시.
                yield new OrderSpecifier<?>[]{
                        new OrderSpecifier<>(Order.DESC, applicationCount),
                        new OrderSpecifier<>(Order.DESC, favoriteCount),
                        new OrderSpecifier<>(Order.DESC, latestActiveStart, OrderSpecifier.NullHandling.NullsLast),
                        club.createdAt.desc()
                };
            }
```

- [ ] **Step A4-3: 테스트 재실행 → 성공 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "ClubSearchPopularSortTest" -i 2>&1 | tail -40
```

Expected: 7 tests PASS.

테스트 중 `softDeletedApplicationsAreExcludedFromCount` 가 실패하면 §3 의 가정 (자동 적용) 이 깨진 것 — fallback 으로 명시적 조건 추가:

```java
                // tier 1 fallback (자동 적용 안 됨)
                var applicationCount = JPAExpressions.select(application.count())
                        .from(application)
                        .join(application.recruitment, recruitment)
                        .where(recruitment.club.eq(club),
                                recruitment.status.eq(RecruitmentStatus.OPEN),
                                recruitment.startDate.loe(today),
                                recruitment.endDate.isNull().or(recruitment.endDate.goe(today)),
                                application.deletedAt.isNull(),
                                recruitment.deletedAt.isNull());
```

이 경우 (fallback 적용 시) Step A4-6 에서 PR 본문에 명시.

- [ ] **Step A4-4: SQL 로그 육안 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && \
./gradlew test --tests "ClubSearchPopularSortTest.softDeletedApplicationsAreExcludedFromCount" \
  -Dorg.gradle.jvmargs='-Dorg.hibernate.SQL=DEBUG' \
  -i 2>&1 | grep -A 2 -i "select.*application\b\|select.*recruitment\b" | head -40
```

Expected: 생성된 SQL 의 application 서브쿼리에 `deleted_at is null` 이 자동 포함되어 있어야 함. 보이면 가정 확정. 안 보이면 (A4-3 에서 fallback 적용했어야 함) 확인.

- [ ] **Step A4-5: 회귀 테스트**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "ClubSearch*"
```

Expected: 모든 `ClubSearch*Test` 클래스 PASS — 기존 정렬/필터에 영향 없음.

- [ ] **Step A4-6: 커밋 (A3 테스트 + A4 구현 합쳐서)**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java \
        backend/src/test/java/com/duing/domain/club/service/ClubSearchPopularSortTest.java && \
git commit -m "feat(backend): ClubRepository 에 POPULAR 정렬 구현 — 지원자수·즐겨찾기·모집시작일 우선순위"
```

## Task A5: Push + PR-A 생성

- [ ] **Step A5-1: push**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git push -u origin feat/clubs-popular-sort
```

- [ ] **Step A5-2: PR 생성**

```bash
gh pr create --base develop --title "feat(backend): /clubs 인기순(POPULAR) 정렬 추가" --body "$(cat <<'EOF'
## 🚀 작업 내용
`GET /clubs?sort=POPULAR` 정렬을 추가했다. 4-tier 우선순위로 동아리를 정렬한다:
1. 현재 활성 모집의 지원자 수 합 DESC
2. 즐겨찾기 수 DESC
3. 가장 최근 활성 모집의 시작일 DESC (NULL → NULLS LAST)
4. `club.createdAt` DESC (최종 tiebreak)

홈 화면 `FeaturedClubs` 가 `?sort=POPULAR&recruitmentStatus=AVAILABLE` 조합으로 사용한다. POPULAR 단독으로는 활성 모집 없는 동아리도 결과에 포함되지만 tier 1 = 0 이라 자연 후순위.

## 🤔 고민했던 내용
`applicationCount` 의 집계 범위를 "동아리 전체 누적" vs "현재 active recruitment 만" 중 후자로 잡았다. 정렬 시그널이 "지금 인기" 의미에 맞다는 판단. tier 1·2 는 `COUNT()` 가 0 을 반환하므로 NULLS LAST 가 무의미 — DESC 자연 정렬이면 충분. tier 3 만 `MAX(startDate)` 가 active recruitment 부재 시 NULL 가능해서 NULLS LAST 를 명시했다.

`@SQLRestriction("deleted_at IS NULL")` 가 QueryDSL 의 `JPAExpressions.from(...)` 서브쿼리에도 자동 적용된다는 전제로 시작했다. 기존 `recruitmentStatusFilter` 도 같은 가정을 쓰고 있어 패턴 일관성. 테스트로 soft-delete 된 application 이 카운트에서 빠지는지 잠궜다 — 통과 + SQL 로그에 `deleted_at is null` 자동 삽입 확인.

## 💬 리뷰 중점사항
- POPULAR tier 정의가 사양과 일치하는지 (4-tier 순서·NULL 처리)
- 활성 모집 없는 동아리가 POPULAR 결과에 포함되지만 `recruitmentStatus=AVAILABLE` 조합 시 빠지는 직교 동작
- soft-delete 검증 테스트가 `@SQLRestriction` 자동 적용 가정을 충분히 잠그는지
EOF
)"
```

---

# PR-B — FeaturedClubs + RecruitmentTicker

> PR-A (#TODO_PR_NUMBER) 머지 완료 후 진행.

## 사전 점검

- [ ] **Step 0-2: develop 동기화 + 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git checkout develop && \
git pull --ff-only origin develop && \
git checkout -b feat/home-featured-and-ticker
```

## Task B1: `computeDday` 순수 함수 TDD

**Files:**
- Create: `frontend/apps/web/test/home/dday.test.ts`
- Create: `frontend/apps/web/app/_lib/dday.ts`

- [ ] **Step B1-1: 디렉터리 생성**

```bash
mkdir -p /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/test/home
```

- [ ] **Step B1-2: 실패 테스트 작성**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/test/home/dday.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { computeDday } from '../../app/_lib/dday';

describe('computeDday', () => {
  const today = new Date('2026-09-20T00:00:00');

  it('3일 후 종료 → D-3', () => {
    expect(computeDday('2026-09-23', today)).toBe('D-3');
  });

  it('당일 종료 → D-day', () => {
    expect(computeDday('2026-09-20', today)).toBe('D-day');
  });

  it('1일 후 종료 → D-1', () => {
    expect(computeDday('2026-09-21', today)).toBe('D-1');
  });

  it('이미 지난 종료일 → D+N 형식 (안전망)', () => {
    expect(computeDday('2026-09-18', today)).toBe('D+2');
  });
});
```

- [ ] **Step B1-3: 테스트 실행 → 실패**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web test --run test/home/dday.test.ts 2>&1 | tail -15
```

Expected: 모듈 미존재 에러.

- [ ] **Step B1-4: 구현**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/_lib/dday.ts`:

```ts
/** YYYY-MM-DD 형식 endDate 와 today 의 d-Day 표기. */
export function computeDday(endDate: string, today: Date): string {
  const end = new Date(`${endDate}T00:00:00`);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((end.getTime() - todayMidnight.getTime()) / 86_400_000);
  if (diff === 0) return 'D-day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}
```

- [ ] **Step B1-5: 테스트 통과 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web test --run test/home/dday.test.ts 2>&1 | tail -15
```

Expected: 4 tests PASS.

- [ ] **Step B1-6: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add frontend/apps/web/app/_lib/dday.ts \
        frontend/apps/web/test/home/dday.test.ts && \
git commit -m "feat(frontend): computeDday 순수 함수 + 테스트"
```

## Task B2: 홈 데이터 페치 헬퍼

**Files:**
- Create: `frontend/apps/web/app/_lib/home-data.ts`

- [ ] **Step B2-1: 작성**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/_lib/home-data.ts`:

```ts
import { createApiClient } from '@duing/api';
import type { ClubSummary } from '@duing/types';

function client() {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1',
  });
}

/** FeaturedClubs 용: 현재 모집 중인 동아리를 인기순으로 size 만큼. */
export async function fetchPopularClubs(size: number): Promise<ClubSummary[]> {
  const page = await client().clubs.list({
    sort: 'POPULAR',
    recruitmentStatus: 'AVAILABLE',
    size,
  });
  return page.content;
}

/** RecruitmentTicker 용: 마감 임박순 모집 중 동아리, 상시모집(endDate=null) 은 제거. */
export async function fetchUpcomingDeadlineClubs(size: number): Promise<ClubSummary[]> {
  const page = await client().clubs.list({
    sort: 'DEADLINE_SOON',
    recruitmentStatus: 'AVAILABLE',
    size,
  });
  return page.content.filter((club) => club.activeRecruitment?.endDate != null);
}
```

- [ ] **Step B2-2: typecheck**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web typecheck 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step B2-3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add frontend/apps/web/app/_lib/home-data.ts && \
git commit -m "feat(frontend): 홈 데이터 페치 헬퍼 — fetchPopularClubs / fetchUpcomingDeadlineClubs"
```

## Task B3: `FeaturedClubs` 실데이터 전환 + 테스트

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/FeaturedClubs.tsx`
- Create: `frontend/apps/web/test/home/featured-clubs.test.tsx`

- [ ] **Step B3-1: 컴포넌트 교체**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/_components/sections/FeaturedClubs.tsx` 전체 교체:

```tsx
import Link from 'next/link';
import type { ClubSummary } from '@duing/types';

import { ArrowRight } from '@/components/duing/Icon';
import { Sparkle } from '@/components/duing/Sparkle';
import { fetchPopularClubs } from '@/app/_lib/home-data';

const CATEGORY_LABEL: Record<ClubSummary['category'], string> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '예술',
  SPORTS: '운동',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

const CATEGORY_COLOR: Record<ClubSummary['category'], string> = {
  ACADEMIC: '#1F4A36',
  CULTURE: '#6b7e3e',
  ART: '#7d4f87',
  SPORTS: '#c47a3b',
  VOLUNTEER: '#b88b3b',
  RELIGION: '#a85e5e',
  HOBBY: '#4d6b8a',
  OTHER: '#3e7a73',
};

export async function FeaturedClubs() {
  const clubs = await fetchPopularClubs(4);
  if (clubs.length === 0) return null;

  return (
    <section className="px-10 py-16">
      <div className="max-w-layout mx-auto">
        <div className="mb-9 flex items-end justify-between">
          <div>
            <div className="mb-2.5 text-[13px] font-semibold tracking-wide08 text-ink">
              FEATURED · 이번 주 주목
            </div>
            <h2 className="text-[44px]">지금 가장 활발한 곳</h2>
          </div>
          <Link
            href="/clubs"
            className="flex items-center gap-1.5 text-sm font-semibold text-ink hover:gap-2"
          >
            전체 보기 <ArrowRight />
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-4">
          {clubs.map((club) => (
            <FeaturedCard key={club.id} club={club} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({ club }: { club: ClubSummary }) {
  const color = CATEGORY_COLOR[club.category];
  const categoryLabel = CATEGORY_LABEL[club.category];
  const endDate = club.activeRecruitment?.endDate ?? null;

  return (
    <Link
      href={`/clubs/${club.id}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-line bg-paper p-4 transition hover:shadow-2"
    >
      <div
        className="relative grid h-[156px] place-items-center overflow-hidden rounded-md"
        style={{ background: `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)` }}
      >
        {club.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.logoUrl} alt={club.name} className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span className="text-[44px] font-bold" style={{ color }}>
            {club.name.charAt(0)}
          </span>
        )}
        <Sparkle size={18} color={color} className="absolute right-3 top-3" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[11.5px] font-bold text-paper">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          모집중
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="pill" style={{ fontSize: 11 }}>{categoryLabel}</span>
        {club.tags.slice(0, 1).map((tag) => (
          <span key={tag} className="text-[11.5px] text-charcoal-3">· {tag}</span>
        ))}
      </div>
      <div>
        <h3 className="mb-1 text-[19px]">{club.name}</h3>
        <p className="line-clamp-2 text-[13.5px] text-charcoal-3">
          {club.tags.length > 0 ? club.tags.join(' · ') : '소개 준비중'}
        </p>
      </div>
      {endDate && (
        <div className="mt-1 flex items-center justify-between border-t border-dashed border-line pt-3 text-[12.5px] text-charcoal-2">
          <span>모집 중</span>
          <span className="font-bold text-ink">~ {endDate}</span>
        </div>
      )}
    </Link>
  );
}
```

- [ ] **Step B3-2: 통합 테스트 작성**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/test/home/featured-clubs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockFetchPopularClubs = vi.fn<[number], Promise<ClubSummary[]>>();

vi.mock('../../app/_lib/home-data', () => ({
  fetchPopularClubs: (size: number) => mockFetchPopularClubs(size),
}));

import { FeaturedClubs } from '../../app/_components/sections/FeaturedClubs';

function makeSummary(overrides: Partial<ClubSummary> = {}): ClubSummary {
  return {
    id: 1,
    name: '두잉 동아리',
    category: 'ACADEMIC',
    division: '학술분과',
    college: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: ['스터디'],
    centralClub: true,
    activeRecruitment: {
      recruitmentId: 10,
      displayStatus: 'OPEN',
      startDate: '2026-09-10',
      endDate: '2026-09-30',
    },
    ...overrides,
  };
}

describe('FeaturedClubs (server component)', () => {
  it('응답이 4건이면 4개 카드가 렌더된다', async () => {
    mockFetchPopularClubs.mockResolvedValueOnce([
      makeSummary({ id: 1, name: '알파' }),
      makeSummary({ id: 2, name: '베타' }),
      makeSummary({ id: 3, name: '감마' }),
      makeSummary({ id: 4, name: '델타' }),
    ]);

    const Component = await FeaturedClubs();
    render(<>{Component}</>);

    expect(screen.getByText('알파')).toBeInTheDocument();
    expect(screen.getByText('베타')).toBeInTheDocument();
    expect(screen.getByText('감마')).toBeInTheDocument();
    expect(screen.getByText('델타')).toBeInTheDocument();
  });

  it('응답이 0건이면 섹션 자체를 렌더하지 않는다 (null 반환)', async () => {
    mockFetchPopularClubs.mockResolvedValueOnce([]);

    const Component = await FeaturedClubs();

    expect(Component).toBeNull();
  });
});
```

- [ ] **Step B3-3: 테스트 실행 → 성공 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web test --run test/home/featured-clubs.test.tsx 2>&1 | tail -20
```

Expected: 2 tests PASS.

- [ ] **Step B3-4: typecheck + 전체 테스트 회귀**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web typecheck && pnpm -F web test --run 2>&1 | tail -10
```

Expected: 모두 PASS.

- [ ] **Step B3-5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add frontend/apps/web/app/_components/sections/FeaturedClubs.tsx \
        frontend/apps/web/test/home/featured-clubs.test.tsx && \
git commit -m "feat(frontend): FeaturedClubs 를 POPULAR 정렬 실데이터로 전환 + 0건 시 섹션 숨김"
```

## Task B4: `RecruitmentTicker` 실데이터 전환 + 테스트

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/RecruitmentTicker.tsx`
- Create: `frontend/apps/web/test/home/recruitment-ticker.test.tsx`

- [ ] **Step B4-1: 컴포넌트 교체**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/_components/sections/RecruitmentTicker.tsx` 전체 교체:

```tsx
import Link from 'next/link';

import { ArrowRight } from '@/components/duing/Icon';
import { fetchUpcomingDeadlineClubs } from '@/app/_lib/home-data';
import { computeDday } from '@/app/_lib/dday';

export async function RecruitmentTicker() {
  const clubs = await fetchUpcomingDeadlineClubs(8);
  if (clubs.length === 0) return null;

  const today = new Date();

  return (
    <section className="relative mt-16 overflow-hidden bg-ink-deep py-5 text-white">
      <div className="max-w-layout mx-auto flex items-center gap-6 px-10">
        <div
          className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold tracking-wide04 text-sage"
          style={{ background: 'rgba(157,182,160,0.18)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          이번 주 마감
        </div>
        <div className="flex flex-1 gap-8 overflow-hidden text-sm font-medium">
          {clubs.map((club) => {
            const endDate = club.activeRecruitment?.endDate;
            if (!endDate) return null;
            return (
              <span key={club.id} className="flex shrink-0 items-center gap-2.5">
                <span className="text-white/65">{club.name}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11.5px] font-bold text-sage">
                  {computeDday(endDate, today)}
                </span>
              </span>
            );
          })}
        </div>
        <Link
          href="/clubs?recruitmentStatus=AVAILABLE"
          className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-white hover:text-sage"
        >
          전체 보기 <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step B4-2: 통합 테스트 작성**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/test/home/recruitment-ticker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockFetchUpcomingDeadlineClubs = vi.fn<[number], Promise<ClubSummary[]>>();

vi.mock('../../app/_lib/home-data', () => ({
  fetchUpcomingDeadlineClubs: (size: number) => mockFetchUpcomingDeadlineClubs(size),
}));

import { RecruitmentTicker } from '../../app/_components/sections/RecruitmentTicker';

function makeSummary(name: string, endDate: string | null): ClubSummary {
  return {
    id: name.length,
    name,
    category: 'ACADEMIC',
    division: '학술분과',
    college: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    centralClub: true,
    activeRecruitment: endDate === null ? null : {
      recruitmentId: 1,
      displayStatus: 'OPEN',
      startDate: '2026-09-10',
      endDate,
    },
  };
}

describe('RecruitmentTicker (server component)', () => {
  it('helper 가 endDate=null 항목을 사전 필터하므로 도착한 데이터만 그대로 렌더된다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([
      makeSummary('알파', '2026-09-21'),
      makeSummary('베타', '2026-09-22'),
    ]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    expect(screen.getByText('알파')).toBeInTheDocument();
    expect(screen.getByText('베타')).toBeInTheDocument();
  });

  it('helper 가 모두 필터해 0건이면 섹션 자체가 미렌더', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([]);

    const Component = await RecruitmentTicker();

    expect(Component).toBeNull();
  });
});
```

- [ ] **Step B4-3: 테스트 실행 + 회귀**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web typecheck && pnpm -F web test --run 2>&1 | tail -15
```

Expected: 신규 2개 + 기존 PASS.

- [ ] **Step B4-4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add frontend/apps/web/app/_components/sections/RecruitmentTicker.tsx \
        frontend/apps/web/test/home/recruitment-ticker.test.tsx && \
git commit -m "feat(frontend): RecruitmentTicker 실데이터 전환 — DEADLINE_SOON + 상시모집 필터 + d-Day"
```

## Task B5: `_mocks.ts` 정리 (PR-B 단계)

**Files:**
- Modify: `frontend/apps/web/app/_mocks.ts`

- [ ] **Step B5-1: 제거 대상 식별**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
grep -n "featuredClubs\|FeaturedClub\|recruitmentTickers\|RecruitmentTicker" frontend/apps/web/app/_mocks.ts
```

`featuredClubs`, `FeaturedClub` 타입, `recruitmentTickers`, `RecruitmentTicker` 타입 4개를 제거. `landingBanners`, `LandingBanner`, `landingCategories`, `LandingCategory` 는 유지.

- [ ] **Step B5-2: 파일 수정**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/_mocks.ts` 에서 위 4개 export 를 삭제 (라인 단위로 정확히).

- [ ] **Step B5-3: typecheck 로 잔존 import 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web typecheck 2>&1 | tail -15
```

Expected: PASS. 만약 `featuredClubs` / `recruitmentTickers` 를 다른 곳에서 import 하고 있다면 (B3/B4 에서 컴포넌트 교체 시 누락된 import) 그곳도 수정.

- [ ] **Step B5-4: 전체 테스트 회귀**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web test --run 2>&1 | tail -10
```

- [ ] **Step B5-5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add frontend/apps/web/app/_mocks.ts && \
git commit -m "chore(frontend): _mocks 에서 featuredClubs / recruitmentTickers 제거"
```

## Task B6: 수동 검증 + Push + PR-B 생성

- [ ] **Step B6-1: dev server 기동 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web dev
```

브라우저에서 `http://localhost:3000` (또는 3001) 접속 후 확인:
- FeaturedClubs 영역에 실제 동아리 4개 카드 렌더
- RecruitmentTicker 영역에 마감 임박 동아리 + D-day 텍스트 노출
- BE 가 0건 응답 (DB 비어있음) 이면 두 섹션 모두 숨김 — 페이지가 휑하면 정상

확인 후 Ctrl+C 로 dev server 종료.

- [ ] **Step B6-2: push**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git push -u origin feat/home-featured-and-ticker
```

- [ ] **Step B6-3: PR 생성**

```bash
gh pr create --base develop --title "feat(frontend): 홈 FeaturedClubs / RecruitmentTicker mock 제거" --body "$(cat <<'EOF'
## 🚀 작업 내용
홈 `/` 의 `FeaturedClubs` 와 `RecruitmentTicker` 두 섹션을 mock 데이터에서 실제 API 호출로 전환했다.

- `FeaturedClubs` → `GET /clubs?sort=POPULAR&recruitmentStatus=AVAILABLE&size=4`. 인기순(BE PR 로 추가된 POPULAR 정렬) 으로 모집 중 동아리 4건.
- `RecruitmentTicker` → `GET /clubs?recruitmentStatus=AVAILABLE&sort=DEADLINE_SOON&size=8`. 상시모집(endDate=null) 은 d-Day 가 없으니 프론트에서 사전 필터.
- 두 섹션 모두 결과가 0건이면 섹션 자체를 렌더하지 않는다 — 휑한 빈 카드 대신 디자인적 절제.

`computeDday` 는 순수 함수로 분리해 단위 테스트로 잠그고, fetch 헬퍼는 `_lib/home-data.ts` 로 추출했다.

## 🤔 고민했던 내용
서버 컴포넌트에서 API 호출 → 실패 시 try/catch 폴백 (`fetchClubStats` 패턴) vs throw (Next.js error boundary). 통계는 숫자 0 fallback 이 자연스럽지만 콘텐츠는 잘못된 빈 화면이 더 위험 — throw 쪽으로 가서 페이지 에러 바운더리가 잡도록 했다.

기존 mock 카드의 시그니처 필드(`gen` N기, `spots` 정원, `members` 인원수)는 BE 응답에 없어서 표시에서 제거했다. 대신 `tags` / `category` / `endDate` 같은 실제 필드로 카드 정보를 재구성. 디자인적 정보량은 약간 줄지만 정확성이 우선.

## 💬 리뷰 중점사항
- 0건 시 섹션 숨김 동작 (두 섹션 모두 0건이면 BannerCarousel ↔ Categories 사이가 비는데 의도된 절제)
- `FeaturedCard` 의 정보 재구성 (logoUrl fallback + `category` 색상 매핑) 디자인적 OK 인지
- `_mocks.ts` 에서 `featuredClubs` / `recruitmentTickers` 만 제거하고 `landingCategories` / `landingBanners` 는 유지 — 후자는 PR-C 와 후속 라운드에서 처리
EOF
)"
```

---

# PR-C — Home Categories + 추천 검색어 (PR-A·B 와 병렬 가능)

> develop 에서 분기. PR-A 머지를 기다릴 필요 없음.

## 사전 점검

- [ ] **Step 0-3: develop 동기화 + 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git checkout develop && \
git pull --ff-only origin develop && \
git checkout -b feat/home-categories-and-hero-queries
```

## Task C1: `homeCategories.ts` 정적 상수 + 정합성 테스트

**Files:**
- Create: `frontend/apps/web/app/_lib/homeCategories.ts`
- Create: `frontend/apps/web/test/home/home-categories.test.ts`

- [ ] **Step C1-1: 정합성 테스트 작성 (Red)**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/test/home/home-categories.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ClubCategory } from '@duing/types';

import { HOME_CATEGORIES } from '../../app/_lib/homeCategories';

const ALL_CATEGORIES: ClubCategory[] = [
  'ACADEMIC', 'CULTURE', 'ART', 'SPORTS',
  'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER',
];

describe('HOME_CATEGORIES', () => {
  it('8개의 카테고리가 정의된다', () => {
    expect(HOME_CATEGORIES).toHaveLength(8);
  });

  it('ClubCategory enum 의 8개 값과 1:1 대응한다 (중복 없음)', () => {
    const values = HOME_CATEGORIES.map((c) => c.value).sort();
    expect(values).toEqual([...ALL_CATEGORIES].sort());
  });

  it('한글 라벨이 학술/문화/예술/운동/봉사/종교/취미/기타 와 일치한다', () => {
    const labels = HOME_CATEGORIES.map((c) => c.label);
    expect(labels).toEqual(['학술', '문화', '예술', '운동', '봉사', '종교', '취미', '기타']);
  });

  it('각 카테고리는 imageSrc · accent · index 메타를 가진다', () => {
    for (const category of HOME_CATEGORIES) {
      expect(category.imageSrc).toMatch(/^\/categories\//);
      expect(category.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(category.index).toMatch(/^0[1-8]$/);
    }
  });
});
```

- [ ] **Step C1-2: 테스트 실행 → 실패 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web test --run test/home/home-categories.test.ts 2>&1 | tail -10
```

Expected: 모듈 미존재 에러.

- [ ] **Step C1-3: 상수 파일 작성**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/_lib/homeCategories.ts`:

```ts
import type { ClubCategory } from '@duing/types';

export type HomeCategoryMeta = {
  value: ClubCategory;
  label: string;
  index: string;
  accent: string;
  fallbackBg: string;
  imageSrc: string;
};

/**
 * 홈 Categories 섹션 메타. ClubCategory enum 의 8개 값과 1:1 매핑.
 * label/URL 은 탐색 페이지(`/clubs?category=…`) 와 정합.
 * 이미지는 기존 8장(`/public/categories/cat-0X-*.png`) 을 의미 가까운 enum 으로 임시 매핑.
 */
export const HOME_CATEGORIES: ReadonlyArray<HomeCategoryMeta> = [
  { value: 'ACADEMIC',  label: '학술', index: '01', accent: '#5b7e4d', fallbackBg: '#1e2e1a', imageSrc: '/categories/cat-01-academic.png' },
  { value: 'CULTURE',   label: '문화', index: '02', accent: '#6b7e3e', fallbackBg: '#1e2614', imageSrc: '/categories/cat-07-culture.png' },
  { value: 'ART',       label: '예술', index: '03', accent: '#7d4f87', fallbackBg: '#221428', imageSrc: '/categories/cat-02-music.png' },
  { value: 'SPORTS',    label: '운동', index: '04', accent: '#c47a3b', fallbackBg: '#2e1e0e', imageSrc: '/categories/cat-03-sport.png' },
  { value: 'VOLUNTEER', label: '봉사', index: '05', accent: '#b88b3b', fallbackBg: '#28200e', imageSrc: '/categories/cat-06-volunteer.png' },
  { value: 'RELIGION',  label: '종교', index: '06', accent: '#a85e5e', fallbackBg: '#281414', imageSrc: '/categories/cat-05-perform.png' },
  { value: 'HOBBY',     label: '취미', index: '07', accent: '#4d6b8a', fallbackBg: '#121e2a', imageSrc: '/categories/cat-04-it.png' },
  { value: 'OTHER',     label: '기타', index: '08', accent: '#3e7a73', fallbackBg: '#0e2422', imageSrc: '/categories/cat-08-startup.png' },
];
```

- [ ] **Step C1-4: 테스트 통과 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web test --run test/home/home-categories.test.ts 2>&1 | tail -10
```

Expected: 4 tests PASS.

- [ ] **Step C1-5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add frontend/apps/web/app/_lib/homeCategories.ts \
        frontend/apps/web/test/home/home-categories.test.ts && \
git commit -m "feat(frontend): HOME_CATEGORIES 상수 — ClubCategory enum 8개 정합"
```

## Task C2: `Categories.tsx` 실 enum 으로 재작성 + 렌더 테스트

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/Categories.tsx`
- Create: `frontend/apps/web/test/home/categories-render.test.tsx`

- [ ] **Step C2-1: 컴포넌트 교체**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/_components/sections/Categories.tsx` 전체 교체:

```tsx
import Image from 'next/image';
import Link from 'next/link';

import { HOME_CATEGORIES, type HomeCategoryMeta } from '@/app/_lib/homeCategories';

export function Categories() {
  return (
    <section className="px-10 pb-10 pt-24">
      <div className="max-w-layout mx-auto">
        <div className="mb-9 flex items-end justify-between gap-5">
          <div>
            <p
              className="mb-3 font-mono text-[11.5px] font-semibold uppercase"
              style={{ letterSpacing: '.22em', color: '#3e5b34' }}
            >
              CATEGORY · 카테고리로 둘러보기
            </p>
            <h2
              className="flex items-center gap-3.5 font-bold"
              style={{ fontSize: 'clamp(28px, 3vw, 38px)', letterSpacing: '-0.025em', color: '#2c4124' }}
            >
              관심사로 시작해요
              <span aria-hidden="true" className="inline-block" style={{ width: 26, height: 26, color: '#5b7e4d' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ animation: 'spin 6s linear infinite' }}>
                  <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
                </svg>
              </span>
            </h2>
          </div>
          <Link
            href="/clubs"
            className="flex shrink-0 items-center gap-1.5 border-b border-transparent pb-0.5 text-[13.5px] font-medium transition-colors hover:border-current"
            style={{ color: '#3e5b34' }}
          >
            전체 카테고리
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {HOME_CATEGORIES.map((category) => (
            <CategoryTile key={category.value} category={category} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryTile({ category }: { category: HomeCategoryMeta }) {
  return (
    <Link
      href={`/clubs?category=${category.value}`}
      className="group relative flex flex-col overflow-hidden rounded-[18px] border text-inherit no-underline transition-[transform,box-shadow,border-color] duration-[250ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1 hover:border-[color:var(--accent)] hover:shadow-[0_16px_32px_rgba(47,58,46,.08),0_2px_6px_rgba(47,58,46,.04)]"
      style={{
        background: '#ffffff',
        borderColor: '#d9d4c3',
        ['--accent' as string]: category.accent,
      }}
    >
      <div
        className="relative overflow-hidden border-b"
        style={{ height: 170, borderColor: '#e6e1d2', background: category.fallbackBg }}
      >
        <Image
          src={category.imageSrc}
          alt={category.label}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover transition-transform duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-105"
        />
        <span
          className="absolute left-3.5 top-3 z-20 rounded-full px-[9px] py-1 font-mono text-[10px] font-semibold"
          style={{
            background: 'rgba(255,255,255,.86)',
            color: category.accent,
            letterSpacing: '.12em',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            boxShadow: '0 1px 2px rgba(0,0,0,.06)',
          }}
        >
          {category.index}
        </span>
        <span
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,.18) 100%)',
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-[18px] py-4">
        <div className="flex flex-col gap-[3px]">
          <span
            className="text-[16.5px] font-bold leading-tight"
            style={{ color: '#2c4124', letterSpacing: '-0.015em' }}
          >
            {category.label}
          </span>
          <span
            className="flex items-center gap-1.5 font-mono text-[11.5px]"
            style={{ color: '#8a8f83' }}
          >
            <span
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: category.accent }}
            />
            둘러보기
          </span>
        </div>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-[250ms] group-hover:-rotate-45 group-hover:border-[color:var(--accent)] group-hover:bg-[color:var(--accent)] group-hover:text-white"
          style={{ borderColor: '#d9d4c3', color: '#4a5247' }}
        >
          <svg viewBox="0 0 12 12" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9L9 3M4 3h5v5" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step C2-2: 렌더 테스트 작성**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/test/home/categories-render.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

import { Categories } from '../../app/_components/sections/Categories';

describe('Categories', () => {
  it('8개 카테고리 라벨이 모두 렌더된다', () => {
    render(<Categories />);

    for (const label of ['학술', '문화', '예술', '운동', '봉사', '종교', '취미', '기타']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('각 카테고리 링크가 enum 값을 URL 쿼리로 사용한다', () => {
    render(<Categories />);

    const expected = [
      '/clubs?category=ACADEMIC',
      '/clubs?category=CULTURE',
      '/clubs?category=ART',
      '/clubs?category=SPORTS',
      '/clubs?category=VOLUNTEER',
      '/clubs?category=RELIGION',
      '/clubs?category=HOBBY',
      '/clubs?category=OTHER',
    ];
    for (const href of expected) {
      expect(screen.getByRole('link', { name: new RegExp(href.split('=')[1]!, 'i') })
              ?? document.querySelector(`a[href="${href}"]`)).toBeTruthy();
    }
  });
});
```

> `screen.getByRole('link', { name: ... })` 가 카테고리 한글 라벨에 매칭되지 않으면 `document.querySelector` 폴백으로 href 직접 확인.

- [ ] **Step C2-3: 테스트 실행 → 성공 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web test --run test/home/categories-render.test.tsx 2>&1 | tail -15
```

Expected: 2 tests PASS.

- [ ] **Step C2-4: typecheck + 전체 회귀**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web typecheck && pnpm -F web test --run 2>&1 | tail -10
```

- [ ] **Step C2-5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add frontend/apps/web/app/_components/sections/Categories.tsx \
        frontend/apps/web/test/home/categories-render.test.tsx && \
git commit -m "feat(frontend): 홈 Categories 를 ClubCategory enum 8개로 정합화 — URL = enum 값"
```

## Task C3: `HomeHero` 추천 검색어 갱신

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/HomeHero.tsx`

- [ ] **Step C3-1: 상수만 갱신**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/_components/sections/HomeHero.tsx` 의 `SUGGESTED_QUERIES` 정의 (라인 6-12) 를 다음으로 교체:

```ts
const SUGGESTED_QUERIES: ReadonlyArray<string> = [
  '개발',
  '공모전',
  '봉사',
  '축구',
  '창업',
];
```

다른 부분은 건드리지 않는다.

- [ ] **Step C3-2: typecheck + 회귀**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web typecheck && pnpm -F web test --run 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step C3-3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add frontend/apps/web/app/_components/sections/HomeHero.tsx && \
git commit -m "feat(frontend): HomeHero 추천 검색어를 도메인 관심 키워드 5개로 갱신"
```

## Task C4: `_mocks.ts` 에서 `landingCategories` 제거

**Files:**
- Modify: `frontend/apps/web/app/_mocks.ts`

- [ ] **Step C4-1: 제거 대상 식별 + 잔존 import 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
grep -rn "landingCategories\|LandingCategory" frontend/apps/web --include="*.ts" --include="*.tsx" | grep -v _mocks.ts
```

Expected: 빈 결과 (Categories.tsx 가 이미 C2 에서 import 제거됨).

만약 결과가 있다면 그곳도 수정해야 한다.

- [ ] **Step C4-2: 파일에서 export 제거**

`/Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/_mocks.ts` 에서:
- `export type LandingCategory = { ... }` 블록 제거
- `export const landingCategories: LandingCategory[] = [ ... ]` 블록 제거

`landingBanners` / `LandingBanner` 는 유지 (BannerCarousel 이 사용).

- [ ] **Step C4-3: typecheck + 테스트**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web typecheck && pnpm -F web test --run 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step C4-4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add frontend/apps/web/app/_mocks.ts && \
git commit -m "chore(frontend): _mocks 에서 landingCategories 제거"
```

## Task C5: 수동 검증 + Push + PR-C 생성

- [ ] **Step C5-1: dev server 기동**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -F web dev
```

브라우저 (`http://localhost:3000`) 에서 확인:
- HomeHero 의 추천 검색어가 `개발 / 공모전 / 봉사 / 축구 / 창업` 5개로 표시
- 추천 검색어 클릭 → `/clubs?q=<키워드>` 로 이동
- Categories 영역에 8개 (학술/문화/예술/운동/봉사/종교/취미/기타) 타일 노출
- 각 타일 클릭 → `/clubs?category=ACADEMIC` 같은 enum 값 URL 로 이동, 탐색 페이지 카테고리 필터가 자동 매칭

Ctrl+C 로 종료.

- [ ] **Step C5-2: push**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git push -u origin feat/home-categories-and-hero-queries
```

- [ ] **Step C5-3: PR 생성**

```bash
gh pr create --base develop --title "feat(frontend): 홈 Categories + HomeHero 추천 검색어 mock 제거" --body "$(cat <<'EOF'
## 🚀 작업 내용
홈 `/` 의 두 가지 mock 의존을 한 번에 정리했다.

- **Categories** — 기존 mock 의 8개 분류(학술/음악/운동/IT/공연/봉사/문화/창업) 가 실제 `ClubCategory` enum 8개(학술/문화/예술/운동/봉사/종교/취미/기타) 와 불일치해 클릭 시 탐색 페이지에서 매칭이 안 되는 데드 링크였다. 이를 `HOME_CATEGORIES` 정적 상수로 교체. URL 은 enum 값을 그대로 사용해 `/clubs?category=ACADEMIC` 형식이 탐색 페이지의 카테고리 필터와 1:1 연결된다. 카테고리별 카운트는 미표시 (불필요한 API 증설 회피).
- **HomeHero 추천 검색어** — 기존 5개 키워드 (`주니어 개발자` / `K-pop 댄스` / `투자 스터디` / `산악회` / `그림 그리기`) 를 사용자 빈도 높은 일반 키워드 (`개발` / `공모전` / `봉사` / `축구` / `창업`) 로 교체.

역할은 명확히 분리한다 — Categories 는 도메인 분류 체계(enum 8개), 추천 검색어는 편집자 큐레이션 키워드.

## 🤔 고민했던 내용
이미지 매핑이 약간 어긋난다 (예: "예술" 카테고리에 옛 "음악" 이미지). 새 enum 분류에 맞춰 디자이너 작업으로 8장 이미지를 재제작하는 게 정합이지만 본 라운드 범위 밖 — 임시 매핑으로 기능 정합부터 가져갔다. 후속 라운드에서 디자인 작업 권장.

기존 mock URL 은 한글이라 (`/clubs?category=음악`) 사실상 동작 안 함. 즉 데드 링크 fix 이기도 하다.

## 💬 리뷰 중점사항
- HOME_CATEGORIES 와 ClubCategory enum 의 1:1 정합 (테스트로 잠금)
- Categories 타일 클릭 → 탐색 페이지 카테고리 필터가 즉시 매칭되는 동작 (수동 확인)
- 이미지 매핑의 임시성 (디자이너 후속 작업 필요) 이 PR 본문에 잘 드러나는지
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- §3 POPULAR 정의 4-tier → Task A4 case POPULAR. ✅
- §3 `@SQLRestriction` 가정 검증 → Task A3 의 `softDeletedApplicationsAreExcludedFromCount` + Task A4-4 SQL 로그 확인. ✅
- §4 API 명세 (sort POPULAR 추가 + Swagger) → Task A2. ✅
- §5-1 Backend 변경 파일 4개 → Task A1·A2·A4 (test 는 A3). ✅
- §5-2 FeaturedClubs / RecruitmentTicker → Task B3·B4. ✅
- §5-2-3 _mocks 정리 (featuredClubs / recruitmentTickers) → Task B5. ✅
- §5-3-1 Categories + homeCategories.ts → Task C1·C2. ✅
- §5-3-2 SUGGESTED_QUERIES → Task C3. ✅
- §5-3-3 _mocks 정리 (landingCategories) → Task C4. ✅
- §6 테스트 케이스: BE 7개 (Task A3), FE `computeDday` (Task B1), `FeaturedClubs` 4건/0건 (B3), `RecruitmentTicker` 필터/0건 (B4), `HOME_CATEGORIES` 정합 (C1), Categories 렌더 (C2). ✅
- §7 PR 분할 (3개) → Task A5 / B6 / C5. ✅

**2. Placeholder scan:** TODO_PR_NUMBER 1건 (PR-B 본문 → 머지된 PR-A 번호 참조). 의도된 자리표시자. 다른 placeholder 없음.

**3. Type consistency:**
- `ClubSummary.activeRecruitment?.endDate` 타입 — `string | null`. ✅
- `HomeCategoryMeta.value: ClubCategory` ↔ URL `/clubs?category=${value}` 일관. ✅
- `fetchPopularClubs` / `fetchUpcomingDeadlineClubs` 시그니처 → 호출부와 일치. ✅
- `computeDday(endDate: string, today: Date): string` → B4 에서 동일 시그니처 호출. ✅

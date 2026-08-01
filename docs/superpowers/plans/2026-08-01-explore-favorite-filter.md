# 탐색 탭 찜한 동아리 필터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/v1/clubs?favorite=true` 서버 필터와 탐색 탭 "찜한 동아리" 토글 칩을 추가한다.

**Architecture:** BE 는 기존 QueryDSL null-무시 predicate 배열에 exists 서브쿼리 하나를 추가하고, permitAll 목록 엔드포인트에 nullable `UserPrincipal` 을 도입해 미인증+`favorite=true` 를 401 로 거른다. FE 는 URL query 기반 `ExploreParams` 에 `favorite` boolean 을 추가하고, 비로그인 상태에서는 요청 자체를 게이트(쿼리 미발행)한다. 스펙: `docs/superpowers/specs/2026-08-01-explore-favorite-filter-design.md`

**Tech Stack:** Spring Boot 3.4 / QueryDSL / RestAssured+Testcontainers · Next.js 15 / TanStack Query / vitest

## Global Constraints

- 파라미터명은 전 구간 `favorite` 하나로 통일 (API 쿼리 · URL 키 · `ExploreParams` 필드)
- `favorite=false`/미지정 = **필터 미적용** ("찜 안 한 것만"이 아님)
- 커밋: Conventional Commits + 한국어, `대상 — 변경점` 명사구. **Co-Authored-By/🤖 Generated 라인 절대 금지**
- **push · PR 생성 금지** — 오케스트레이터가 리뷰 통과 후 수행한다
- BE 테스트: RestAssured + Testcontainers(Docker 필요), `@DisplayName` 은 요구사항 문장. 실행 cwd 는 `backend/`
- FE: `any`/`as` 금지, `type` 사용(`interface` 금지), 서버 상태는 TanStack Query. 실행 cwd 는 `frontend/`
- 빌드/테스트 출력에 `| tail` 파이프 금지 (exit code 가림) — 출력에서 성공 문구를 직접 확인
- PR-1(BE) 브랜치: `feat/club-favorite-filter` (스펙 커밋 포함, 이미 존재) / PR-2(FE) 브랜치: `feat/club-favorite-filter-ui` (develop 분기)
- 릴리스 순서: PR-1 머지·배포 후 PR-2 (FE 선배포 시 기존 BE 가 파라미터를 무시해 필터 없는 전체 목록 노출)

---

## PR-1 — 백엔드 (`feat/club-favorite-filter`)

### Task 1: 검색 조건 `favoriteUserId` + QueryDSL `favoritedBy` predicate

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java`
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java:55-65`
- Modify(컴파일 유지 — 생성자 11번째 인자 `null` 추가): `backend/src/main/java/com/duing/domain/club/controller/ClubController.java:55-57`, `backend/src/test/java/com/duing/domain/club/repository/ClubRepositoryImplKeywordSearchTest.java:104`, `backend/src/test/java/com/duing/domain/club/service/ClubSearchPopularSortTest.java:129,191`, `backend/src/test/java/com/duing/domain/club/service/ClubSearchTagsRecruitingTest.java:43,64`, `backend/src/test/java/com/duing/domain/club/service/ClubSearchStatusFilterTest.java:35`, `backend/src/test/java/com/duing/domain/club/service/ClubSearchActiveDaysTest.java:36,55,76,86,102,123`
- Test: `backend/src/test/java/com/duing/domain/club/repository/ClubRepositoryImplFavoriteFilterTest.java` (신규)

**Interfaces:**
- Produces: `ClubSearchCondition` 마지막 컴포넌트 `Long favoriteUserId` (null=필터 미적용). Task 2 의 컨트롤러가 이 값을 채운다.

- [ ] **Step 1: 실패하는 테스트 작성**

`ClubRepositoryImplFavoriteFilterTest.java` 신규 (리포지토리 레벨 — `ClubRepositoryImplKeywordSearchTest` 선례):

```java
package com.duing.domain.club.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubRepositoryImplFavoriteFilterTest extends IntegrationTestBase {

    @Autowired ClubRepository clubRepository;
    @Autowired ClubFavoriteRepository clubFavoriteRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("favoriteUserId 를 지정하면 해당 사용자가 찜한 동아리만 반환된다")
    void favoriteFilterReturnsOnlyFavoritedClubs() throws Exception {
        User student = saveStudent("찜필터학생");
        Club favorited = saveActiveClub("찜한클럽", ClubCategory.ACADEMIC);
        Club notFavorited = saveActiveClub("안찜한클럽", ClubCategory.ACADEMIC);
        clubFavoriteRepository.save(ClubFavorite.create(student, favorited));

        Page<Club> result = clubRepository.findByCondition(
                favoriteCondition(student.getId(), null), PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Club::getId)
                .containsExactly(favorited.getId())
                .doesNotContain(notFavorited.getId());
        assertThat(result.getTotalElements()).isEqualTo(1);
    }

    @Test
    @DisplayName("찜 필터는 카테고리 필터와 조합되어 교집합만 반환된다")
    void favoriteFilterCombinesWithCategory() throws Exception {
        User student = saveStudent("조합학생");
        Club academicFavorited = saveActiveClub("학술찜", ClubCategory.ACADEMIC);
        Club sportsFavorited = saveActiveClub("운동찜", ClubCategory.SPORTS);
        clubFavoriteRepository.save(ClubFavorite.create(student, academicFavorited));
        clubFavoriteRepository.save(ClubFavorite.create(student, sportsFavorited));

        Page<Club> result = clubRepository.findByCondition(
                favoriteCondition(student.getId(), ClubCategory.ACADEMIC), PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Club::getId)
                .containsExactly(academicFavorited.getId());
        assertThat(result.getTotalElements()).isEqualTo(1);
    }

    @Test
    @DisplayName("해제(soft-delete)된 찜은 찜 필터 결과에서 제외된다")
    void softDeletedFavoriteIsExcluded() throws Exception {
        User student = saveStudent("해제학생");
        Club onceFavorited = saveActiveClub("해제된클럽", ClubCategory.ACADEMIC);
        ClubFavorite favorite = clubFavoriteRepository.save(ClubFavorite.create(student, onceFavorited));

        clubFavoriteRepository.delete(favorite);   // @SQLDelete — deleted_at 스탬프
        clubFavoriteRepository.flush();

        Page<Club> result = clubRepository.findByCondition(
                favoriteCondition(student.getId(), null), PageRequest.of(0, 20));

        assertThat(result.getContent()).isEmpty();
        assertThat(result.getTotalElements()).isZero();
    }

    @Test
    @DisplayName("다른 사용자의 찜은 내 찜 필터 결과에 섞이지 않는다")
    void otherUsersFavoritesAreNotIncluded() throws Exception {
        User me = saveStudent("본인");
        User other = saveStudent("타인");
        Club otherFavorited = saveActiveClub("타인찜클럽", ClubCategory.ACADEMIC);
        clubFavoriteRepository.save(ClubFavorite.create(other, otherFavorited));

        Page<Club> result = clubRepository.findByCondition(
                favoriteCondition(me.getId(), null), PageRequest.of(0, 20));

        assertThat(result.getContent()).isEmpty();
    }

    @Test
    @DisplayName("favoriteUserId 가 null 이면 찜 필터가 적용되지 않고 전체가 반환된다")
    void nullFavoriteUserIdDisablesFilter() throws Exception {
        User student = saveStudent("널학생");
        Club favorited = saveActiveClub("널찜", ClubCategory.ACADEMIC);
        Club notFavorited = saveActiveClub("널안찜", ClubCategory.ACADEMIC);
        clubFavoriteRepository.save(ClubFavorite.create(student, favorited));

        Page<Club> result = clubRepository.findByCondition(
                favoriteCondition(null, null), PageRequest.of(0, 100));

        // 다른 테스트가 커밋한 데이터가 공존할 수 있어 정확한 개수 대신 포함 여부만 단언한다.
        assertThat(result.getContent()).extracting(Club::getId)
                .contains(favorited.getId(), notFavorited.getId());
    }

    private ClubSearchCondition favoriteCondition(Long favoriteUserId, ClubCategory category) {
        return new ClubSearchCondition(
                category, null, null, null, null, null, null, null, null, null, favoriteUserId);
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
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

    private Club saveActiveClub(String name, ClubCategory category) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, category, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run (cwd `backend/`): `./gradlew test --tests 'com.duing.domain.club.repository.ClubRepositoryImplFavoriteFilterTest'`
Expected: **컴파일 실패** — `ClubSearchCondition` 에 11번째 컴포넌트가 없음

- [ ] **Step 3: 구현**

`ClubSearchCondition.java` — 마지막 컴포넌트 추가:

```java
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
        ClubSortOption sortOption,
        /** 이 사용자가 찜한 동아리만 통과. null = 필터 미적용. */
        Long favoriteUserId
) {
```

`ClubRepositoryImpl.java` — `findByCondition` 의 predicates 배열 마지막에 추가:

```java
                activeDaysOverlap(condition.effectiveActiveDays()),
                favoritedBy(condition.favoriteUserId()),
        };
```

같은 클래스 하단(다른 `private BooleanExpression` 헬퍼들 옆)에 추가 — `clubFavorite` static import(:6)와 `JPAExpressions` import(:29)는 이미 있다:

```java
    /**
     * 요청 사용자가 찜한 동아리만 통과시키는 exists 서브쿼리. null 이면 필터 미적용.
     * ClubFavorite 의 @SQLRestriction(deleted_at IS NULL) 이 서브쿼리에도 적용되어
     * 해제(soft-delete)된 찜은 자동 제외된다 — 별도 deletedAt 조건을 중복으로 두지 않는다.
     */
    private BooleanExpression favoritedBy(Long userId) {
        if (userId == null) {
            return null;
        }
        return JPAExpressions.selectOne()
                .from(clubFavorite)
                .where(clubFavorite.club.eq(club), clubFavorite.user.id.eq(userId))
                .exists();
    }
```

**컴파일 유지** — Files 목록의 기존 `new ClubSearchCondition(...)` 호출부 전부에 11번째 인자 `null` 을 추가한다. `ClubController.java:55-57` 도 일단 `null` (Task 2 에서 실값으로 교체):

```java
        ClubSearchCondition condition = new ClubSearchCondition(
                category, division, keyword, tags, recruiting, recruitmentStatus,
                centralClub, college, activeDaysSet, sort, null);
```

- [ ] **Step 4: 테스트 통과 확인**

Run (cwd `backend/`): `./gradlew test --tests 'com.duing.domain.club.repository.ClubRepositoryImplFavoriteFilterTest'`
Expected: PASS (5 tests). 이어서 컴파일 영향 확인: `./gradlew compileJava compileTestJava` → BUILD SUCCESSFUL

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club backend/src/test/java/com/duing/domain/club
git commit -m "feat(backend): 동아리 검색 찜 필터 조건 — favoriteUserId exists 서브쿼리"
```

---

### Task 2: `GET /clubs?favorite=true` 파라미터 + 미인증 401

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java:35-49`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/ClubController.java:40-61`
- Test: `backend/src/test/java/com/duing/domain/club/controller/ClubSearchFavoriteFilterTest.java` (신규)

**Interfaces:**
- Consumes: Task 1 의 `ClubSearchCondition.favoriteUserId`
- Produces: `GET /api/v1/clubs?favorite=true` — 인증 시 내 찜만, 미인증 시 401 `{ok:false, message:"인증이 필요합니다."}`

- [ ] **Step 1: 실패하는 테스트 작성**

`ClubSearchFavoriteFilterTest.java` 신규 (`FavoriteControllerTest` 의 인증·픽스처 패턴):

```java
package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubSearchFavoriteFilterTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User student;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        student = saveStudent("찜검색학생");
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("비로그인 요청이 favorite=true 를 지정하면 401 을 반환한다")
    void anonymousFavoriteFilterReturns401() {
        RestAssured.given()
                .when().get("/api/v1/clubs?favorite=true")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("비로그인 요청의 favorite=false 는 필터 미적용으로 200 을 반환한다")
    void anonymousFavoriteFalseReturns200() {
        RestAssured.given()
                .when().get("/api/v1/clubs?favorite=false")
                .then().statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true));
    }

    @Test
    @DisplayName("로그인 사용자의 찜이 없으면 200 과 빈 목록을 반환한다")
    void authenticatedWithNoFavoritesReturnsEmptyList() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/clubs?favorite=true")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(0));
    }

    @Test
    @DisplayName("favorite=true 는 내가 찜한 동아리만 반환한다")
    void favoriteFilterReturnsOnlyMyFavorites() throws Exception {
        Club favorited = saveActiveClub("컨트롤러찜클럽");
        Club notFavorited = saveActiveClub("컨트롤러안찜클럽");
        addFavorite(favorited.getId());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/clubs?favorite=true")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(1))
                .body("data.content.name", hasItem(favorited.getName()))
                .body("data.content.name", not(hasItem(notFavorited.getName())));
    }

    @Test
    @DisplayName("favorite 미지정이면 찜 여부와 무관하게 전체가 반환된다")
    void withoutFavoriteParamReturnsAll() throws Exception {
        Club favorited = saveActiveClub("전체찜클럽");
        Club notFavorited = saveActiveClub("전체안찜클럽");
        addFavorite(favorited.getId());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/clubs?keyword=클럽")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(favorited.getName()))
                .body("data.content.name", hasItem(notFavorited.getName()));
    }

    private void addFavorite(Long clubId) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().post("/api/v1/me/favorites/{clubId}", clubId)
                .then().statusCode(HttpStatus.CREATED.value());
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
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
        Club created = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
```

주의: 이 테스트 클래스는 `@Transactional` 을 붙이지 않는다(RestAssured 는 별도 커넥션). `favorite=true` 응답 단언은 신규 사용자 기준이라 다른 테스트가 커밋한 동아리와 격리된다. `keyword=클럽` 단언은 `hasItem` 포함 여부만 본다.

- [ ] **Step 2: 실패 확인**

Run (cwd `backend/`): `./gradlew test --tests 'com.duing.domain.club.controller.ClubSearchFavoriteFilterTest'`
Expected: FAIL — `anonymousFavoriteFilterReturns401` 등이 200 반환(파라미터 미구현으로 무시됨)

- [ ] **Step 3: 구현**

`ClubApi.java` — `getClubs` 시그니처에 두 파라미터 추가 (`sort` 파라미터와 `pageable` 사이). 인터페이스와 구현 시그니처는 반드시 함께 맞춘다:

```java
            @Parameter(description = "true=요청 사용자가 찜한 동아리만. 로그인 필요 — 미인증 요청은 401. false/미지정=필터 미적용.")
            @RequestParam(required = false) Boolean favorite,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) Pageable pageable
```

`ClubController.java` — `getClubs` 시그니처를 인터페이스와 같은 순서로 맞추고 본문 교체:

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
            @RequestParam(required = false) Boolean favorite,
            @AuthenticationPrincipal UserPrincipal currentUser,
            Pageable pageable
    ) {
        boolean favoriteOnly = Boolean.TRUE.equals(favorite);
        if (favoriteOnly && currentUser == null) {
            // 찜 필터의 기준은 "요청 사용자의 찜" — 비로그인은 기준이 없다. 빈 목록으로 얼버무리면
            // "찜 0건(200)"과 구분이 안 되므로 401 로 구분한다. 기존 핸들러(handleAuthentication)가
            // AuthenticationException 계열을 401 로 변환한다 — 새 에러코드는 만들지 않는다.
            throw new InsufficientAuthenticationException("찜한 동아리 필터는 로그인이 필요합니다.");
        }
        Long favoriteUserId = favoriteOnly ? currentUser.id() : null;
        Set<DayOfWeek> activeDaysSet = activeDays == null ? null : Set.copyOf(activeDays);
        ClubSearchCondition condition = new ClubSearchCondition(
                category, division, keyword, tags, recruiting, recruitmentStatus,
                centralClub, college, activeDaysSet, sort, favoriteUserId);
        Page<ClubSummaryResponse> page = clubService.search(condition, pageable)
                .map(ClubSummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }
```

import 추가: `org.springframework.security.authentication.InsufficientAuthenticationException`

- [ ] **Step 4: 테스트 통과 확인**

Run (cwd `backend/`): `./gradlew test --tests 'com.duing.domain.club.controller.ClubSearchFavoriteFilterTest' --tests 'com.duing.domain.club.controller.ClubSearchControllerTest'`
Expected: PASS (신규 5 + 기존 회귀)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club backend/src/test/java/com/duing/domain/club
git commit -m "feat(backend): 동아리 목록 찜 필터 — favorite 파라미터·미인증 401"
```

---

### Task 3: 백엔드 전체 검증

- [ ] **Step 1: 전체 테스트**

Run (cwd `backend/`): `./gradlew test`
Expected: BUILD SUCCESSFUL — 출력에서 직접 확인 (`| tail` 금지)

- [ ] **Step 2: 오케스트레이터 인계**

리뷰(spec + quality) 통과 후 오케스트레이터가 push·PR 생성. PR 제목: `feat(backend): 동아리 목록 찜 필터 — favorite 파라미터·미인증 401`

---

## PR-2 — 프론트엔드 (`feat/club-favorite-filter-ui`, develop 분기)

> 시작 전: `git checkout develop && git checkout -b feat/club-favorite-filter-ui`
> 로컬 QA 시 백엔드는 `feat/club-favorite-filter` 브랜치로 구동해야 `favorite` 파라미터가 동작한다.

### Task 4: `ExploreParams.favorite` + 직렬화/변환 + 단위 테스트

**Files:**
- Modify: `frontend/packages/types/src/club.ts:115-128` (`ClubSearchParams`)
- Modify: `frontend/apps/web/app/clubs/_lib/exploreParams.ts`
- Test: `frontend/apps/web/test/clubs/explore-params.test.ts` (기존 파일에 추가)

**Interfaces:**
- Produces: `ExploreParams.favorite: boolean`(기본 false) · URL 키 `favorite`(true 만 직렬화) · `toApiParams` 가 true 일 때만 `favorite: true` 전달 · `hasNonFavoriteFilters(params): boolean` (Task 5 의 빈 상태 분기가 사용)

- [ ] **Step 1: 실패하는 테스트 작성**

`explore-params.test.ts` 말미에 추가:

```ts
describe('exploreParams — favorite 필터', () => {
  it('favorite=true 는 URL 직렬화 후 다시 true 로 파싱된다', () => {
    const query = serializeExploreParams({ ...DEFAULT_EXPLORE_PARAMS, favorite: true });
    const parsed = parseExploreParams(new URLSearchParams(query));
    expect(parsed.favorite).toBe(true);
  });

  it('기본값(false)은 URL 에서 생략된다', () => {
    const query = serializeExploreParams({ ...DEFAULT_EXPLORE_PARAMS });
    expect(query).not.toContain('favorite');
  });

  it("URL 의 favorite=1 같은 비정규 값은 false 로 파싱된다", () => {
    const parsed = parseExploreParams(new URLSearchParams('favorite=1'));
    expect(parsed.favorite).toBe(false);
  });

  it('favorite=true → API favorite=true 전송', () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, favorite: true }, 20);
    expect(api.favorite).toBe(true);
  });

  it('favorite=false → API favorite 미전송', () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS }, 20);
    expect(api.favorite).toBeUndefined();
  });
});

describe('exploreParams — hasNonFavoriteFilters', () => {
  it('모든 필터가 기본값이면 false — favorite·page·sort 는 세지 않는다', () => {
    expect(
      hasNonFavoriteFilters({ ...DEFAULT_EXPLORE_PARAMS, favorite: true, page: 3, sort: 'ALPHABETICAL' }),
    ).toBe(false);
  });

  it('카테고리가 걸려 있으면 true', () => {
    expect(hasNonFavoriteFilters({ ...DEFAULT_EXPLORE_PARAMS, category: 'SPORTS' })).toBe(true);
  });

  it('요일 7개 전체 선택은 필터 미적용으로 본다', () => {
    expect(
      hasNonFavoriteFilters({
        ...DEFAULT_EXPLORE_PARAMS,
        activeDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      }),
    ).toBe(false);
  });

  it('요일이 일부만 선택되면 true', () => {
    expect(hasNonFavoriteFilters({ ...DEFAULT_EXPLORE_PARAMS, activeDays: ['MONDAY'] })).toBe(true);
  });
});
```

import 문에 `hasNonFavoriteFilters` 추가.

- [ ] **Step 2: 실패 확인**

Run (cwd `frontend/`): `pnpm test -- explore-params`
Expected: FAIL — `favorite`/`hasNonFavoriteFilters` 미정의 (타입 에러)

- [ ] **Step 3: 구현**

`packages/types/src/club.ts` — `ClubSearchParams` 에 추가 (`activeDays` 다음 줄):

```ts
  favorite?: boolean;
```

`exploreParams.ts`:

1. `ExploreParams` 타입 — `sort` 와 `page` 사이:
```ts
  /** 찜한 동아리만 — 로그인 필요. 비로그인 딥링크는 페이지에서 쿼리를 게이트한다. */
  favorite: boolean;
```
2. `DEFAULT_EXPLORE_PARAMS` — `favorite: false,` (`sort` 다음)
3. `parseExploreParams` — `page` 파싱 앞에:
```ts
  const favorite = search.get('favorite') === 'true';
```
반환 객체에 `favorite` 추가.
4. `serializeExploreParams` — `sort` 와 `page` 사이:
```ts
  if (params.favorite) next.set('favorite', 'true');
```
5. `toApiParams` 반환 객체 — `sort` 다음:
```ts
    favorite: params.favorite || undefined,
```
6. 파일 말미에 신규 함수:
```ts
/**
 * favorite·page·sort 를 제외한 나머지 필터 중 하나라도 기본값이 아니면 true.
 * 찜 필터 빈 결과가 "찜이 없어서"인지 "조합 조건이 걸러서"인지 빈 상태 문구를 가른다.
 * 요일 전체(7개) 선택은 toApiParams 와 동일하게 필터 미적용으로 본다.
 */
export function hasNonFavoriteFilters(params: ExploreParams): boolean {
  return (
    params.scope !== '전체' ||
    params.division !== '전체' ||
    params.keyword !== '' ||
    params.recruitment !== 'all' ||
    params.college !== null ||
    params.category !== null ||
    (params.activeDays.length > 0 && params.activeDays.length < DAY_OF_WEEK.length)
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run (cwd `frontend/`): `pnpm test -- explore-params` → PASS. 이어서 `pnpm typecheck` — `DEFAULT_EXPLORE_PARAMS` 스프레드로 기존 테스트·페이지는 자동 호환.

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/types/src/club.ts frontend/apps/web/app/clubs/_lib/exploreParams.ts frontend/apps/web/test/clubs/explore-params.test.ts
git commit -m "feat(frontend): 탐색 URL 파라미터 favorite — 파싱·직렬화·API 변환·빈상태 판별 헬퍼"
```

---

### Task 5: 탐색 페이지 배선 — 칩·게이트·즉시 제거·페이지 보정·빈 상태

**Files:**
- Modify: `frontend/packages/hooks/src/clubs.ts:35-43` (`useClubListQuery` enabled 옵션)
- Modify: `frontend/packages/hooks/src/favorites.ts:67-70` (토글 onSettled 에 clubs 무효화)
- Modify: `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx`

**Interfaces:**
- Consumes: Task 4 의 `favorite`/`hasNonFavoriteFilters`, authStore `status: 'idle' | 'authenticated' | 'unauthenticated'`
- Produces: 사용자 가시 동작 전부 — 이 태스크가 PR-2 의 본체

- [ ] **Step 1: hooks 수정**

`packages/hooks/src/clubs.ts` — `useClubListQuery` 에 옵션 추가 (`useManagedClubsQuery` 와 동일 패턴):

```ts
export function useClubListQuery(params: ClubSearchParams = {}, options?: { enabled?: boolean }) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.list(params),
    queryFn: () => client.clubs.list(params),
    // 필터·페이지 변경 시 스켈레톤으로 리셋하지 않고 이전 목록을 유지한 채 갱신한다.
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}
```

`packages/hooks/src/favorites.ts` — `useFavoriteToggleMutation` 의 `onSettled` 에 한 줄 추가 + import:

```ts
import { clubQueryKeys } from './clubQueryKeys';
```
```ts
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.ids() });
      queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.all });
      // 동아리 목록은 찜에 의존한다(찜 필터 결과·POPULAR 정렬 tier) — 토글 후 재검증해
      // 총 개수·페이지 구성을 서버와 동기화한다. 활성 쿼리만 즉시 refetch 되므로 비용은 국소적.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
    },
```

- [ ] **Step 2: ClubExplorePage 수정**

**(a) import** — `useEffect` 를 react import 에 추가, `Link`(next/link) 추가, `hasNonFavoriteFilters` 를 exploreParams import 에 추가.

**(b) `Icon` 객체에 하트 추가** (`sliders` 다음):

```tsx
  heart: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
```

**(c) 쿼리 게이트** — `authStatus` 선언을 쿼리 위로 올리고 게이트 파생값과 함께 배선 (기존 :99-102 교체):

```tsx
  const authStatus = useAuthStore((state) => state.status);
  /** 찜 필터 + 비인증(idle 포함) — 쿼리를 보내지 않는다. 비로그인 401 은 전역 리프레시
      플로우를 깨우므로 요청 차단이 1차 방어다(스펙 §비로그인 처리). */
  const requiresLoginForFavorite = params.favorite && authStatus !== 'authenticated';
  const clubListQuery = useClubListQuery(toApiParams(params, PAGE_SIZE), {
    enabled: !requiresLoginForFavorite,
  });
  const favoriteIdsQuery = useFavoriteIdsQuery();
  const favoriteToggle = useFavoriteToggleMutation();
```

**(d) visibleClubs 교차** (기존 :106-109 교체):

```tsx
  const visibleClubs = useMemo(() => {
    const clubs = (clubListQuery.data?.content ?? []).map(summaryToClub);
    // 찜 필터 중엔 낙관적 ids 캐시와 교차해 찜 해제 카드를 재요청 없이 즉시 제거한다.
    // ids 미로딩(undefined) 동안은 교차하지 않는다 — 빈 Set 교차는 전체를 지워 화면이 번쩍인다.
    if (!params.favorite || favoriteIdsQuery.data === undefined) return clubs;
    return clubs.filter((clubItem) => likedIds.has(clubItem.id));
  }, [clubListQuery.data, params.favorite, favoriteIdsQuery.data, likedIds]);
```

(`likedIds` useMemo 는 `visibleClubs` 보다 위에 있어야 한다 — 기존 :104 위치 유지)

**(e) 페이지 보정** — `updateParams` 선언 아래에:

```tsx
  // 마지막 페이지에서 찜 해제 등으로 총 페이지가 줄면 범위 밖 page 를 마지막 유효 페이지로 보정한다.
  // placeholder(이전 필터의 stale totalPages)로는 보정하지 않는다. totalPages 0(결과 없음)은
  // 빈 상태 렌더에 맡긴다.
  useEffect(() => {
    if (!clubListQuery.data || clubListQuery.isPlaceholderData) return;
    const knownTotalPages = clubListQuery.data.totalPages;
    if (knownTotalPages > 0 && params.page > knownTotalPages) {
      updateParams({ page: knownTotalPages });
    }
  }, [clubListQuery.data, clubListQuery.isPlaceholderData, params.page, updateParams]);
```

**(f) 핸들러 + 로그인 href** (`handleToggleLike` 아래):

```tsx
  /** 로그인 후 찜 필터가 켜진 채 돌아오도록 next 에 favorite=true 를 얹는다. */
  const favoriteLoginHref = useMemo(() => {
    const query = serializeExploreParams({ ...params, favorite: true });
    return toRoute(`/login?next=${encodeURIComponent(`/clubs?${query}`)}`);
  }, [params]);

  const handleFavoriteFilterToggle = () => {
    if (!params.favorite && authStatus !== 'authenticated') {
      router.push(favoriteLoginHref);
      return;
    }
    updateParams({ favorite: !params.favorite, page: 1 });
  };
```

**(g) 칩 배치 — 데스크탑**: 정렬 select 를 감싼 `<div className="flex items-center gap-3">`(기존 :391) 안, `<select>` 앞에:

```tsx
                <FavoriteFilterChip on={params.favorite} onClick={handleFavoriteFilterToggle} />
```

**(h) 칩 배치 — 모바일**: 필터 버튼을 감싼 `<div className="flex items-center gap-2">`(기존 :575) 안, 필터 버튼 앞에 동일 한 줄.

**(i) 목록 상태 렌더 — 데스크탑** (기존 :466-515 의 상태 블록): 전체를 게이트로 감싼다.

```tsx
            {requiresLoginForFavorite ? (
              authStatus === 'idle' ? (
                <div role="status" aria-busy="true" aria-label="동아리 목록 불러오는 중" className="animate-pulse motion-reduce:animate-none">
                  <ClubListSkeletonItems variant="grid" />
                </div>
              ) : (
                <FavoriteLoginPrompt loginHref={favoriteLoginHref} />
              )
            ) : (
              <>
                {/* 기존 isLoading / error / 빈 상태 / 그리드 / Pagination 블록 그대로 이동 */}
              </>
            )}
```

기존 빈 상태 한 줄(:478-480)은 분기로 교체:

```tsx
                {clubListQuery.data && visibleClubs.length === 0 && (
                  params.favorite && !hasNonFavoriteFilters(params) ? (
                    <FavoriteEmptyState onBrowse={() => updateParams({ favorite: false, page: 1 })} />
                  ) : (
                    <p className="text-sm text-charcoal-2">조건에 맞는 동아리가 없어요.</p>
                  )
                )}
```

**(j) 목록 상태 렌더 — 모바일** (기존 :605-644): 같은 게이트·같은 빈 상태 분기를 미러링 (`variant="list"` 스켈레톤).

**(k) 로컬 컴포넌트 3개** — 파일 하단 `MFilterGroup` 옆에:

```tsx
function FavoriteFilterChip({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors',
        on ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-charcoal-2',
      )}
    >
      <Icon.heart className={cn('h-3.5 w-3.5', on && 'text-coral')} />
      찜한 동아리
    </button>
  );
}

function FavoriteLoginPrompt({ loginHref }: { loginHref: ReturnType<typeof toRoute> }) {
  return (
    <div className="py-24 text-center">
      <p className="text-[14px] font-semibold text-charcoal-2">찜한 동아리를 보려면 로그인해 주세요.</p>
      <Link href={loginHref} className="btn btn-primary btn-sm mt-4 inline-flex">
        로그인하기
      </Link>
    </div>
  );
}

function FavoriteEmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="py-24 text-center">
      <p className="text-[14px] font-semibold text-charcoal-2">아직 찜한 동아리가 없어요.</p>
      <p className="mt-1.5 text-[13px] text-charcoal-3">관심 있는 동아리를 찜하고 쉽게 다시 찾아보세요.</p>
      <button type="button" onClick={onBrowse} className="btn btn-secondary btn-sm mt-4">
        동아리 둘러보기
      </button>
    </div>
  );
}
```

설계 결정(구현 시 유지): ① `초기화` 버튼은 favorite 도 함께 해제한다(`DEFAULT_EXPLORE_PARAMS` 스프레드가 자동 처리 — 별도 코드 불필요). ② favorite 칩은 데스크탑 `ActiveFilterChip` 행과 모바일 필터 개수 배지에 넣지 않는다(칩 자체가 상태 표시, 배지는 바텀시트 내부 필터 개수라는 현행 의미 유지). ③ 모바일 바텀시트에는 추가하지 않는다.

- [ ] **Step 3: 정적 검증**

Run (cwd `frontend/`): `pnpm lint && pnpm typecheck && pnpm test`
Expected: 전부 PASS (기존 테스트 회귀 없음)

- [ ] **Step 4: 커밋**

```bash
git add frontend/packages/hooks/src/clubs.ts frontend/packages/hooks/src/favorites.ts frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx
git commit -m "feat(frontend): 탐색 탭 찜한 동아리 필터 — 토글 칩·로그인 게이트·즉시 제거·페이지 보정·전용 빈 상태"
```

---

### Task 6: FE 전체 검증 + 실브라우저 QA

- [ ] **Step 1: 품질 게이트**

Run (cwd `frontend/`): `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 PASS — 출력에서 직접 확인

- [ ] **Step 2: 실브라우저 QA (:3000)**

백엔드를 `feat/club-favorite-filter` 브랜치로 구동한 뒤 dev 서버(:3000) 기동 — 로그는 파일 리다이렉트(파이프 금지), 종료 시 부모→워커→포트 순 kill.

체크리스트 (데스크탑 1280 · 모바일 390 양 레이아웃):
1. 칩 토글 → URL `?favorite=true` 반영, 목록이 찜한 동아리만으로 갱신, 해제 시 즉시 전체 복귀
2. 찜 필터 + 카테고리/모집상태/정렬 조합 동작, 페이지네이션 정상
3. 찜 필터 활성 상태에서 카드 하트로 찜 해제 → 카드 즉시 제거(재요청 대기 없음), 실패 시 복귀
4. **마지막 페이지에서 찜 해제** → 총 페이지 감소 시 마지막 유효 페이지로 보정, 빈 페이지 미노출
5. 찜 0건 로그인 계정 → 전용 빈 상태 문구 + [동아리 둘러보기] 동작. 찜 있음 + 조합 필터 0건 → 기존 문구
6. 비로그인 칩 클릭 → 네트워크 요청 없이 `/login?next=...` 이동, 로그인 후 필터 켜진 채 복귀
7. 비로그인 `/clubs?favorite=true` 직접 진입 → 요청 미발행(네트워크 탭 확인) + 로그인 안내 상태
8. 새로고침·뒤로가기 시 필터 유지, 스켈레톤과 실화면 레이아웃 어긋남 없음

- [ ] **Step 3: 오케스트레이터 인계**

리뷰 통과 + PR-1 머지 확인 후 오케스트레이터가 push·PR 생성. PR 제목: `feat(frontend): 탐색 탭 찜한 동아리 필터 — 토글 칩·로그인 게이트·전용 빈 상태`

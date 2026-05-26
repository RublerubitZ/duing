# `/clubs` 탐색 흐름 정비 (학생 영역 P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/clubs` 목록의 scope · division · college · sort 필터를 백엔드까지 일관 동작하도록 만들고, "과동아리" → "학과동아리" 명칭/식별자를 통일하며, "준비 중" placeholder 와 클라이언트 후처리에서 비롯되는 페이지네이션 정합성 깨짐을 제거한다.

**Architecture:** `Club.college` 컬럼 + 기존 `centralClub` boolean 결합으로 scope 모델링. `ClubSortOption` enum 으로 정렬 의도 가드. 학생 측 `GET /clubs` 파라미터에 `centralClub` / `college` / `sort` 를 추가하고, FE 는 URL params 가 곧 API params 가 되도록 위임. 명칭은 표시 레이어 전용으로 한국어 유지(`중앙동아리` / `학과동아리`), 식별자는 영문(`centralClub` / `college`) + 한국어 코드(`'중앙' | '학과'`) 일관.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL 5 / Flyway / Next.js 15 / React 19 / TanStack Query / Zod. 모노레포 — backend/, frontend/apps/web, frontend/packages/{api,hooks,types,schemas,stores}.

**PR 분리 (4 개, 의존 chain)**:
- PR-1 (BE): `Club.college` 컬럼 + 학생 검색 조건 확장
- PR-2 (BE): `ClubSortOption` enum + 정렬 분기
- PR-3 (FE): 어드민 콘솔의 단과대학 입력 추가 — PR-1 머지 후
- PR-4 (FE): `/clubs` 탐색 페이지 재구성 + 명칭 통일 — PR-1·PR-2 머지 후

---

## File Structure

### PR-1 영향 파일

**Create:**
- `backend/src/main/resources/db/migration/V33__alter_club_add_college.sql`
- `backend/src/test/java/com/duing/domain/club/controller/ClubSearchControllerTest.java`

**Modify:**
- `backend/src/main/java/com/duing/domain/club/entity/Club.java` — `college` 필드 + create/UpdatePayload/update 시그니처
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java` — `centralClub`, `college` 필드
- `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java` — `findByCondition` 에 `centralClubEq`, `collegeEq` BooleanExpression 추가
- `backend/src/main/java/com/duing/domain/club/api/ClubApi.java` — `getClubs` 파라미터 확장
- `backend/src/main/java/com/duing/domain/club/controller/ClubController.java` — 동일
- `backend/src/main/java/com/duing/domain/club/api/AdminClubApi.java` — `createClub` body 에 `college` 포함 (request DTO 가 처리)
- `backend/src/main/java/com/duing/domain/club/controller/dto/request/CreateClubRequest.java` — `College college` 필드
- `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java` — `College college` 필드 + `clearCollege` 플래그
- `backend/src/main/java/com/duing/domain/club/service/dto/command/CreateClubCommand.java`
- `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java`
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java` + `controller/dto/response/ClubDetailResponse.java` — `college` 노출
- `backend/src/main/java/com/duing/domain/club/service/dto/query/AdminClubSummaryQuery.java` + `controller/dto/response/AdminClubSummaryResponse.java` — `college` 노출
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSummaryQuery.java` + `controller/dto/response/ClubSummaryResponse.java` — `college` 노출 (목록에서 칩 표시 위해)
- 기존 테스트(`PromotionAcceptanceTest`, `ClubMemberCommandServiceTest` 등) 가 `Club.create` 시그니처 변경 영향을 받는다면 호출 사이트 업데이트

### PR-2 영향 파일

**Create:**
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSortOption.java`
- `backend/src/test/java/com/duing/domain/club/controller/ClubSearchSortTest.java`

**Modify:**
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java` — `sortOption` 추가
- `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java` — `findByCondition` 정렬 분기
- `backend/src/main/java/com/duing/domain/club/api/ClubApi.java` / `controller/ClubController.java` — `@RequestParam ClubSortOption sort`

### PR-3 영향 파일 (FE 어드민)

**Create:**
- `frontend/apps/web/app/_lib/college.ts` — College displayName 매핑

**Modify:**
- `frontend/packages/types/src/club.ts` — `College` string-literal union 신설, `Club` / `ClubDetail` 응답 타입에 `college: College | null` 추가
- `frontend/packages/types/src/admin.ts` — `AdminClubSummary`, `CreateClubPayload`, `UpdateClubPayload` 에 `college` 추가, `UpdateClubPayload` 는 `clearCollege` 플래그
- `frontend/apps/web/app/admin/clubs/new/_components/AdminClubCreateForm.tsx` — College 드롭다운
- `frontend/apps/web/app/admin/clubs/[clubId]/_components/AdminClubEditForm.tsx` (또는 동등 파일) — College 드롭다운 + 제거 버튼

### PR-4 영향 파일 (FE 학생)

**Modify:**
- `frontend/apps/web/app/clubs/_lib/exploreParams.ts` — `Scope = '전체' | '중앙' | '학과'`, `college`, `sort` 필드, `toApiParams` 매핑
- `frontend/apps/web/app/clubs/_lib/clubs.ts` — `ClubScope = '중앙' | '학과'`
- `frontend/apps/web/app/clubs/_lib/clubAdapter.ts` — `centralClub ? '중앙' : '학과'`
- `frontend/apps/web/app/_mocks.ts` — `scope` 필드 값 `'학과'` 로 정정
- `frontend/apps/web/app/clubs/_components/ClubCard.tsx` — 뱃지 라벨 `'학과'`
- `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx` — 후처리 제거, 단과대 칩 활성화, 정렬 드롭다운 활성화, view toggle 제거, "과동아리" → "학과동아리"
- `frontend/packages/api/src/client.ts` — `ClubSearchParams` 에 `centralClub`, `college`, `sort` 추가
- `frontend/packages/hooks/src/clubs.ts` — `useClubListQuery` 시그니처 영향(파라미터 타입만 변경, 동작 동일)

---

## PR-1: BE — `Club.college` 컬럼 + 학생 검색 조건 확장

### Task 1-1: Flyway V33 마이그레이션 추가

**Files:**
- Create: `backend/src/main/resources/db/migration/V33__alter_club_add_college.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- club: 학과동아리(centralClub=false) 의 소속 단과대학.
-- 중앙동아리(centralClub=true) 는 null.
-- 값은 user.College enum 코드 (예: 'IT_ENGINEERING') 와 동일하게 저장한다.
ALTER TABLE club ADD COLUMN college VARCHAR(40);

COMMENT ON COLUMN club.college IS
    '학과동아리의 소속 단과대학 (user.College enum 코드). 중앙동아리는 null.';
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/resources/db/migration/V33__alter_club_add_college.sql
git commit -m "feat(backend): add club.college column (V33)"
```

---

### Task 1-2: `Club` 엔티티에 `college` 필드 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`

- [ ] **Step 1: import 추가**

`import com.duing.domain.user.entity.College;` 를 다른 도메인 import 들과 함께 추가.

- [ ] **Step 2: 필드 선언**

`status` 필드 아래 (line 58 근방) 에 추가:

```java
@Enumerated(EnumType.STRING)
@Column(length = 40)
private College college;
```

- [ ] **Step 3: `create` 시그니처에 `college` 추가**

기존 `create` 메서드 마지막 파라미터로 `College college` 추가. builder 에도 `.college(college)` 라인 추가. 모든 호출 사이트가 깨질 수 있으므로 컴파일 한 번 돌려 확인.

```java
public static Club create(
        String name, ClubCategory category, String division, String description, String logoUrl,
        College college
) {
    return Club.builder()
            .name(name).category(category).division(division).description(description).logoUrl(logoUrl)
            .college(college)
            .status(ClubStatus.PENDING_APPROVAL)
            .tags(List.of()).snsLinks(List.of()).faqs(List.of()).highlights(List.of())
            .build();
}
```

(기존 builder defaults 는 그대로. 정확한 시그니처는 기존 `Club.java` 의 패턴 따라 정렬.)

- [ ] **Step 4: `UpdatePayload` record 에 `college`, `clearCollege` 추가**

기존 `UpdatePayload` 필드 끝에 `College college, Boolean clearCollege` 추가.

- [ ] **Step 5: `update()` 메서드 분기 추가**

기존 `update` 끝부분 `if (payload.activeDays() != null) ...` 같은 패턴 다음에:

```java
if (Boolean.TRUE.equals(payload.clearCollege())) {
    this.college = null;
} else if (payload.college() != null) {
    this.college = payload.college();
}
```

- [ ] **Step 6: 컴파일**

Run: `./gradlew compileJava`
Expected: 호출 사이트(주로 테스트) 에서 `Club.create(...)` 시그니처 mismatch 컴파일 에러. 이 시점에서는 메인만 통과하면 OK — 테스트 깨짐은 Task 1-8 에서 일괄 처리.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/entity/Club.java
git commit -m "feat(backend): add college field to Club entity"
```

---

### Task 1-3: `ClubSearchCondition` 확장 — `centralClub`, `college`

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java`

- [ ] **Step 1: import + 필드 추가**

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
        Boolean centralClub,
        College college
) {
    public boolean hasTags() {
        return tags != null && !tags.isEmpty();
    }

    public boolean recruitingOnly() {
        return Boolean.TRUE.equals(recruiting);
    }
}
```

- [ ] **Step 2: 컴파일 — 호출 사이트 확인**

Run: `./gradlew compileJava`
Expected: `GeneralClubService` 또는 컨트롤러에서 7개짜리 record 호출이 빠진 인자 때문에 에러. Task 1-5 에서 처리.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java
git commit -m "feat(backend): extend ClubSearchCondition with centralClub and college"
```

---

### Task 1-4: `ClubRepositoryImpl.findByCondition` 에 `centralClubEq` / `collegeEq` 적용

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java`

- [ ] **Step 1: import 추가**

`import com.duing.domain.user.entity.College;` 추가.

- [ ] **Step 2: 헬퍼 메서드 추가 (파일 하단의 다른 `*Eq` 헬퍼 옆)**

```java
private BooleanExpression centralClubEq(Boolean value) {
    return value == null ? null : club.centralClub.eq(value);
}

private BooleanExpression collegeEq(College value) {
    return value == null ? null : club.college.eq(value);
}
```

- [ ] **Step 3: `findByCondition` 의 `predicates` 배열에 두 호출 추가**

```java
BooleanExpression[] predicates = {
        club.status.eq(ClubStatus.ACTIVE),
        categoryEq(condition.category()),
        divisionEq(condition.division()),
        keywordContains(condition.keyword()),
        tagsOverlap(condition.tags()),
        hasActiveRecruitment(condition.recruitingOnly()),
        centralClubEq(condition.centralClub()),
        collegeEq(condition.college()),
};
```

- [ ] **Step 4: 컴파일**

Run: `./gradlew compileJava`
Expected: 메인 통과.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java
git commit -m "feat(backend): wire centralClub and college predicates into club search"
```

---

### Task 1-5: `GeneralClubService` 호출 사이트 + `ClubSearchCondition` 신규 생성 지점 갱신

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/ClubController.java`

- [ ] **Step 1: ClubController 가 ClubSearchCondition 생성을 직접 한다면, 새 파라미터로 6/7 번째 인자 채움**

`ClubController.java` 가 `new ClubSearchCondition(category, division, keyword, tags, recruiting)` 같은 패턴이면:

```java
ClubSearchCondition condition = new ClubSearchCondition(
        category, division, keyword, tags, recruiting,
        centralClub, college);
```

(아직 컨트롤러 파라미터는 추가 안 됐어도, 일단 변수로 받기 위해 메서드 시그니처에도 추가 — 다음 단계 Task 1-6 에서 마무리)

- [ ] **Step 2: GeneralClubService 가 직접 `new ClubSearchCondition(...)` 호출 안 한다면 skip**

`grep -n "new ClubSearchCondition" backend/src/main/java` 로 확인 후 모든 site 업데이트.

- [ ] **Step 3: 컴파일**

Run: `./gradlew compileJava`
Expected: 메인 통과 (Task 1-6 이전이라 컨트롤러 시그니처는 아직 좁다).

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java backend/src/main/java/com/duing/domain/club/controller/ClubController.java
git commit -m "feat(backend): pass centralClub/college through service to repository"
```

---

### Task 1-6: `ClubApi` / `ClubController` 의 `getClubs` 파라미터 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/ClubController.java`

- [ ] **Step 1: `ClubApi.getClubs` 시그니처 확장**

기존 시그니처 끝에 추가:

```java
@Parameter(description = "true=중앙동아리만, false=학과동아리만, 미지정=전체")
@RequestParam(required = false) Boolean centralClub,
@Parameter(description = "학과동아리의 단과대학 (College enum 코드)")
@RequestParam(required = false) College college,
```

(`import com.duing.domain.user.entity.College;` 추가)

- [ ] **Step 2: `ClubController.getClubs` 구현 매칭**

오버라이드 메서드 시그니처 동일하게 확장. 본문에서 `ClubSearchCondition` 생성 시 `centralClub`, `college` 전달.

- [ ] **Step 3: 수동 검증 (선택)**

Run: `./gradlew bootRun` 후 `curl 'http://localhost:8080/api/v1/clubs?centralClub=true' | jq` — 200 응답 + content array.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/api/ClubApi.java backend/src/main/java/com/duing/domain/club/controller/ClubController.java
git commit -m "feat(backend): expose centralClub and college as GET /clubs query params"
```

---

### Task 1-7: 어드민 등록/수정 — `CreateClubRequest` + `UpdateClubRequest` 에 `college` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/request/CreateClubRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/command/CreateClubCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java` — `create` / `update` 본문에서 `college` 흘려보냄

- [ ] **Step 1: CreateClubRequest 에 `College college` 필드 추가 (optional)**

`toCommand()` 가 `command` 에 `college` 를 흘리도록 갱신.

- [ ] **Step 2: UpdateClubRequest 에 `College college`, `Boolean clearCollege` 추가**

`toCommand(Long clubId, Long requesterId)` 가 `college`, `clearCollege` 를 command 에 흘리도록 갱신.

- [ ] **Step 3: CreateClubCommand / UpdateClubCommand record 에 동일 필드 추가**

- [ ] **Step 4: `GeneralClubService.create` 가 `Club.create(...)` 호출 시 `college` 전달**

- [ ] **Step 5: `GeneralClubService.update` 가 `UpdatePayload` 에 `college`, `clearCollege` 전달**

- [ ] **Step 6: 컴파일**

Run: `./gradlew compileJava`
Expected: 메인 통과.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/{controller/dto/request,service/dto/command,service}/{Create,Update}Club*.java backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java
git commit -m "feat(backend): accept college in admin club create/update requests"
```

---

### Task 1-8: 응답 DTO 들 (`ClubDetail`, `AdminClubSummary`, `ClubSummary`) 에 `college` 노출

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/AdminClubSummaryQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/AdminClubSummaryResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSummaryQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubSummaryResponse.java`

- [ ] **Step 1: 각 record 에 `College college` 필드 추가**

- [ ] **Step 2: 정적 팩토리(`from` / `of`) 들에서 `club.getCollege()` 매핑**

- [ ] **Step 3: 컴파일**

Run: `./gradlew compileJava`
Expected: 메인 통과.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/{service/dto/query,controller/dto/response}/*.java
git commit -m "feat(backend): expose college in club detail/summary responses"
```

---

### Task 1-9: 기존 테스트 호출 사이트 업데이트 (`Club.create`, `ClubSearchCondition`)

**Files:**
- Modify: 컴파일 에러가 발생한 모든 테스트 — 일반적으로 `Club.create(...)` / `new ClubSearchCondition(...)` 호출 사이트들

- [ ] **Step 1: 컴파일 에러 목록 수집**

Run: `./gradlew compileTestJava 2>&1 | grep "error:"`
Expected: 시그니처 mismatch 에러들.

- [ ] **Step 2: 각 호출 사이트에 `null` 또는 적절한 `College` 값 채우기**

- 기존 `Club.create(name, category, division, description, logoUrl)` → 마지막 인자 `null` (대부분 중앙동아리 fixture)
- 기존 `new ClubSearchCondition(category, division, keyword, tags, recruiting)` → 마지막 두 인자 `null, null`

- [ ] **Step 3: 테스트 전체 통과 확인**

Run: `./gradlew test`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test
git commit -m "test(backend): align existing tests with Club.create and ClubSearchCondition signature changes"
```

---

### Task 1-10: `ClubSearchControllerTest` 신규 — scope/college 매트릭스

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/controller/ClubSearchControllerTest.java`

- [ ] **Step 1: 실패하는 통합테스트 작성**

기존 `AdminClubsListControllerTest.java` 의 setUp / saveClubWithLeader / saveUser 패턴을 참고해 다음 3 케이스를 작성:

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
import com.duing.domain.user.entity.College;
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
class ClubSearchControllerTest {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("centralClub=true 면 중앙동아리만 반환된다")
    void centralOnlyFilter() throws Exception {
        Club central = saveActiveClub("중앙클럽", true, null);
        Club department = saveActiveClub("학과클럽", false, College.IT_ENGINEERING);

        RestAssured.given()
                .when().get("/api/v1/clubs?centralClub=true&keyword=클럽")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(central.getName()))
                .body("data.content.name", not(hasItem(department.getName())));
    }

    @Test
    @DisplayName("centralClub=false&college=IT_ENGINEERING 이면 해당 단과대 학과동아리만 반환된다")
    void departmentCollegeFilter() throws Exception {
        Club central = saveActiveClub("중앙클럽필터", true, null);
        Club itDept = saveActiveClub("IT학과클럽", false, College.IT_ENGINEERING);
        Club artDept = saveActiveClub("예술학과클럽", false, College.DESIGN_ART);

        RestAssured.given()
                .when().get("/api/v1/clubs?centralClub=false&college=IT_ENGINEERING&keyword=클럽")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(itDept.getName()))
                .body("data.content.name", not(hasItem(central.getName())))
                .body("data.content.name", not(hasItem(artDept.getName())));
    }

    @Test
    @DisplayName("centralClub 미지정이면 중앙·학과 모두 반환된다")
    void noScopeReturnsAll() throws Exception {
        Club central = saveActiveClub("중앙전체", true, null);
        Club department = saveActiveClub("학과전체", false, College.IT_ENGINEERING);

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=전체")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(central.getName()))
                .body("data.content.name", hasItem(department.getName()));
    }

    private Club saveActiveClub(String name, boolean centralClub, College college) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, college);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        Field centralField = Club.class.getDeclaredField("centralClub");
        centralField.setAccessible(true);
        centralField.set(created, centralClub);
        return clubRepository.save(created);
    }
}
```

- [ ] **Step 2: 테스트 실행 → 통과 확인**

Run: `./gradlew test --tests "com.duing.domain.club.controller.ClubSearchControllerTest"`
Expected: BUILD SUCCESSFUL (3 tests passed).

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/duing/domain/club/controller/ClubSearchControllerTest.java
git commit -m "test(backend): integration tests for centralClub and college search params"
```

---

### Task 1-11: PR-1 push + PR 생성

- [ ] **Step 1: 브랜치 push**

```bash
git push -u origin feat/club-college-and-scope-search-api
```

- [ ] **Step 2: PR 생성 (Conventional Commits 제목, Co-Authored-By 금지)**

Title: `feat(backend): Club.college 컬럼 + 학생 검색에 scope/college 파라미터 추가`

Body 골조:
- 🚀 작업 내용
- 🤔 고민했던 내용 (centralClub + college 결합 모델, null 처리)
- 💬 리뷰 중점사항 (V33 마이그레이션 안전성, 기존 테스트 호출 사이트 영향)
- 관련 이슈: spec docs/superpowers/specs/2026-05-24-student-clubs-explore-redesign-design.md

- [ ] **Step 3: CI green 확인 후 머지**

---

## PR-2: BE — `ClubSortOption` enum + 정렬 분기

### Task 2-1: `ClubSortOption` enum 작성

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSortOption.java`

- [ ] **Step 1: 파일 작성**

```java
package com.duing.domain.club.service.dto.query;

/**
 * 학생 측 GET /clubs 의 정렬 옵션 enum.
 * 자유 형태 Sort 문자열을 받지 않고 의도된 정렬만 허용하기 위해 enum 으로 가드한다.
 */
public enum ClubSortOption {
    /** 활성 모집의 마감일이 가까운 순. 모집 없는 동아리는 마지막. */
    DEADLINE_SOON,
    /** 등록일(createdAt) DESC. 기본값. */
    RECENT,
    /** 이름 가나다순 ASC. */
    ALPHABETICAL
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSortOption.java
git commit -m "feat(backend): introduce ClubSortOption enum"
```

---

### Task 2-2: `ClubSearchCondition` 에 `sortOption` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java`

- [ ] **Step 1: 필드 + helper 메서드 추가**

```java
public record ClubSearchCondition(
        ClubCategory category,
        String division,
        String keyword,
        List<String> tags,
        Boolean recruiting,
        Boolean centralClub,
        College college,
        ClubSortOption sortOption
) {
    public boolean hasTags() { ... }
    public boolean recruitingOnly() { ... }

    /** 미지정이면 RECENT 로 폴백. */
    public ClubSortOption sortOptionOrDefault() {
        return sortOption == null ? ClubSortOption.RECENT : sortOption;
    }
}
```

- [ ] **Step 2: 컴파일 — 호출 사이트 확인**

`new ClubSearchCondition(...)` 사이트 모두 마지막 인자 `null` 채워야 함.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java
git commit -m "feat(backend): add sortOption to ClubSearchCondition with RECENT default"
```

---

### Task 2-3: `ClubRepositoryImpl.findByCondition` 정렬 분기 구현

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java`

- [ ] **Step 1: import 추가**

```java
import com.duing.domain.club.service.dto.query.ClubSortOption;
import com.querydsl.core.types.OrderSpecifier;
```

- [ ] **Step 2: `applySort` 헬퍼 메서드 추가**

```java
private OrderSpecifier<?>[] applySort(ClubSortOption sortOption) {
    return switch (sortOption) {
        case DEADLINE_SOON -> new OrderSpecifier<?>[]{
                JPAExpressions.select(recruitment.endDate.min())
                        .from(recruitment)
                        .where(recruitment.club.eq(club).and(recruitment.status.eq(RecruitmentStatus.OPEN)))
                        .asc().nullsLast(),
                club.createdAt.desc()
        };
        case ALPHABETICAL -> new OrderSpecifier<?>[]{ club.name.asc() };
        case RECENT -> new OrderSpecifier<?>[]{ club.createdAt.desc() };
    };
}
```

(`DEADLINE_SOON` 의 정확한 QueryDSL 표현은 기존 `recruitment` import 와 OrderSpecifier 컴포지션 패턴에 맞춰 조정. 핵심: 활성 모집 중 가장 이른 endDate 를 sub-select 로 가져와 정렬 키로 사용, 모집 없는 동아리는 NULLS LAST.)

- [ ] **Step 3: `findByCondition` 의 `.orderBy(club.name.asc())` 를 `.orderBy(applySort(condition.sortOptionOrDefault()))` 로 교체**

- [ ] **Step 4: 컴파일**

Run: `./gradlew compileJava`
Expected: 메인 통과.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java
git commit -m "feat(backend): apply ClubSortOption in findByCondition order clause"
```

---

### Task 2-4: `ClubApi` / `ClubController` 에 `sort` 파라미터 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/ClubController.java`

- [ ] **Step 1: ClubApi.getClubs 시그니처에 `@RequestParam ClubSortOption sort` 추가 (required=false)**

```java
@Parameter(description = "정렬 옵션 (DEADLINE_SOON / RECENT / ALPHABETICAL). 미지정 시 RECENT.")
@RequestParam(required = false) ClubSortOption sort,
```

- [ ] **Step 2: ClubController.getClubs 본문에서 `sort` 를 `ClubSearchCondition` 에 전달**

- [ ] **Step 3: 수동 검증**

Run: `./gradlew bootRun` 후 `curl 'http://localhost:8080/api/v1/clubs?sort=ALPHABETICAL' | jq '.data.content[0:3] | map(.name)'` — 가나다순 확인.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/api/ClubApi.java backend/src/main/java/com/duing/domain/club/controller/ClubController.java
git commit -m "feat(backend): expose sort query param on GET /clubs"
```

---

### Task 2-5: `ClubSearchSortTest` 통합테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/controller/ClubSearchSortTest.java`

- [ ] **Step 1: 테스트 작성 — 3 케이스**

```java
@Test
@DisplayName("sort=ALPHABETICAL 이면 이름 가나다순으로 반환된다")
void alphabeticalSort() throws Exception {
    Club c = saveActiveClub("ㄷ클럽");
    Club a = saveActiveClub("ㄱ클럽");
    Club b = saveActiveClub("ㄴ클럽");

    RestAssured.given()
            .when().get("/api/v1/clubs?sort=ALPHABETICAL&keyword=클럽")
            .then().statusCode(HttpStatus.OK.value())
            .body("data.content[0].name", equalTo(a.getName()))
            .body("data.content[1].name", equalTo(b.getName()))
            .body("data.content[2].name", equalTo(c.getName()));
}

@Test
@DisplayName("sort=RECENT(기본) 이면 최근 등록 순으로 반환된다")
void recentSortDefault() throws Exception {
    Club first = saveActiveClub("최초");
    Thread.sleep(20);
    Club later = saveActiveClub("나중");

    RestAssured.given()
            .when().get("/api/v1/clubs?keyword=최초")
            .then().statusCode(HttpStatus.OK.value())
            .body("data.content[0].name", equalTo(later.getName()));
    // 정확한 순서 검증은 별도 keyword 매칭으로 격리.
}

@Test
@DisplayName("sort=DEADLINE_SOON 이면 활성 모집의 마감일이 가까운 동아리가 앞에 온다")
void deadlineSoonSort() throws Exception {
    // 두 동아리 + 각각 다른 마감일의 활성 모집 fixture.
    // (Recruitment fixture 작성 — 기존 RecruitmentRepository.findActiveByClubId 패턴 따름)
    // 정확한 fixture 코드는 backend/src/test 의 기존 모집 테스트(예: RecruitmentControllerTest) 패턴 따라 작성.
    // 검증: data.content[0].id 가 마감 임박 동아리, content[1] 가 그 다음.
}
```

- [ ] **Step 2: 테스트 실행**

Run: `./gradlew test --tests "com.duing.domain.club.controller.ClubSearchSortTest"`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/duing/domain/club/controller/ClubSearchSortTest.java
git commit -m "test(backend): sort option integration tests for /clubs"
```

---

### Task 2-6: PR-2 push + 머지

- [ ] **Step 1: push + PR**

Title: `feat(backend): /clubs 에 ClubSortOption 정렬 enum + 분기 도입`

- [ ] **Step 2: CI 통과 후 머지**

---

## PR-3: FE — 어드민 콘솔 단과대학 입력 추가

### Task 3-1: `packages/types/src/club.ts` 에 `College` union 추가

**Files:**
- Modify: `frontend/packages/types/src/club.ts`

- [ ] **Step 1: union 타입 추가**

```ts
export type College =
  | 'PUBLIC_LEADERS'
  | 'GLOBAL_BUSINESS'
  | 'SOCIAL_SCIENCE'
  | 'HEALTH_BIO'
  | 'IT_ENGINEERING'
  | 'DESIGN_ART'
  | 'EDUCATION'
  | 'REHABILITATION'
  | 'NURSING'
  | 'GLOCAL_LIFE'
  | 'INTERNATIONAL'
  | 'SPORTS_LEISURE'
  | 'CULTURE_CONTENTS'
  | 'FREE_MAJOR';
```

- [ ] **Step 2: `Club` / `ClubDetail` 응답 타입에 `college: College | null` 추가**

기존 `Club` / `ClubDetail` (또는 동등) 타입 정의에 필드 한 줄 추가.

- [ ] **Step 3: Commit**

```bash
git add frontend/packages/types/src/club.ts
git commit -m "feat(frontend): add College union type and expose it on Club types"
```

---

### Task 3-2: `packages/types/src/admin.ts` 갱신

**Files:**
- Modify: `frontend/packages/types/src/admin.ts`

- [ ] **Step 1: `AdminClubSummary` 에 `college: College | null` 추가**

(`import type { College } from './club';`)

- [ ] **Step 2: `CreateClubPayload` 에 `college?: College | null` 추가**

- [ ] **Step 3: `UpdateClubPayload` 에 `college?: College`, `clearCollege?: boolean` 추가**

- [ ] **Step 4: typecheck**

Run: `cd frontend && pnpm --filter web typecheck`
Expected: 통과.

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/types/src/admin.ts
git commit -m "feat(frontend): include college in admin club payloads"
```

---

### Task 3-3: `app/_lib/college.ts` 헬퍼 신설

**Files:**
- Create: `frontend/apps/web/app/_lib/college.ts`

- [ ] **Step 1: COLLEGE_OPTIONS + displayName 작성**

```ts
import type { College } from '@duing/types';

export const COLLEGE_OPTIONS: { code: College; label: string }[] = [
  { code: 'PUBLIC_LEADERS', label: '공공인재대학' },
  { code: 'GLOBAL_BUSINESS', label: '글로벌경영대학' },
  { code: 'SOCIAL_SCIENCE', label: '사회과학대학' },
  { code: 'HEALTH_BIO', label: '보건바이오대학' },
  { code: 'IT_ENGINEERING', label: 'IT·공과대학' },
  { code: 'DESIGN_ART', label: '디자인예술대학' },
  { code: 'EDUCATION', label: '사범대학' },
  { code: 'REHABILITATION', label: '재활과학대학' },
  { code: 'NURSING', label: '간호대학' },
  { code: 'GLOCAL_LIFE', label: '글로컬라이프대학' },
  { code: 'INTERNATIONAL', label: '국제대학' },
  { code: 'SPORTS_LEISURE', label: '체육레저학부' },
  { code: 'CULTURE_CONTENTS', label: '문화콘텐츠학부' },
  { code: 'FREE_MAJOR', label: '자유전공학부' },
];

const labelByCode = new Map(COLLEGE_OPTIONS.map((option) => [option.code, option.label]));

export function collegeDisplayName(code: College): string {
  return labelByCode.get(code) ?? code;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/apps/web/app/_lib/college.ts
git commit -m "feat(frontend): add College displayName helper"
```

---

### Task 3-4: 어드민 클럽 생성 폼에 College 드롭다운 추가

**Files:**
- Modify: `frontend/apps/web/app/admin/clubs/new/_components/AdminClubCreateForm.tsx`

- [ ] **Step 1: import + state 추가**

```tsx
import type { College } from '@duing/types';
import { COLLEGE_OPTIONS } from '../../../../_lib/college';

// state
const [college, setCollege] = useState<College | ''>('');
```

- [ ] **Step 2: 폼 필드 추가**

기존 division 입력 아래(또는 자연스러운 위치) 에 select 추가:

```tsx
<label className="block">
  <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">
    단과대학 (학과동아리만 해당, 선택)
  </span>
  <select
    value={college}
    onChange={(event) => setCollege(event.target.value as College | '')}
    className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
  >
    <option value="">선택 안 함 (중앙동아리)</option>
    {COLLEGE_OPTIONS.map((option) => (
      <option key={option.code} value={option.code}>{option.label}</option>
    ))}
  </select>
</label>
```

- [ ] **Step 3: submit 페이로드에 `college` 포함**

```ts
const payload: CreatePromotionPayload = {
  ...,
  college: college === '' ? null : college,
};
```

(정확한 페이로드 타입은 `CreateClubPayload` — 위 예시의 변수명만 맞게)

- [ ] **Step 4: typecheck + 수동 검증**

Run: `pnpm --filter web typecheck`
Manual: 로컬에서 어드민 콘솔로 새 동아리 생성 시 단과대 선택해 저장 → DB 행에 college 값 들어왔는지 확인.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/admin/clubs/new/_components/AdminClubCreateForm.tsx
git commit -m "feat(frontend): college dropdown in admin club create form"
```

---

### Task 3-5: 어드민 클럽 수정 폼에 College 드롭다운 추가 (+ 제거 버튼)

**Files:**
- Modify: `frontend/apps/web/app/admin/clubs/[clubId]/_components/AdminClubEditForm.tsx` (또는 동등 파일)

- [ ] **Step 1: 파일 위치 확인**

```bash
find frontend/apps/web/app/admin/clubs/[clubId] -name "*.tsx" | xargs grep -l "UpdateClubPayload\|onSubmit" | head -3
```

- [ ] **Step 2: 동일 select 추가**

(Create 폼과 유사 — 단, 초기값은 `initialValues.college ?? ''` 채움)

- [ ] **Step 3: 제거 버튼 — "단과대 제거" 클릭 시 `setCollege('')` + submit 시 `clearCollege: true` 흘려보내기**

```ts
const payload: UpdateClubPayload = {
  ...,
};
if (college === '' && initialValues.college !== null) {
  payload.clearCollege = true;
} else if (college !== '') {
  payload.college = college;
}
```

- [ ] **Step 4: typecheck**

Run: `pnpm --filter web typecheck`
Expected: 통과.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/admin/clubs/[clubId]/_components/AdminClubEditForm.tsx
git commit -m "feat(frontend): college dropdown with clear flag in admin club edit form"
```

---

### Task 3-6: PR-3 push + 머지

- [ ] **Step 1: push + PR**

Title: `feat(frontend): 어드민 콘솔에 단과대학 입력 추가`

- [ ] **Step 2: CI 통과 후 머지**

---

## PR-4: FE — `/clubs` 탐색 페이지 재구성 + 명칭 통일

### Task 4-1: `exploreParams.ts` — Scope 라벨 `'학과'`, college / sort 추가

**Files:**
- Modify: `frontend/apps/web/app/clubs/_lib/exploreParams.ts`

- [ ] **Step 1: 타입 갱신**

```ts
import type { College } from '@duing/types';

export type Scope = '전체' | '중앙' | '학과';
export type SortKey = 'DEADLINE_SOON' | 'RECENT' | 'ALPHABETICAL';

export type ExploreParams = {
  scope: Scope;
  division: DivisionFilter;
  college: College | null;
  recruitment: RecruitmentFilter;
  keyword: string;
  sort: SortKey;
  page: number;
};

export const DEFAULT_EXPLORE_PARAMS: ExploreParams = {
  scope: '전체',
  division: '전체',
  college: null,
  recruitment: 'all',
  keyword: '',
  sort: 'RECENT',
  page: 1,
};
```

- [ ] **Step 2: SCOPES 배열 갱신**

```ts
const SCOPES: readonly Scope[] = ['전체', '중앙', '학과'];
```

- [ ] **Step 3: `parseExploreParams` — `college`, `sort` 파싱 추가**

- [ ] **Step 4: `serializeExploreParams` — `college`, `sort` 직렬화**

- [ ] **Step 5: `toApiParams` — scope 를 `centralClub` 으로 매핑**

```ts
export function toApiParams(params: ExploreParams, size: number) {
  const centralClub = params.scope === '중앙' ? true : params.scope === '학과' ? false : undefined;
  return {
    keyword: params.keyword || undefined,
    division: params.division !== '전체' ? params.division : undefined,
    recruiting: params.recruitment === 'open' ? true : undefined,
    centralClub,
    college: params.college ?? undefined,
    sort: params.sort,
    page: params.page - 1,
    size,
  };
}
```

- [ ] **Step 6: typecheck**

Run: `pnpm --filter web typecheck`

- [ ] **Step 7: Commit**

```bash
git add frontend/apps/web/app/clubs/_lib/exploreParams.ts
git commit -m "feat(frontend): switch scope label to '학과' and add college/sort to ExploreParams"
```

---

### Task 4-2: `ClubScope` 타입 + 어댑터 / 카드 / mocks 일괄 `'학과'` 로

**Files:**
- Modify: `frontend/apps/web/app/clubs/_lib/clubs.ts`
- Modify: `frontend/apps/web/app/clubs/_lib/clubAdapter.ts`
- Modify: `frontend/apps/web/app/clubs/_components/ClubCard.tsx`
- Modify: `frontend/apps/web/app/_mocks.ts`

- [ ] **Step 1: `clubs.ts` 의 ClubScope union 교체**

```ts
export type ClubScope = '중앙' | '학과';
```

- [ ] **Step 2: `clubAdapter.ts:25` 교체**

```ts
centralClub ? '중앙' : '학과';
```

- [ ] **Step 3: `ClubCard.tsx:108` 의 뱃지 라벨 교체**

```tsx
{club.scope === '중앙' ? '🏛️ 중앙' : '🎓 학과'}
```

- [ ] **Step 4: `_mocks.ts` 의 mock 데이터에서 `scope: '과'` → `scope: '학과'`**

(전체 mock 행 검사 — `grep -n "'과'" frontend/apps/web/app/_mocks.ts`)

- [ ] **Step 5: typecheck**

Run: `pnpm --filter web typecheck`

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/app/clubs/_lib/clubs.ts frontend/apps/web/app/clubs/_lib/clubAdapter.ts frontend/apps/web/app/clubs/_components/ClubCard.tsx frontend/apps/web/app/_mocks.ts
git commit -m "refactor(frontend): unify scope label '학과' across club types, adapter, card, and mocks"
```

---

### Task 4-3: `packages/api` 의 `ClubSearchParams` 확장

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: `ClubSearchParams` 타입 (또는 동등) 에 신규 필드 추가**

```ts
export type ClubSearchParams = {
  keyword?: string;
  category?: ClubCategory;
  division?: string;
  recruiting?: boolean;
  centralClub?: boolean;
  college?: College;
  sort?: 'DEADLINE_SOON' | 'RECENT' | 'ALPHABETICAL';
  page?: number;
  size?: number;
};
```

- [ ] **Step 2: `client.clubs.list` 구현이 `searchParams` 로 새 필드를 그대로 흘리는지 확인**

`cleanParams(params)` 가 unsigned undefined 키를 자동 제거하면 추가 코드 불필요. 만약 명시적으로 화이트리스트하는 헬퍼라면 새 키 등록.

- [ ] **Step 3: typecheck**

Run: `pnpm --filter web typecheck`

- [ ] **Step 4: Commit**

```bash
git add frontend/packages/api/src/client.ts
git commit -m "feat(frontend): extend ClubSearchParams with centralClub/college/sort"
```

---

### Task 4-4: `ClubExplorePage.tsx` — 클라이언트 후처리 제거

**Files:**
- Modify: `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx`

- [ ] **Step 1: `visibleClubs` 후처리(`line 109~122`) 제거**

기존:
```tsx
const visibleClubs = useMemo(() => {
  const content = clubListQuery.data?.content ?? [];
  return content
    .filter((summary) => { ... scope ... })
    .map(summaryToClub)
    .filter((club) => { ... recruitment ... });
}, [...]);
```

교체:
```tsx
const visibleClubs = useMemo(
  () => (clubListQuery.data?.content ?? []).map(summaryToClub),
  [clubListQuery.data],
);
```

(recruitment 후처리도 함께 제거 — BE 가 `recruiting=true` 파라미터로 처리)

- [ ] **Step 2: typecheck + 빈 검색 동작 확인**

Run: `pnpm --filter web typecheck`
Manual: 로컬 dev 에서 페이지 로드 → 페이지당 개수가 일정한지 확인.

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx
git commit -m "refactor(frontend): drop client-side scope/recruitment post-filter in ClubExplorePage"
```

---

### Task 4-5: `ClubExplorePage` — "과동아리" → "학과동아리" + scope `'학과'`

**Files:**
- Modify: `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx`

- [ ] **Step 1: scope 칩 segment 배열의 `key: '과'` → `key: '학과'`, `hint: '학과 · 단과대 산하'` 그대로**

```tsx
[
  { key: '전체', hint: '모든 동아리' },
  { key: '중앙', hint: '학생자치회 5개 분과' },
  { key: '학과',   hint: '학과 · 단과대 산하' },
] as const
```

- [ ] **Step 2: line 217 의 라벨 분기 교체**

```tsx
{segment.key === '전체' ? '전체' : segment.key === '중앙' ? '중앙동아리' : '학과동아리'}
```

- [ ] **Step 3: line 246 의 `params.scope === '과'` → `params.scope === '학과'`**

- [ ] **Step 4: line 362 의 ActiveFilterChip 라벨 교체**

```tsx
label={params.scope === '중앙' ? '중앙동아리' : '학과동아리'}
```

- [ ] **Step 5: typecheck**

Run: `pnpm --filter web typecheck`

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx
git commit -m "refactor(frontend): rename 과동아리 to 학과동아리 in ClubExplorePage"
```

---

### Task 4-6: `ClubExplorePage` — 단과대학 칩 활성화 (COLLEGES 하드코딩 제거)

**Files:**
- Modify: `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx`

- [ ] **Step 1: COLLEGES 상수 제거, `COLLEGE_OPTIONS` import**

```tsx
import { COLLEGE_OPTIONS, collegeDisplayName } from '../../_lib/college';
```

- [ ] **Step 2: `params.scope === '학과'` 분기의 칩 영역 동작 추가**

```tsx
{params.scope === '학과' && (
  <div className="flex gap-2 flex-wrap items-center">
    <span className="text-[11.5px] font-bold text-charcoal-3 tracking-wide08 mr-1">단과대학</span>
    {COLLEGE_OPTIONS.map((option) => {
      const on = option.code === params.college;
      return (
        <button
          key={option.code}
          type="button"
          onClick={() =>
            updateParams({ college: on ? null : option.code, page: 1 })
          }
          className={`px-4 py-2 rounded-full text-[13.5px] font-semibold border ${on ? 'bg-sage-mist text-ink-deep border-ink-deep' : 'bg-paper text-charcoal-2 border-line'}`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
)}
```

- [ ] **Step 3: 사이드 필터의 단과대학 그룹도 활성화 (line 306~321)**

`disabled` 제거, onChange 가 `updateParams({ college: params.college === code ? null : code, page: 1 })`.

- [ ] **Step 4: 활성 필터 chip 영역에 단과대학 chip 추가**

```tsx
{params.college && (
  <ActiveFilterChip
    label={collegeDisplayName(params.college)}
    variant="primary"
    onRemove={() => updateParams({ college: null, page: 1 })}
  />
)}
```

- [ ] **Step 5: typecheck + 수동 검증**

Run: `pnpm --filter web typecheck`
Manual: `/clubs` 에서 학과 scope 선택 → 단과대 칩 클릭 → URL 변경 + 결과 필터링.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx
git commit -m "feat(frontend): enable college chips in /clubs scope=학과"
```

---

### Task 4-7: `ClubExplorePage` — 정렬 드롭다운 활성화

**Files:**
- Modify: `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx`

- [ ] **Step 1: 기존 disabled 버튼(`line 342~349`) 을 select 로 교체**

```tsx
<select
  value={params.sort}
  onChange={(event) =>
    updateParams({ sort: event.target.value as SortKey, page: 1 })
  }
  className="px-3.5 py-2 bg-paper rounded-[10px] border border-line text-[13.5px] font-semibold text-charcoal-2"
>
  <option value="RECENT">최근 등록순</option>
  <option value="DEADLINE_SOON">마감 임박순</option>
  <option value="ALPHABETICAL">가나다순</option>
</select>
```

- [ ] **Step 2: typecheck**

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx
git commit -m "feat(frontend): enable sort dropdown on /clubs"
```

---

### Task 4-8: `ClubExplorePage` — view toggle 제거 + "준비 중" placeholder 정리

**Files:**
- Modify: `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx`

- [ ] **Step 1: grid/list 토글 두 버튼 삭제 (`line 334~341`)**

영역 자체를 지우고, 정렬 select 만 남긴다.

- [ ] **Step 2: 활동 요일 필터 영역의 placeholder 문구 명확화**

```tsx
<p className="mt-2 text-[11px] text-charcoal-3">
  활동 요일 필터는 다음 업데이트에 추가될 예정입니다.
</p>
```

- [ ] **Step 3: 미리보기 + Commit**

Run: `pnpm --filter web typecheck`

```bash
git add frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx
git commit -m "refactor(frontend): remove non-functional view toggle and clarify activeDays placeholder"
```

---

### Task 4-9: PR-4 push + 머지

- [ ] **Step 1: push + PR**

Title: `refactor(frontend): /clubs 탐색 페이지 재구성 + 명칭 통일 (학과동아리)`

Body 골조:
- 🚀 작업 내용 (scope/division/college/sort BE 위임, 학과동아리 명칭 통일, view toggle 제거)
- 🤔 고민했던 내용 (URL `scope=학과` 호환, 페이지네이션 정합성)
- 💬 리뷰 중점사항 (preview 에서 필터 클릭 → URL → API 호출 일관 동작, 단과대 칩 클릭 시 토글 동작)
- 관련 이슈: spec docs/superpowers/specs/2026-05-24-student-clubs-explore-redesign-design.md

- [ ] **Step 2: CI 통과 후 머지**

- [ ] **Step 3: develop 로 복귀**

```bash
git checkout develop && git pull origin develop
```

---

## 완료 기준

- [ ] PR-1 ~ PR-4 모두 머지됨
- [ ] develop 에서 `/clubs?scope=학과&college=IT_ENGINEERING&sort=DEADLINE_SOON` 호출 시 의도된 결과 반환
- [ ] preview/dev 환경에서 (1) scope 칩 클릭 시 페이지당 개수 일정, (2) 단과대 칩 클릭 시 즉시 필터링, (3) 정렬 드롭다운 클릭 시 결과 순서 변경, (4) "과동아리" 텍스트 코드베이스에서 0 회 grep
- [ ] `./gradlew test` 통과 (BE)
- [ ] `pnpm --filter web typecheck` 통과 (FE)

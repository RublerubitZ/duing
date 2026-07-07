# 동아리 상태 노출 정책 정합화 (마이페이지 ACTIVE 제한 · REJECTED 삭제 허용) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생에게 노출되는 모든 동아리 조회(마이페이지 소속 목록·공개 상세)를 ACTIVE 상태로 제한하고, 총동연 콘솔에서 REJECTED 동아리도 삭제(soft delete)할 수 있게 하며, FE 는 상태 기반으로 액션 버튼을 가드한다.

**Architecture:** 백엔드는 (1) `findMyClubsByUser` QueryDSL 에 `club.status = ACTIVE` 필터 + 응답에 status 필드 추가, (2) 공개 상세를 `getActiveById`(비 ACTIVE → 404) 로 분리(admin 상세는 기존 `getById` 유지), (3) `Club.validateClosable()` 을 INACTIVE·REJECTED 허용으로 완화. 프론트는 `MyClubSummary.status` 를 추가해 마이페이지 액션(관리/둘러보기/탈퇴)을 ACTIVE 에서만 노출(심층 방어)하고, 총동연 콘솔 삭제 버튼을 REJECTED 까지 확대하며 UI 문구를 "폐쇄"→"삭제" 로 통일한다. DELETED 는 별도 status 가 아니라 soft delete(`deletedAt` + `@SQLRestriction`)로 이미 전역 필터되므로 추가 조치 불필요.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / RestAssured + Testcontainers · Next.js 15 / React 19 / TanStack Query / Vitest + Testing Library

**PR 분할:** PR 1 = backend (`fix/club-status-visibility-be`), PR 2 = web (`fix/club-status-visibility-web`, PR 1 머지 후 develop 재분기 없이도 파일 영역이 분리되어 충돌 없음 — 단 런타임은 PR 1 배포에 의존하므로 머지 순서는 BE → FE).

**커밋 규칙:** Conventional Commits 한국어 (`fix(backend): …`), Co-Authored-By/🤖 라인 금지, EOF newline 필수.

**리뷰 파이프라인 (task 마다):** implementer → spec compliance reviewer → quality reviewer(BE: duing-code-reviewer / FE: feature-dev:code-reviewer) → codex:review. Task 1·2·3 은 API contract·상태전이·soft delete 해당으로 codex:adversarial-review 추가. 리뷰어 haiku 금지.

---

## 현재 상태 (정찰 결과)

- `ClubStatus` = `PENDING_APPROVAL | ACTIVE | INACTIVE | REJECTED` (`backend/src/main/java/com/duing/domain/club/entity/ClubStatus.java`). "DELETED" 상태는 없음 — 삭제는 `@SQLDelete`/`@SQLRestriction` soft delete.
- **버그**: `ClubMemberRepositoryImpl.findMyClubsByUser` (`:53-76`) 에 status 조건이 없어 PENDING_APPROVAL/INACTIVE/REJECTED 동아리가 마이페이지에 노출됨. 바로 위 `findActiveManagedClubsByUser` 는 `club.status.eq(ACTIVE)` 필터 보유(참조 패턴).
- 공개 목록 `GET /clubs` 는 이미 ACTIVE 하드코딩 필터(`ClubRepositoryImpl.findByCondition:53`) — 수정 불필요.
- 공개 상세 `GET /clubs/{clubId}` 는 status 필터 없음 (`GeneralClubService.getById`) — admin 상세(`GET /admin/clubs/{clubId}`)와 서비스 메서드 공유 중이므로 분리 필요.
- 폐쇄 API `POST /admin/clubs/{clubId}/close` 는 존재하며 `Club.validateClosable()` 이 INACTIVE 만 허용 (`Club.java:229-233`). FE 폐쇄 버튼도 INACTIVE 한정 (`AdminClubsTable.tsx:120`).
- REJECTED "재심사 대기로 전환" 버튼은 FE 에 이미 구현됨 (`clubStatus.ts:79-86`) — 유지.
- `MyClubSummary`(FE)/`MyClubResponse`(BE) 에 status 필드 없음.
- close mutation 은 이미 `adminQueryKeys.clubsAll` + `clubQueryKeys.detail/all` invalidate (`packages/hooks/src/admin.ts:81-85`) — 목록·상세 즉시 갱신 충족, 수정 불필요.

## Out of Scope (이번 작업에서 다루지 않는 것)

- **전역 모집 공개 API 의 비 ACTIVE 동아리 필터** (`GET /recruitments` 달력, `GET /recruitments/{id}` 상세): INACTIVE 전환된 동아리의 기존 모집이 달력/상세에 남는 문제는 이 작업 이전부터 존재하던 별도 정책 이슈(운영 중단 시 모집 자동 마감 여부 결정 필요)로, 홈·달력 쿼리 영향 범위가 커 후속 스펙으로 분리. ※ club 스코프 하위 리소스(`GET /clubs/{clubId}/recruitments`, `GET /clubs/{clubId}/photos`)는 Codex 리뷰 지적에 따라 **이번 PR 범위로 편입** (Task 2b — ACTIVE 가드 추가).
- **admin 상세 페이지에 상태 액션/삭제 버튼 추가**: 현재 admin 상세는 뱃지만 표시하고 액션이 없음. 스펙의 "목록 및 상세 화면 즉시 갱신"은 캐시 invalidation 으로 충족(이미 구현됨).
- **ACTIVE 동아리 삭제 정책 변경**: 스펙 명시 — ACTIVE 는 삭제 대상 아님(기존 2단계: 운영 중단 후 삭제 유지).
- **INACTIVE 동아리 멤버의 탈퇴 UX**: ACTIVE 필터로 마이페이지에서 숨겨지면 해당 동아리 탈퇴 버튼도 함께 사라짐. 스펙(절대 노출 금지)을 따른 의도된 결과. 재활성화되면 멤버십이 유지된 채 다시 노출됨.
- **backend `close`/`closureReason` API 네이밍 변경**: UI 문구만 "삭제"로 통일, API contract 는 유지.
- **admin 상태변경 mutation 이 학생 mypage 캐시(`userQueryKeys.myClubs`)를 invalidate 하지 않는 것**: 서로 다른 사용자/브라우저라 클라이언트 캐시 무효화 무의미.

---

# PR 1 — Backend (`fix/club-status-visibility-be`)

## Task 0: 브랜치 생성

- [ ] **Step 1: develop 에서 브랜치 분기**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b fix/club-status-visibility-be
```

---

## Task 1: 마이페이지 소속 동아리 목록 — ACTIVE 필터 + status 필드

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/MyClubQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/MyClubResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepositoryImpl.java:53-76`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/api/MeClubApi.java` (Operation description)
- Test: `backend/src/test/java/com/duing/domain/clubmember/service/MyClubsQueryTest.java`

> ⚠️ `MyClubQuery` 는 `Projections.constructor` 로 **positional 생성** — record 컴포넌트 순서와 projection 인자 순서를 반드시 동기화할 것 (4계층: projection → query record → response record → FE 타입).

- [ ] **Step 1: 실패하는 테스트 작성** — `MyClubsQueryTest.java` 에서 기존 `saveActiveClub` 헬퍼를 상태 파라미터 버전으로 일반화하고 테스트 2개 추가:

```java
    @Test
    @DisplayName("승인 대기·운영 중단·거절 상태 동아리는 소속 목록에서 제외되고 ACTIVE 만 반환된다")
    void nonActiveClubMembershipsAreExcluded() throws Exception {
        User currentUser = saveStudent("상태필터검증");
        Club pendingClub = saveClubWithStatus("승인대기동아리", ClubStatus.PENDING_APPROVAL);
        Club inactiveClub = saveClubWithStatus("중단동아리", ClubStatus.INACTIVE);
        Club rejectedClub = saveClubWithStatus("거절동아리", ClubStatus.REJECTED);
        Club activeClub = saveClubWithStatus("운영중동아리", ClubStatus.ACTIVE);
        saveMembership(pendingClub, currentUser, ClubMemberRole.LEADER);
        saveMembership(inactiveClub, currentUser, ClubMemberRole.OFFICER);
        saveMembership(rejectedClub, currentUser, ClubMemberRole.MEMBER);
        saveMembership(activeClub, currentUser, ClubMemberRole.MEMBER);

        List<MyClubQuery> result = clubMemberRepository.findMyClubsByUser(currentUser.getId());

        assertThat(result).hasSize(1);
        assertThat(result.get(0).clubId()).isEqualTo(activeClub.getId());
    }

    @Test
    @DisplayName("소속 동아리 응답에 동아리 상태(ACTIVE)가 포함된다")
    void statusFieldIsPopulated() throws Exception {
        User currentUser = saveStudent("상태필드검증");
        Club activeClub = saveClubWithStatus("상태필드동아리", ClubStatus.ACTIVE);
        saveMembership(activeClub, currentUser, ClubMemberRole.MEMBER);

        List<MyClubQuery> result = clubMemberRepository.findMyClubsByUser(currentUser.getId());

        assertThat(result).hasSize(1);
        assertThat(result.get(0).status()).isEqualTo(ClubStatus.ACTIVE);
    }
```

기존 `saveActiveClub` 은 아래처럼 위임 형태로 바꾸고 (기존 4개 테스트는 그대로 컴파일되도록 유지):

```java
    private Club saveActiveClub(String name) throws Exception {
        return saveClubWithStatus(name, ClubStatus.ACTIVE);
    }

    private Club saveClubWithStatus(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
        return clubRepository.save(club);
    }
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests 'com.duing.domain.clubmember.service.MyClubsQueryTest'`
Expected: FAIL — `status()` 메서드 없음(컴파일 에러). 컴파일 에러도 "실패 확인"으로 간주하고 진행.

- [ ] **Step 3: 구현** —

`MyClubQuery.java` 전체:

```java
package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

/**
 * 사용자(STUDENT/ADMIN 무관) 본인이 소속된 동아리 단건 — role 무관.
 * 마이페이지의 "가입한 동아리" 섹션이 사용한다. 운영 중(ACTIVE) 동아리만 조회된다.
 */
public record MyClubQuery(
        Long clubId,
        String clubName,
        String logoUrl,
        ClubStatus status,
        ClubMemberRole myRole,
        long activeRecruitmentCount,
        LocalDateTime joinedAt
) {
}
```

`MyClubResponse.java` 전체:

```java
package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import java.time.LocalDateTime;

public record MyClubResponse(
        Long clubId,
        String clubName,
        String logoUrl,
        ClubStatus status,
        ClubMemberRole myRole,
        long activeRecruitmentCount,
        LocalDateTime joinedAt
) {
    public static MyClubResponse from(MyClubQuery query) {
        return new MyClubResponse(
                query.clubId(),
                query.clubName(),
                query.logoUrl(),
                query.status(),
                query.myRole(),
                query.activeRecruitmentCount(),
                query.joinedAt()
        );
    }
}
```

`ClubMemberRepositoryImpl.findMyClubsByUser` — projection 에 `club.status` 추가(4번째 인자), where 에 ACTIVE 필터, groupBy 에 `club.status` 추가:

```java
    @Override
    public List<MyClubQuery> findMyClubsByUser(Long userId) {
        LocalDate today = LocalDate.now();

        NumberExpression<Integer> activeRecruitmentFlag = activeRecruitmentFlag(today);

        return queryFactory
                .select(Projections.constructor(
                        MyClubQuery.class,
                        club.id,
                        club.name,
                        club.logoUrl,
                        club.status,
                        clubMember.role,
                        activeRecruitmentFlag.sum().longValue().coalesce(0L),
                        clubMember.createdAt
                ))
                .from(clubMember)
                .join(clubMember.club, club)
                .leftJoin(recruitment).on(recruitment.club.id.eq(club.id))
                .where(
                        clubMember.user.id.eq(userId),
                        club.status.eq(ClubStatus.ACTIVE)
                )
                .groupBy(club.id, club.name, club.logoUrl, club.status, clubMember.role, clubMember.createdAt)
                .orderBy(clubMember.createdAt.desc())
                .fetch();
    }
```

`MeClubApi.java` — `@Operation` description 을 정책 반영으로 갱신:

```java
    @Operation(
            summary = "내가 가입한 동아리 목록 조회",
            description = "현재 사용자가 LEADER / OFFICER / MEMBER 중 어떤 역할로든 소속된 운영 중(ACTIVE) 동아리를 "
                    + "가입일(최신) 순으로 반환한다. 승인 대기·거절·운영 중단·폐쇄 상태의 동아리는 제외된다. "
                    + "운영자용 /leader/clubs/me/managed 와는 별개이며, 마이페이지 '가입한 동아리' 섹션에서 사용한다."
    )
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests 'com.duing.domain.clubmember.service.MyClubsQueryTest'`
Expected: PASS (기존 4개 + 신규 2개). 출력에서 `BUILD SUCCESSFUL` 직접 확인 (`| tail` 금지).

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/clubmember backend/src/test/java/com/duing/domain/clubmember/service/MyClubsQueryTest.java
git commit -m "fix(backend): 마이페이지 소속 동아리 목록을 ACTIVE 상태로 제한하고 status 필드 추가"
```

---

## Task 2: 공개 동아리 상세 — 비 ACTIVE 는 404

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/ClubService.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java:110-133`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/ClubController.java:61-65`
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java` (getClub Operation)
- Create(Test): `backend/src/test/java/com/duing/domain/club/controller/ClubDetailStatusControllerTest.java`

> admin 상세(`AdminClubController:57`)와 leader 수정 후 재조회(`ClubController.updateClub:74`)는 기존 `getById` 유지 — admin 은 모든 상태를 봐야 하고, leader 는 본인 동아리 수정 흐름이므로 제한하지 않는다. 기존 `AdminClubDetailControllerTest` 의 "ADMIN 이 PENDING_APPROVAL 동아리 상세를 status 필터 없이 조회할 수 있다" 가 admin 회귀를 커버한다.

- [ ] **Step 1: 실패하는 통합 테스트 작성** — 새 파일 `ClubDetailStatusControllerTest.java`:

```java
package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubDetailStatusControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("운영 중(ACTIVE) 동아리의 공개 상세 조회는 200 과 상세 정보를 반환한다")
    void activeClubDetailIsPublic() throws Exception {
        Club activeClub = saveClubWithStatus("공개상세클럽", ClubStatus.ACTIVE);

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.status", equalTo(ClubStatus.ACTIVE.name()));
    }

    @ParameterizedTest(name = "{0} 동아리의 공개 상세 조회는 404 를 반환한다")
    @EnumSource(value = ClubStatus.class, names = {"PENDING_APPROVAL", "INACTIVE", "REJECTED"})
    @DisplayName("승인 대기·운영 중단·거절 동아리의 공개 상세 조회는 404 를 반환한다")
    void nonActiveClubDetailIsHidden(ClubStatus status) throws Exception {
        Club hiddenClub = saveClubWithStatus("비공개상세클럽", status);

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}", hiddenClub.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));
    }

    private Club saveClubWithStatus(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        return clubRepository.save(created);
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests 'com.duing.domain.club.controller.ClubDetailStatusControllerTest'`
Expected: FAIL — 비 ACTIVE 케이스 3개가 404 대신 200 반환.

- [ ] **Step 3: 구현** —

`ClubService.java` — `getById` 아래에 추가:

```java
    ClubDetailQuery getById(Long clubId);

    /** 학생/공개용 상세 — 운영 중(ACTIVE) 동아리만. 그 외 상태는 ClubNotFoundException(404). */
    ClubDetailQuery getActiveById(Long clubId);
```

`GeneralClubService.java` — 기존 `getById` 본문을 `toDetailQuery(Club)` 로 추출하고 두 메서드가 공유. import 에 `com.duing.domain.club.entity.ClubStatus` 추가:

```java
    @Override
    public ClubDetailQuery getById(Long clubId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        return toDetailQuery(club);
    }

    @Override
    public ClubDetailQuery getActiveById(Long clubId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        // 존재 여부를 숨기기 위해 403 이 아닌 404 로 동일하게 응답한다.
        if (club.getStatus() != ClubStatus.ACTIVE) {
            throw new ClubException.ClubNotFoundException();
        }
        return toDetailQuery(club);
    }

    private ClubDetailQuery toDetailQuery(Club club) {
        Long clubId = club.getId();
        List<ClubPhotoQuery> photos = clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(clubId)
                .stream()
                .map(ClubPhotoQuery::from)
                .toList();

        LocalDate today = LocalDate.now();
        StudentRecruitmentProjection activeRecruitment = recruitmentRepository.findActiveByClubId(clubId)
                .map(active -> {
                    Integer applicantCount = active.isShowApplicantCount()
                            ? (int) applicationRepository.countByRecruitmentId(active.getId())
                            : null;
                    return StudentRecruitmentProjection.from(active, today, applicantCount);
                })
                .orElse(null);

        return clubMemberRepository.findFirstByClubIdAndRole(clubId, ClubMemberRole.LEADER)
                .map(leader -> ClubDetailQuery.of(
                        club, leader.getUser().getId(), leader.getUser().getName(), photos, activeRecruitment))
                .orElseGet(() -> ClubDetailQuery.of(club, null, null, photos, activeRecruitment));
    }
```

`ClubController.getClub` — 공개 상세만 `getActiveById` 로 전환:

```java
    @Override
    public ResponseEntity<ApiResponse<ClubDetailResponse>> getClub(@PathVariable Long clubId) {
        ClubDetailResponse response = ClubDetailResponse.from(clubService.getActiveById(clubId));
        return ResponseEntity.ok(ApiResponse.success(response));
    }
```

`ClubApi.java` — getClub Operation 갱신:

```java
    @Operation(summary = "동아리 상세 조회",
            description = "운영 중(ACTIVE) 동아리만 조회할 수 있다. 승인 대기·거절·운영 중단·폐쇄 상태는 404 를 반환한다.")
    @GetMapping("/clubs/{clubId}")
    ResponseEntity<ApiResponse<ClubDetailResponse>> getClub(@PathVariable Long clubId);
```

- [ ] **Step 4: 신규 + 인접 회귀 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests 'com.duing.domain.club.controller.ClubDetailStatusControllerTest' --tests 'com.duing.domain.club.controller.AdminClubDetailControllerTest' --tests 'com.duing.domain.club.controller.ClubUpdateControllerTest' --tests 'com.duing.domain.club.service.ClubDetailActiveRecruitmentTest'`
Expected: 전부 PASS, `BUILD SUCCESSFUL` 확인.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club backend/src/test/java/com/duing/domain/club/controller/ClubDetailStatusControllerTest.java
git commit -m "fix(backend): 공개 동아리 상세 조회를 ACTIVE 상태로 제한 (비공개 상태 404)"
```

---

## Task 3: REJECTED 동아리 폐쇄(soft delete) 허용

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java:228-233`
- Modify: `backend/src/main/java/com/duing/domain/club/exception/ClubException.java:41-46`
- Modify: `backend/src/main/java/com/duing/domain/club/api/AdminClubApi.java:68-70` (Operation description)
- Create(Test): `backend/src/test/java/com/duing/domain/club/entity/ClubValidateClosableTest.java`
- Test: `backend/src/test/java/com/duing/domain/club/controller/AdminClubClosureControllerTest.java`

- [ ] **Step 1: 실패하는 단위 테스트 작성** — 새 파일 `ClubValidateClosableTest.java` (상태 도달은 리플렉션이 아닌 `changeStatus` 전이 체인 사용 — 도메인 규칙 준수):

```java
package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.exception.ClubException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubValidateClosableTest {

    @Test
    @DisplayName("운영 중단(INACTIVE) 동아리는 폐쇄 검증을 통과한다")
    void inactiveClubIsClosable() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.ACTIVE, null, 1L);
        club.changeStatus(ClubStatus.INACTIVE, null, 1L);

        assertThatCode(club::validateClosable).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("거절(REJECTED) 동아리는 폐쇄 검증을 통과한다")
    void rejectedClubIsClosable() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.REJECTED, "요건 미충족", 1L);

        assertThatCode(club::validateClosable).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("운영 중(ACTIVE) 동아리는 폐쇄할 수 없다")
    void activeClubIsNotClosable() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.ACTIVE, null, 1L);

        assertThatThrownBy(club::validateClosable)
                .isInstanceOf(ClubException.ClubNotClosableException.class);
    }

    @Test
    @DisplayName("승인 대기(PENDING_APPROVAL) 동아리는 폐쇄할 수 없다")
    void pendingClubIsNotClosable() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);

        assertThatThrownBy(club::validateClosable)
                .isInstanceOf(ClubException.ClubNotClosableException.class);
    }
}
```

그리고 `AdminClubClosureControllerTest.java` 에 통합 테스트 2개 추가 (`closingActiveClubIsRejected` 테스트 아래):

```java
    @Test
    @DisplayName("ADMIN 이 거절(REJECTED) 동아리를 폐쇄하면 204 가 반환되고 soft-delete 되며 멤버십이 제거된다")
    void adminClosesRejectedClub() throws Exception {
        Club rejectedClub = saveClubWithLeader("거절폐쇄클럽", ClubStatus.REJECTED);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", rejectedClub.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        Assertions.assertTrue(
                clubMemberRepository.findByClubIdAndUserId(rejectedClub.getId(), leaderUser.getId()).isEmpty());

        LocalDateTime clubDeletedAt = jdbcTemplate.queryForObject(
                "SELECT deleted_at FROM club WHERE id = ?", LocalDateTime.class, rejectedClub.getId());
        Assertions.assertNotNull(clubDeletedAt);
    }

    @Test
    @DisplayName("승인 대기(PENDING_APPROVAL) 동아리를 폐쇄하려 하면 400 이 반환된다")
    void closingPendingClubIsRejected() throws Exception {
        Club pendingClub = saveClubWithLeader("승인대기폐쇄거부클럽", ClubStatus.PENDING_APPROVAL);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", pendingClub.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("ok", equalTo(false));
    }
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests 'com.duing.domain.club.entity.ClubValidateClosableTest'`
Expected: FAIL — `rejectedClubIsClosable` 이 `ClubNotClosableException` 발생으로 실패. (통합 테스트는 Step 4 에서 함께 확인)

- [ ] **Step 3: 구현** —

`Club.java` — `validateClosable` 교체:

```java
    /** 폐쇄 가능 여부 검증. 운영 중단(INACTIVE) 또는 거절(REJECTED) 상태만 허용한다. */
    public void validateClosable() {
        if (this.status != ClubStatus.INACTIVE && this.status != ClubStatus.REJECTED) {
            throw new ClubException.ClubNotClosableException(this.status.name());
        }
    }
```

`ClubException.ClubNotClosableException` 메시지 갱신:

```java
    public static class ClubNotClosableException extends ClubException {
        public ClubNotClosableException(String currentStatus) {
            super("운영 중단(INACTIVE) 또는 거절(REJECTED) 상태의 동아리만 폐쇄할 수 있습니다. 현재 상태: " + currentStatus,
                    HttpStatus.BAD_REQUEST);
        }
    }
```

`AdminClubApi.java` — closeClub Operation description 갱신:

```java
    @Operation(summary = "동아리 폐쇄",
            description = "운영 중단(INACTIVE) 또는 거절(REJECTED) 동아리를 폐쇄(soft-delete)하고 진행 중인 모집·지원·면접·인증·홍보·멤버십·이벤트·즐겨찾기를 자동 종료한다. "
                    + "요청 본문은 생략 가능하며, 생략하거나 폐쇄 사유가 비어 있으면 기본 사유로 처리된다.")
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests 'com.duing.domain.club.entity.ClubValidateClosableTest' --tests 'com.duing.domain.club.controller.AdminClubClosureControllerTest'`
Expected: 전부 PASS, `BUILD SUCCESSFUL` 확인.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club backend/src/test/java/com/duing/domain/club
git commit -m "feat(backend): 거절(REJECTED) 동아리 폐쇄(soft delete) 허용"
```

---

## Task 4: 백엔드 전체 테스트

- [ ] **Step 1: 전체 테스트 실행** (Docker 필요 — Testcontainers)

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test`
Expected: `BUILD SUCCESSFUL` — 출력 끝부분에서 직접 확인. 실패 시 원인 수정 후 재실행(특히 my-clubs/상세를 만지는 다른 도메인 테스트 회귀 주의).

---

# PR 2 — Frontend (`fix/club-status-visibility-web`)

## Task 5: MyClubSummary.status + 마이페이지 상태 가드

**Files:**
- Modify: `frontend/packages/types/src/club.ts:145-152`
- Modify: `frontend/apps/web/app/me/_components/SectionMyClubs.tsx`
- Test: `frontend/apps/web/test/me/section-my-clubs.test.tsx`
- Test: `frontend/apps/web/test/me/acceptance-banner.test.tsx` (팩토리에 status 필드 추가만)

> 백엔드가 ACTIVE 만 반환하므로 이 가드는 심층 방어(defense-in-depth)다. FE-BE 정책 일치 원칙과 "ACTIVE 에서만 이동/관리 버튼 노출" 요건을 코드로 명시한다.

- [ ] **Step 1: 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop
git checkout -b fix/club-status-visibility-web
```

(참고: BE 브랜치가 아직 develop 에 머지 전이면 FE 는 develop 기준으로 작업 — 파일 영역이 겹치지 않아 무관하다.)

- [ ] **Step 2: 실패하는 테스트 작성** — `section-my-clubs.test.tsx` 의 `make` 팩토리에 `status: 'ACTIVE'` 추가:

```tsx
const make = (overrides: Partial<MyClubSummary> = {}): MyClubSummary => ({
  clubId: 1,
  clubName: '두잉',
  logoUrl: null,
  status: 'ACTIVE',
  myRole: 'MEMBER',
  activeRecruitmentCount: 0,
  joinedAt: '2026-05-20T10:00:00Z',
  ...overrides,
});
```

테스트 추가 (describe 블록 끝):

```tsx
  it('INACTIVE 동아리 카드는 관리·둘러보기·탈퇴를 모두 숨기고 "운영 종료된 동아리입니다." 를 노출한다', () => {
    render(
      <SectionMyClubs
        myClubs={[make({ myRole: 'LEADER', status: 'INACTIVE', clubName: '중단동' })]}
      />,
    );
    expect(screen.queryByRole('link', { name: /관리/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /둘러보기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /탈퇴/ })).not.toBeInTheDocument();
    expect(screen.getByText('운영 종료된 동아리입니다.')).toBeInTheDocument();
  });

  it('PENDING_APPROVAL 동아리 카드는 액션 없이 "승인 대기 중인 동아리입니다." 를 노출한다', () => {
    render(
      <SectionMyClubs
        myClubs={[make({ myRole: 'MEMBER', status: 'PENDING_APPROVAL', clubName: '대기동' })]}
      />,
    );
    expect(screen.queryByRole('link', { name: /둘러보기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /탈퇴/ })).not.toBeInTheDocument();
    expect(screen.getByText('승인 대기 중인 동아리입니다.')).toBeInTheDocument();
  });

  it('REJECTED 동아리 카드는 액션 없이 "거절된 동아리입니다." 를 노출한다', () => {
    render(
      <SectionMyClubs
        myClubs={[make({ myRole: 'OFFICER', status: 'REJECTED', clubName: '거절동' })]}
      />,
    );
    expect(screen.queryByRole('link', { name: /관리/ })).not.toBeInTheDocument();
    expect(screen.getByText('거절된 동아리입니다.')).toBeInTheDocument();
  });
```

`acceptance-banner.test.tsx` 의 `MyClubSummary` 팩토리에도 `status: 'ACTIVE'` 필드 추가 (파일을 읽고 기존 팩토리 형태에 맞춰 최소 수정).

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm exec vitest run test/me/section-my-clubs.test.tsx`
Expected: FAIL — 신규 3개 테스트 실패 (status 필드는 타입 추가 전이라 typecheck 에러 가능 — 그 경우도 실패로 간주하고 진행).

- [ ] **Step 4: 구현** —

`packages/types/src/club.ts` — `MyClubSummary` 에 status 추가:

```ts
export type MyClubSummary = {
  clubId: number;
  clubName: string;
  logoUrl: string | null;
  status: ClubStatus;
  myRole: MyClubRole;
  activeRecruitmentCount: number;
  joinedAt: string; // ISO datetime
};
```

`SectionMyClubs.tsx` — import 에 `ClubStatus` 타입 추가, 상태 안내 문구 맵 정의, 액션 영역 가드:

```tsx
import type { ClubStatus, MyClubSummary } from '@duing/types';
```

`ROLE_LABEL` 아래에:

```tsx
/**
 * 비 ACTIVE 상태 안내 문구. 백엔드가 마이페이지 목록을 ACTIVE 로 필터하므로 정상 흐름에선
 * 노출되지 않지만, FE-BE 정책 일치(심층 방어)를 위해 상태 기반으로 액션을 가드한다.
 */
const STATUS_NOTICE: Record<Exclude<ClubStatus, 'ACTIVE'>, string> = {
  PENDING_APPROVAL: '승인 대기 중인 동아리입니다.',
  REJECTED: '거절된 동아리입니다.',
  INACTIVE: '운영 종료된 동아리입니다.',
};
```

map 내부 — `isManager` 위에 `isActive` 선언 후 액션 영역 삼항을 3분기로 교체:

```tsx
              const isActive = club.status === 'ACTIVE';
              const isManager = club.myRole === 'LEADER' || club.myRole === 'OFFICER';
              const roleLabel = ROLE_LABEL[club.myRole];
```

기존 `{isManager ? (...관리 링크...) : (...둘러보기/탈퇴...)}` 블록을:

```tsx
                  {!isActive ? (
                    <span className="text-[12px] text-charcoal-3 shrink-0">
                      {STATUS_NOTICE[club.status]}
                    </span>
                  ) : isManager ? (
                    <Link
                      href={`/manage?clubId=${club.clubId}`}
                      className="btn btn-primary btn-sm"
                      title="동아리 운영자 콘솔로 이동"
                    >
                      관리
                      <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        href={`/clubs/${club.clubId}/member`}
                        className="btn btn-ghost btn-sm"
                        aria-label={`${club.clubName} 둘러보기`}
                      >
                        둘러보기
                        <ArrowRight size={14} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setLeaveTarget(club)}
                        className="btn btn-ghost btn-sm text-coral"
                        aria-label={`${club.clubName} 탈퇴`}
                      >
                        탈퇴
                      </button>
                    </div>
                  )}
```

- [ ] **Step 5: 테스트 통과 + typecheck 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm exec vitest run test/me/ && pnpm typecheck`
Expected: me 테스트 전부 PASS, typecheck 통과. typecheck 이 `MyClubSummary` 객체 리터럴 누락(status)을 다른 파일에서 지적하면 해당 파일도 함께 갱신.

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/packages/types/src/club.ts frontend/apps/web/app/me frontend/apps/web/test/me
git commit -m "fix(web): 마이페이지 동아리 카드 액션을 ACTIVE 상태에서만 노출하고 상태 안내 문구 표시"
```

---

## Task 6: 총동연 콘솔 — REJECTED·INACTIVE 삭제 버튼 + 문구 통일

**Files:**
- Modify: `frontend/apps/web/app/admin/clubs/_components/AdminClubsTable.tsx:120-128`
- Modify: `frontend/apps/web/app/admin/clubs/_components/AdminClubDeleteDialog.tsx` (문구 폐쇄→삭제)
- Modify: `frontend/apps/web/app/admin/clubs/_pages/AdminClubsListPage.tsx:111` (에러 문구)
- Create(Test): `frontend/apps/web/test/admin/clubs/admin-clubs-table.test.tsx`
- Test: `frontend/apps/web/test/admin/clubs/club-delete-dialog.test.tsx` (문구 갱신)

> REJECTED 의 "재심사 대기로 전환"(`clubStatus.ts` STATUS_ACTIONS) 은 그대로 유지 — 삭제 버튼이 옆에 추가된다. 백엔드 API(`close`/`closureReason`) 네이밍은 변경하지 않고 UI 문구만 "삭제" 로 통일한다.

- [ ] **Step 1: 실패하는 테스트 작성** — 새 파일 `admin-clubs-table.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminClubSummary } from '@duing/types';
import { AdminClubsTable } from '../../../app/admin/clubs/_components/AdminClubsTable';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function makeClub(overrides: Partial<AdminClubSummary> = {}): AdminClubSummary {
  return {
    id: 1,
    name: '테스트 동아리',
    category: 'ACADEMIC',
    division: null,
    college: null,
    logoUrl: null,
    status: 'PENDING_APPROVAL',
    tags: [],
    leaderId: null,
    leaderName: null,
    leaderStudentId: null,
    centralClub: false,
    rejectionReason: null,
    statusChangedAt: null,
    statusChangedByName: null,
    ...overrides,
  };
}

function renderTable(club: AdminClubSummary, onCloseClick = vi.fn()) {
  render(
    <AdminClubsTable
      clubs={[club]}
      onActionClick={vi.fn()}
      onCentralClubToggleClick={vi.fn()}
      onCloseClick={onCloseClick}
    />,
  );
  return { onCloseClick };
}

describe('AdminClubsTable 삭제 버튼 노출', () => {
  it('REJECTED 동아리 행은 "재심사 대기로 전환" 과 "삭제" 버튼을 모두 노출한다', () => {
    renderTable(makeClub({ status: 'REJECTED' }));
    expect(screen.getByRole('button', { name: '재심사 대기로 전환' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('INACTIVE 동아리 행은 "재활성" 과 "삭제" 버튼을 노출한다', () => {
    renderTable(makeClub({ status: 'INACTIVE' }));
    expect(screen.getByRole('button', { name: '재활성' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('ACTIVE 동아리 행은 "삭제" 버튼을 노출하지 않는다', () => {
    renderTable(makeClub({ status: 'ACTIVE' }));
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('PENDING_APPROVAL 동아리 행은 "삭제" 버튼을 노출하지 않는다', () => {
    renderTable(makeClub({ status: 'PENDING_APPROVAL' }));
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('"삭제" 클릭 시 onCloseClick 이 해당 동아리로 호출된다', () => {
    const rejectedClub = makeClub({ status: 'REJECTED', id: 7, name: '거절 동아리' });
    const { onCloseClick } = renderTable(rejectedClub);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onCloseClick).toHaveBeenCalledWith(rejectedClub);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm exec vitest run test/admin/clubs/admin-clubs-table.test.tsx`
Expected: FAIL — REJECTED 행에 삭제 버튼 없음 + 버튼 라벨이 "폐쇄".

- [ ] **Step 3: 구현** —

`AdminClubsTable.tsx:120-128` — 노출 조건 확대 + 라벨 변경:

```tsx
                      {(club.status === 'INACTIVE' || club.status === 'REJECTED') && (
                        <button
                          type="button"
                          onClick={() => onCloseClick(club)}
                          className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          삭제
                        </button>
                      )}
```

`AdminClubDeleteDialog.tsx` — 사용자 노출 문구를 삭제로 통일 (API payload 는 그대로):
- `<DialogTitle>동아리 폐쇄</DialogTitle>` → `<DialogTitle>동아리 삭제</DialogTitle>`
- `을(를) 폐쇄합니다.` → `을(를) 삭제합니다.`
- `폐쇄하려면 동아리명을 정확히 입력하세요.` → `삭제하려면 동아리명을 정확히 입력하세요.`
- `폐쇄 사유 (선택)` 라벨/aria-label → `삭제 사유 (선택)`
- placeholder `폐쇄 사유를 입력하세요 (선택)` → `삭제 사유를 입력하세요 (선택)`
- 제출 버튼 `폐쇄` → `삭제` (`{isPending ? '처리 중…' : '삭제'}`)

`AdminClubsListPage.tsx:111` — `'폐쇄에 실패했습니다.'` → `'삭제에 실패했습니다.'`

`club-delete-dialog.test.tsx` — 문구 갱신: `getByRole('button', { name: '폐쇄' })` → `'삭제'` (3곳), `getByLabelText('폐쇄 사유 (선택)')` → `'삭제 사유 (선택)'` (1곳). it 설명 문구의 "폐쇄" 도 "삭제" 로 갱신. `makeClub` 의 `name: '폐쇄 동아리'` 값은 임의 데이터이므로 유지해도 무방.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm exec vitest run test/admin/clubs/`
Expected: 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/admin/clubs frontend/apps/web/test/admin/clubs
git commit -m "feat(web): 총동연 콘솔 REJECTED·INACTIVE 동아리 삭제 버튼 및 문구 통일"
```

---

## Task 7: 프론트엔드 전체 검증

- [ ] **Step 1: lint / typecheck / 전체 테스트 / build**

Run:
```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web
pnpm lint && pnpm typecheck && pnpm exec vitest run && pnpm build
```
Expected: 모두 성공. build 출력에서 에러 없음 확인. 실패 시 수정 후 재실행.

---

## 최종 확인 사항 매핑 (스펙 체크리스트 → 구현)

1. PENDING 마이페이지 미표시 → Task 1 (BE 필터) + Task 5 (FE 가드)
2. REJECTED 마이페이지 미표시 → Task 1 + Task 5
3. INACTIVE 마이페이지 미표시 → Task 1 + Task 5
4. DELETED 마이페이지 미표시 → 기존 `@SQLRestriction` + 폐쇄 시 멤버십 제거 (기확보, Task 1 테스트가 간접 보장)
5. REJECTED 에 삭제 버튼 → Task 6
6. INACTIVE 에 삭제 버튼 → Task 6
7. REJECTED 재심사 전환 + 삭제 병행 → Task 6 (기존 STATUS_ACTIONS 유지 + 삭제 추가, 테스트로 고정)
8. 삭제 후 목록·상세 갱신 → 기존 `useCloseClubMutation` invalidation (admin clubsAll + club detail/all)
9. ACTIVE 에서만 이동/관리 버튼 → Task 5
10. 관련 API 동일 정책 → Task 1 (me/clubs), Task 2 (공개 상세), 공개 목록은 기존 ACTIVE 필터 확인됨, 운영 콘솔 목록(`findActiveManagedClubsByUser`)도 기존 ACTIVE 필터 확인됨

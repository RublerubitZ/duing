# 총동연 콘솔 동아리 상세 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연(ADMIN) 콘솔의 동아리 상세 화면에서 (1) 관리자 전용 동아리 정보 수정과 (2) 단과대/전공까지 보여주는 회원 명단 + 검색 + 클라이언트 페이지네이션을 제공한다.

**Architecture:** 리더 전용 `PATCH /clubs/{id}`의 내부 업데이트 로직을 재사용하되 리더 멤버십 검증만 걷어낸 `PATCH /admin/clubs/{clubId}`를 추가한다(백엔드, PR-1). 프론트는 이미 존재하는 admin 회원 조회 API로 명단을 확장하고, 공용 `Pagination`·`useDebouncedValue`로 클라이언트 검색/페이지네이션을 붙이며, 기존 `ClubInfoForm`을 뮤테이션 주입 구조로 바꿔 관리자 수정 모드에서 재사용한다(PR-2).

**Tech Stack:** Backend — Spring Boot 3.4 / Java 21, RestAssured + TestContainers. Frontend — Next.js 15 / React 19, TanStack Query, vitest + MSW + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-21-admin-club-detail-edit-and-member-roster-design.md`

## Global Constraints

- **PR 분리:** PR-1(backend, Task 1) → PR-2(frontend, Task 2~4). PR-2는 PR-1 머지 후 머지(수정 API 의존). 각 PR은 `develop`에서 분기, `develop`으로.
- **커밋:** Conventional Commits `feat(backend): ...` / `feat(frontend): ...`, 한국어 설명. `[#이슈번호]` 형식 금지. 커밋/PR 본문에 `Co-Authored-By`/`🤖 Generated` 등 Claude attribution 라인 절대 금지.
- **push·PR 생성은 사용자 지시 후에만.** 이 계획의 커밋 단계는 전부 로컬 커밋. 자동 push/PR/머지 금지.
- **Backend:** DDD 구조·네이밍 유지. `api/` Swagger 인터페이스 없이 Controller 단독 작성 금지. DTO는 `record`. Service `@Transactional(readOnly=true)` 기본 + 쓰기 메서드만 `@Transactional`. 검증 메시지는 한국어. 시크릿 하드코딩 금지. Flyway 기존 파일 수정 금지(이번엔 마이그레이션 없음).
- **Frontend:** `any`·`as` 금지(불가피 시 `unknown`+타입가드/zod). 타입은 `type`(`interface` 금지). 네트워크는 반드시 `@duing/api` 경유. 서버 상태는 TanStack Query. 테스트에서 `useQuery`/`@duing/hooks` 내부 모킹 금지 — MSW + 실제 `createApiClient` 사용.
- **응답 형태 결정:** `PATCH /admin/clubs/{clubId}`는 미러 대상인 리더 `PATCH /clubs/{id}`와 동일하게 **200 + `ClubDetailResponse`**(수정 후 재조회)를 반환한다. 일반 관례(PATCH→204)에서 의도적으로 벗어난 것 — 미러 대상 엔드포인트와 FE `ClubDetail` 계약에 맞춘다.
- **리뷰:** 모든 Task는 `duing-code-reviewer` + `codex:review`. Task 1(권한·상태전이)은 `codex:adversarial-review` 추가.

---

## Task 1: [PR-1 · Backend] 관리자 전용 동아리 수정 API `PATCH /admin/clubs/{clubId}`

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/ClubService.java` (인터페이스에 `updateAsAdmin` 추가)
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java:157-173` (`update` 리팩터 + `updateAsAdmin` + `applyProfileUpdate`)
- Modify: `backend/src/main/java/com/duing/domain/club/api/AdminClubApi.java` (Swagger 메서드 추가)
- Modify: `backend/src/main/java/com/duing/domain/club/controller/AdminClubController.java` (구현 추가)
- Test: `backend/src/test/java/com/duing/domain/club/controller/AdminClubUpdateControllerTest.java` (신규)

**Interfaces:**
- Consumes: 기존 `UpdateClubRequest.toCommand(clubId, requesterId)` → `UpdateClubCommand`, `UpdateClubCommand.toPayload()` → `Club.UpdatePayload`, `Club.update(payload)`, `ClubDetailResponse.from(clubService.getById(clubId))`.
- Produces: `ClubService.updateAsAdmin(UpdateClubCommand)` → `void`. HTTP `PATCH /api/v1/admin/clubs/{clubId}` → `200 ApiResponse<ClubDetailResponse>`; 비-ADMIN → 403; 미존재 → 404; 이름 중복 → 409.

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout develop && git pull
git checkout -b feat/admin-club-update-api
```

- [ ] **Step 2: 실패하는 통합 테스트 작성**

`backend/src/test/java/com/duing/domain/club/controller/AdminClubUpdateControllerTest.java` 생성:

```java
package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.Map;
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
class AdminClubUpdateControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private User studentUser;
    private User leaderUser;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        studentUser = saveUser("학생사용자", UserRole.STUDENT);
        leaderUser = saveUser("동아리장후보", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
    }

    @Test
    @DisplayName("총동연 관리자는 자신이 멤버가 아닌 동아리의 기본 정보를 수정할 수 있고 변경된 상세가 반환된다")
    void adminUpdatesClubProfileSuccessfully() throws Exception {
        Club club = saveClubWithLeader("수정대상동아리", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "새이름동아리", "description", "관리자가 수정한 설명"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.name", equalTo("새이름동아리"))
                    .body("data.description", equalTo("관리자가 수정한 설명"));
    }

    @Test
    @DisplayName("일반 학생이 관리자 수정 엔드포인트를 호출하면 403 이 반환된다")
    void studentCannotUpdateClub() throws Exception {
        Club club = saveClubWithLeader("학생접근거부동아리", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "학생이바꾼이름"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 동아리를 수정하면 404 가 반환된다")
    void updatingMissingClubReturnsNotFound() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "없는동아리"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", 999_999L)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("다른 동아리와 중복되는 이름으로 수정하면 409 가 반환된다")
    void updatingToDuplicateNameReturnsConflict() throws Exception {
        Club existing = saveClubWithLeader("이미있는동아리", ClubStatus.ACTIVE);
        Club target = saveClubWithLeader("수정할동아리", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", existing.getName()))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", target.getId())
                .then()
                    .statusCode(HttpStatus.CONFLICT.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("운영 중단(INACTIVE) 동아리도 관리자는 수정할 수 있다")
    void adminCanUpdateInactiveClub() throws Exception {
        Club inactiveClub = saveClubWithLeader("운영중단동아리", ClubStatus.INACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("description", "중단 상태에서도 수정"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", inactiveClub.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.description", equalTo("중단 상태에서도 수정"));
    }

    @Test
    @DisplayName("일부 필드만 보내면 나머지 필드는 변경되지 않는다")
    void partialUpdateLeavesOtherFieldsUnchanged() throws Exception {
        Club club = saveClubWithLeader("부분수정동아리", ClubStatus.ACTIVE);
        String originalName = club.getName();

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("description", "설명만 변경"))
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.name", equalTo(originalName))
                    .body("data.description", equalTo("설명만 변경"));
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveClubWithLeader(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        Club saved = clubRepository.save(created);
        clubMemberRepository.save(ClubMember.asLeader(saved, leaderUser));
        return saved;
    }
}
```

- [ ] **Step 3: 테스트 실패 확인 (컴파일 실패 = 엔드포인트/메서드 없음)**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.club.controller.AdminClubUpdateControllerTest"`
Expected: FAIL — `PATCH /api/v1/admin/clubs/{clubId}` 미존재로 404 또는 컴파일 통과 후 6개 테스트 실패.

- [ ] **Step 4: `ClubService` 인터페이스에 메서드 추가**

`backend/.../club/service/ClubService.java` — `void update(UpdateClubCommand updateClubCommand);` 바로 아래에 추가:

```java
    void update(UpdateClubCommand updateClubCommand);

    /** 총동연(ADMIN) 전용 프로필 수정 — 리더 멤버십·상태 게이트 없이 조회 가능한 모든 상태의 동아리를 수정한다. */
    void updateAsAdmin(UpdateClubCommand updateClubCommand);
```

- [ ] **Step 5: `GeneralClubService.update` 리팩터 + `updateAsAdmin` + `applyProfileUpdate` 추가**

`backend/.../club/service/GeneralClubService.java`의 기존 `update`(L157-173)를 아래로 교체:

```java
    @Override
    @Transactional
    public void update(UpdateClubCommand updateClubCommand) {
        // 프로필 보완 게이트(D6) — 재심사 보완(PENDING_APPROVAL·REJECTED)을 허용해야 하므로 운영 행위 게이트를 쓰지 않는다.
        clubAuthService.requireEditableClubLeader(updateClubCommand.requesterId(), updateClubCommand.clubId());
        applyProfileUpdate(updateClubCommand);
    }

    @Override
    @Transactional
    public void updateAsAdmin(UpdateClubCommand updateClubCommand) {
        // 총동연(ADMIN) 수정 — 웹 계층 @PreAuthorize("hasRole('ADMIN')") 가 권한을 이미 검증한다.
        // 리더 멤버십·동아리 상태 게이트 없이 조회 가능한(soft-delete 되지 않은) 모든 상태의 동아리를 수정한다.
        applyProfileUpdate(updateClubCommand);
    }

    private void applyProfileUpdate(UpdateClubCommand updateClubCommand) {
        Club club = clubRepository.findById(updateClubCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        String newName = updateClubCommand.name();
        if (newName != null && !newName.equals(club.getName())
                && clubRepository.existsByName(newName)) {
            throw new ClubException.DuplicateClubNameException();
        }

        club.update(updateClubCommand.toPayload());
    }
```

- [ ] **Step 6: `AdminClubApi`에 Swagger 메서드 추가**

`backend/.../club/api/AdminClubApi.java` — import 블록에 추가:

```java
import com.duing.domain.club.controller.dto.request.UpdateClubRequest;
```

`getAdminClub`(단건 조회) 메서드 바로 아래에 추가:

```java
    @Operation(summary = "동아리 정보 수정 (ADMIN)",
            description = "총동연이 임의 동아리의 기본 정보를 부분 수정한다. 리더 PATCH /clubs/{clubId} 와 동일한 입력·검증을 쓰며, "
                    + "리더 멤버십 대신 ADMIN 권한으로 접근한다. null/미포함 필드는 변경되지 않고, 조회 가능한 모든 상태의 동아리를 수정할 수 있다.")
    @PatchMapping("/admin/clubs/{clubId}")
    ResponseEntity<ApiResponse<ClubDetailResponse>> updateClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubRequest updateClubRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

- [ ] **Step 7: `AdminClubController`에 구현 추가**

`backend/.../club/controller/AdminClubController.java` — import 블록에 추가:

```java
import com.duing.domain.club.controller.dto.request.UpdateClubRequest;
```

`getAdminClub` 구현 바로 아래에 추가(리더 `ClubController.updateClub` 미러 — 200 + 재조회 상세):

```java
    @Override
    public ResponseEntity<ApiResponse<ClubDetailResponse>> updateClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubRequest updateClubRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubService.updateAsAdmin(updateClubRequest.toCommand(clubId, currentUser.id()));
        ClubDetailResponse response = ClubDetailResponse.from(clubService.getById(clubId));
        return ResponseEntity.ok(ApiResponse.success(response));
    }
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.club.controller.AdminClubUpdateControllerTest"`
Expected: PASS (6 tests). 출력에서 `BUILD SUCCESSFUL` 확인(`| tail` 금지 — exit code 가림).

- [ ] **Step 9: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club backend/src/test/java/com/duing/domain/club/controller/AdminClubUpdateControllerTest.java
git commit -m "feat(backend): 총동연 관리자 전용 동아리 정보 수정 API 추가"
```

- [ ] **Step 10: 리뷰 디스패치** — `duing-code-reviewer` + `codex:review` + `codex:adversarial-review`(ADMIN 검증이 `@PreAuthorize` 한 곳에만 있는지, 상태 게이트 제거로 인한 우회/안전성). 구현 subagent에는 push·PR 금지 명시.

---

## Task 2: [PR-2 · Frontend] admin 수정 API 클라이언트 + 훅

**Files:**
- Modify: `frontend/packages/api/src/client.ts` (`admin.clubs` 인터페이스 + 구현에 `update` 추가)
- Modify: `frontend/packages/hooks/src/admin.ts` (`useAdminUpdateClubMutation` 추가)

**Interfaces:**
- Consumes: 기존 타입 `UpdateClubPayload`, `ClubDetail`(`@duing/types`), `adminQueryKeys.clubsDetail/clubsAll`, `clubQueryKeys.detail/all`, `useApiClient`.
- Produces: `client.admin.clubs.update(clubId: number, payload: UpdateClubPayload): Promise<ClubDetail>` (`PATCH admin/clubs/{clubId}`); `useAdminUpdateClubMutation(clubId: number)` → `UseMutationResult`로 `mutateAsync(payload) => Promise<ClubDetail>`, `isPending`.

- [ ] **Step 1: PR-2 브랜치 생성**

```bash
git checkout develop && git pull
git checkout -b feat/admin-club-detail-edit-members
```

- [ ] **Step 2: `client.ts` 인터페이스에 `update` 선언 추가**

`frontend/packages/api/src/client.ts`의 `admin.clubs` **인터페이스 블록**(≈L513-517)에서 `members(...)` 선언 아래에 추가:

```ts
      members(clubId: number): Promise<AdminClubMember[]>;
      /** 총동연 전용 동아리 정보 수정. 리더 PATCH clubs/{id} 와 동일 payload, ADMIN 권한으로 접근. */
      update(clubId: number, payload: UpdateClubPayload): Promise<ClubDetail>;
```

`UpdateClubPayload`가 이 파일에 이미 import 되어 있는지 확인하고 없으면 상단 타입 import에 추가(`clubs.update` 구현이 이미 쓰므로 대개 존재).

- [ ] **Step 3: `client.ts` ky 구현에 `update` 추가**

같은 파일의 `admin.clubs` **구현 블록**(≈L1358-1363)에서 `members: ...` 아래에 추가:

```ts
        members: (clubId) =>
          jsonOk<AdminClubMember[]>(http.get(`admin/clubs/${clubId}/members`)),
        update: (clubId, payload) =>
          jsonOk<ClubDetail>(http.patch(`admin/clubs/${clubId}`, { json: payload })),
```

- [ ] **Step 4: `useAdminUpdateClubMutation` 추가**

`frontend/packages/hooks/src/admin.ts` — `UpdateClubPayload`가 import 안 되어 있으면 타입 import에 추가한 뒤, 파일 끝(다른 admin 훅들과 같은 위치)에 추가:

```ts
export function useAdminUpdateClubMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateClubPayload) => client.admin.clubs.update(clubId, payload),
    onSuccess: (updated) => {
      // 관리자 상세는 반환값으로 즉시 갱신, 나머지 관리자/공개 목록·상세는 무효화해 재조회.
      queryClient.setQueryData(adminQueryKeys.clubsDetail(clubId), updated);
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
    },
  });
}
```

`useMutation`/`useQueryClient`/`useApiClient`/`adminQueryKeys`/`clubQueryKeys`는 이 파일에 이미 import 되어 있음(기존 admin 뮤테이션 참고). 없으면 상단에 추가.

- [ ] **Step 5: 타입체크**

Run: `cd frontend && pnpm --filter @duing/api typecheck && pnpm --filter @duing/hooks typecheck`
(위 필터명이 다르면 `pnpm -w typecheck` 또는 루트 `pnpm typecheck` 사용.)
Expected: 통과. (이 데이터 계층은 Task 4의 페이지 테스트로 실제 동작 검증됨.)

- [ ] **Step 6: 커밋**

```bash
git add frontend/packages/api/src/client.ts frontend/packages/hooks/src/admin.ts
git commit -m "feat(frontend): 총동연 동아리 수정 API 클라이언트·훅 추가"
```

---

## Task 3: [PR-2 · Frontend] `ClubInfoForm` 뮤테이션 주입 리팩터 + 리더 호출부 갱신

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/page.tsx`

**Interfaces:**
- Consumes: `useUpdateClubMutation`(리더 호출부), `UpdateClubPayload`/`ClubDetail`.
- Produces: `ClubInfoForm` props = `{ detail: ClubDetail; readOnly: boolean; mutation: ClubUpdateMutation; onCancel?: () => void; onSaved?: () => void }` (기존 `clubId` prop·내부 `useUpdateClubMutation` 제거). `type ClubUpdateMutation = { mutateAsync: (payload: UpdateClubPayload) => Promise<ClubDetail>; isPending: boolean }`.

- [ ] **Step 1: `ClubInfoForm` 시그니처 변경 — import·props·내부 훅 제거**

`ClubInfoForm.tsx` 상단에서 `import { useUpdateClubMutation } from '@duing/hooks';` **삭제**. props 타입을 교체:

```ts
type ClubUpdateMutation = {
  mutateAsync: (payload: UpdateClubPayload) => Promise<ClubDetail>;
  isPending: boolean;
};

type ClubInfoFormProps = {
  detail: ClubDetail;
  readOnly: boolean;
  mutation: ClubUpdateMutation;
  onCancel?: () => void;
  onSaved?: () => void;
};
```

컴포넌트 시그니처를 `export function ClubInfoForm({ detail, readOnly, mutation, onCancel, onSaved }: ClubInfoFormProps) {` 로 바꾸고, 기존 `const mutation = useUpdateClubMutation(clubId);`(L89) **삭제**(이제 prop). `ClubDetail`은 이미 import 됨.

- [ ] **Step 2: 저장 성공 시 `onSaved` 호출**

`handleSubmit`의 성공 처리(`await mutation.mutateAsync(payload); setSavedAt(new Date());`)를 아래로:

```ts
    try {
      await mutation.mutateAsync(payload);
      setSavedAt(new Date());
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
```

- [ ] **Step 3: 저장 버튼 영역에 취소 버튼 추가**

기존 저장 버튼 블록(`{!readOnly && ( ... )}`)을 아래로 교체:

```tsx
        {!readOnly && (
          <div className="mt-6 flex items-center gap-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {mutation.isPending && <ButtonSpinner />}저장
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={mutation.isPending}
                className="rounded-[8px] border border-[#cfcab8] px-4 py-2 text-[14px] text-[#4a5247] hover:bg-[#f5f3ec] disabled:opacity-50"
              >
                취소
              </button>
            )}
          </div>
        )}
```

- [ ] **Step 4: 리더 호출부(`info/page.tsx`) 갱신 — 뮤테이션 생성·주입**

`info/page.tsx` import에 `useUpdateClubMutation` 추가:

```ts
import { useClubDetailQuery, useManagedClubsQuery, useUpdateClubMutation } from '@duing/hooks';
```

훅 호출부(early return 이전, `useClubDetailQuery` 아래)에 추가:

```ts
  const updateMutation = useUpdateClubMutation(currentClubId);
```

마지막 return 을 교체:

```tsx
  return <ClubInfoForm detail={detail} readOnly={readOnly} mutation={updateMutation} />;
```

- [ ] **Step 5: 타입체크 + 빌드로 리더 경로 무손상 확인**

Run: `cd frontend && pnpm --filter web typecheck && pnpm --filter web build`
(필터명이 다르면 워크스페이스 실제 앱 패키지명으로.)
Expected: 통과. 타입체크가 `ClubInfoForm` 호출부 계약(주입 mutation)을 강제하므로 리더 페이지 갱신 누락 시 실패. (폼 렌더/제출 동작은 Task 4의 admin 수정 플로우 테스트로 동일 컴포넌트가 커버됨.)

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx frontend/apps/web/app/manage/clubs/[clubId]/info/page.tsx
git commit -m "feat(frontend): ClubInfoForm 수정 뮤테이션 주입 구조로 리팩터"
```

---

## Task 4: [PR-2 · Frontend] 동아리 상세 페이지 — 회원 명단 확장·검색·페이지네이션 + 수정 모드

**Files:**
- Modify: `frontend/apps/web/app/admin/clubs/[clubId]/_pages/AdminClubDetailPage.tsx` (전면 개편)
- Test: `frontend/apps/web/test/admin/clubs/admin-club-detail-page.test.tsx` (신규)

**Interfaces:**
- Consumes: `useAdminClubDetailQuery`, `useAdminClubMembersQuery`, `useAdminUpdateClubMutation`(Task 2), `ClubInfoForm`(Task 3, 주입 mutation), `Pagination`, `useDebouncedValue`, `collegeDisplayName`, 타입 `AdminClubMember`.
- Produces: 관리자 상세 화면(조회 → 수정 버튼 → `ClubInfoForm` 편집 모드; 회원 명단 = 이름·학번·단과대·전공, 검색, 클라이언트 페이지네이션 20/페이지).

- [ ] **Step 1: 실패하는 페이지 테스트 작성**

`frontend/apps/web/test/admin/clubs/admin-club-detail-page.test.tsx` 생성:

```tsx
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminClubMember, ClubDetail } from '@duing/types';
import { collegeDisplayName } from '@/app/_lib/college';

import { AdminClubDetailPage } from '@/app/admin/clubs/[clubId]/_pages/AdminClubDetailPage';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const CLUB_DETAIL: ClubDetail = {
  id: 1,
  name: '두잉동아리',
  category: 'ACADEMIC',
  division: '1',
  college: null,
  logoUrl: null,
  status: 'ACTIVE',
  tags: ['개발'],
  tagline: '함께 성장',
  centralClub: true,
  description: '기존 소개',
  coverUrl: null,
  snsLinks: [],
  faqs: [],
  leaderId: 10,
  leaderName: '회장',
  photos: [],
  foundedYear: 2018,
  cohortNumber: 10,
  location: '학생회관 405호',
  contactEmail: null,
  activityFrequency: 1,
  activeDays: [],
  membershipFee: null,
  highlights: [],
  majorProjects: null,
  activeRecruitment: null,
};

const MEMBERS: AdminClubMember[] = Array.from({ length: 25 }, (_, index) => ({
  memberId: index + 1,
  name: index === 0 ? '홍길동' : `회원${index + 1}`,
  studentId: `2023${String(1000 + index).padStart(4, '0')}`,
  major: index === 0 ? '컴퓨터공학과' : '전자공학과',
  college: 'IT_ENGINEERING',
  grade: 'FRESHMAN',
  role: index === 0 ? 'LEADER' : index < 3 ? 'OFFICER' : 'MEMBER',
}));

const server = setupServer(
  http.get('*/admin/clubs/1', () =>
    HttpResponse.json({ ok: true, data: CLUB_DETAIL, message: null }),
  ),
  http.get('*/admin/clubs/1/members', () =>
    HttpResponse.json({ ok: true, data: MEMBERS, message: null }),
  ),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </ApiClientProvider>
    );
  }
  return render(
    <Wrapper>
      <AdminClubDetailPage clubId={1} />
    </Wrapper>,
  );
}

describe('AdminClubDetailPage', () => {
  it('회원 행에 단과대·전공을 표시하고 총 회원 수를 보여준다', async () => {
    renderPage();
    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText(/회원 25명/)).toBeInTheDocument();
    expect(screen.getByText(/컴퓨터공학과/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(collegeDisplayName('IT_ENGINEERING')))).toBeInTheDocument();
  });

  it('25명이면 페이지네이션이 나타나고 첫 페이지엔 20명만 보인다', async () => {
    renderPage();
    await screen.findByText('홍길동');
    // 21번째 회원은 2페이지 → 첫 페이지에 없음
    expect(screen.queryByText('회원21')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
  });

  it('이름·학번·전공으로 검색하면 결과가 필터링된다', async () => {
    renderPage();
    await screen.findByText('홍길동');
    await userEvent.type(screen.getByLabelText('회원 검색'), '홍길');
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument();
      expect(screen.queryByText('회원5')).not.toBeInTheDocument();
    });
  });

  it('검색 결과가 없으면 Empty 문구를 보여준다', async () => {
    renderPage();
    await screen.findByText('홍길동');
    await userEvent.type(screen.getByLabelText('회원 검색'), '존재하지않는이름');
    expect(await screen.findByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('수정 버튼으로 편집 모드에 진입해 저장하면 변경 payload 로 PATCH 되고 편집 모드가 닫힌다', async () => {
    let patchBody: unknown = null;
    server.use(
      http.patch('*/admin/clubs/1', async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          ok: true,
          data: { ...CLUB_DETAIL, name: '새이름두잉' },
          message: null,
        });
      }),
    );
    renderPage();
    await screen.findByText('홍길동');

    await userEvent.click(screen.getByRole('button', { name: '수정' }));
    const nameInput = await screen.findByLabelText('이름');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '새이름두잉');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(patchBody).toEqual({ name: '새이름두잉' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument(),
    );
  });
});
```

> `Grade` 리터럴은 FE `@duing/types`의 유효값이어야 한다(백엔드 `Grade.FRESHMAN` 대응). 타입 에러가 나면 `packages/types`의 `Grade` 유니온에서 실제 값으로 교체.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && pnpm --filter web test admin-club-detail-page`
Expected: FAIL — 현재 페이지는 리더 훅·단과대 미표시·검색/페이지네이션/수정 버튼 없음.

- [ ] **Step 3: `AdminClubDetailPage.tsx` 전면 교체**

`frontend/apps/web/app/admin/clubs/[clubId]/_pages/AdminClubDetailPage.tsx` 전체를 아래로 교체:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useAdminClubDetailQuery,
  useAdminClubMembersQuery,
  useAdminUpdateClubMutation,
} from '@duing/hooks';
import type { AdminClubMember } from '@duing/types';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { Pagination } from '@/components/Pagination';
import { collegeDisplayName } from '@/app/_lib/college';
import { useDebouncedValue } from '@/app/admin/_hooks/useDebouncedValue';
import { ClubInfoForm } from '@/app/manage/clubs/[clubId]/info/_components/ClubInfoForm';
import { cn } from '../../../../_lib/cn';
import { ClubLogo } from '../../../../_components/ClubLogo';
import { STATUS_BADGE_CLASS, STATUS_LABEL } from '../../_lib/clubStatus';
import { AdminAssignLeaderCard } from '../_components/AdminAssignLeaderCard';

type Props = {
  clubId: number;
};

const MEMBER_PAGE_SIZE = 20;

const CATEGORY_LABEL: Record<string, string> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '예술',
  SPORTS: '체육',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

const ROLE_LABEL: Record<AdminClubMember['role'], string> = {
  LEADER: '회장',
  OFFICER: '임원',
  MEMBER: '회원',
};

function MemberRow({ member }: { member: AdminClubMember }) {
  const affiliation = [collegeDisplayName(member.college), member.major]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-slate-900">{member.name}</span>
        <span className="ml-2 text-xs text-slate-500">{member.studentId}</span>
        {affiliation && <p className="mt-0.5 truncate text-xs text-slate-500">{affiliation}</p>}
      </div>
      <span className="shrink-0 text-xs text-slate-400">{ROLE_LABEL[member.role]}</span>
    </div>
  );
}

export function AdminClubDetailPage({ clubId }: Props) {
  const detailQuery = useAdminClubDetailQuery(clubId);
  const membersQuery = useAdminClubMembersQuery(clubId);
  const updateMutation = useAdminUpdateClubMutation(clubId);

  const [editing, setEditing] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberPage, setMemberPage] = useState(0);
  const debouncedMemberSearch = useDebouncedValue(memberSearch.trim(), 250);

  const club = detailQuery.data;
  const members = membersQuery.data ?? [];

  const normalizedQuery = debouncedMemberSearch.toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const filteredMembers = isSearching
    ? members.filter(
        (member) =>
          member.name.toLowerCase().includes(normalizedQuery) ||
          member.studentId.toLowerCase().includes(normalizedQuery) ||
          member.major.toLowerCase().includes(normalizedQuery),
      )
    : members;
  const totalPages = Math.ceil(filteredMembers.length / MEMBER_PAGE_SIZE);
  const pageMembers = filteredMembers.slice(
    memberPage * MEMBER_PAGE_SIZE,
    memberPage * MEMBER_PAGE_SIZE + MEMBER_PAGE_SIZE,
  );

  const hasNoLeader = !members.some((member) => member.role === 'LEADER');

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/clubs" className="text-[13px] text-charcoal-2 hover:text-ink">
          ← 동아리 목록
        </Link>
        {club && (
          <>
            <h1 className="text-[22px] font-bold text-ink">{club.name}</h1>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                  STATUS_BADGE_CLASS[club.status],
                )}
              >
                {STATUS_LABEL[club.status]}
              </span>
              {club.centralClub && (
                <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  🏛️ 중앙
                </span>
              )}
            </div>
            <Link
              href={`/admin/clubs/${clubId}/member-history`}
              className="ml-auto text-[13px] text-indigo-600 hover:underline"
            >
              권한 변경 이력 →
            </Link>
          </>
        )}
      </header>

      {detailQuery.isLoading && <LoadingGate label="동아리 정보 불러오는 중" />}
      {detailQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">동아리 정보를 불러오지 못했습니다.</p>
      )}

      {club &&
        (editing ? (
          <ClubInfoForm
            detail={club}
            readOnly={false}
            mutation={updateMutation}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <div className="space-y-8">
            {/* 기본 정보 */}
            <section className="rounded-lg border border-line bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-ink">기본 정보</h2>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="btn btn-primary text-[13px]"
                >
                  수정
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-slate-400">카테고리</dt>
                  <dd className="text-slate-800">{CATEGORY_LABEL[club.category] ?? club.category}</dd>
                </div>
                {club.division && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-slate-400">분류</dt>
                    <dd className="text-slate-800">{club.division}</dd>
                  </div>
                )}
                {club.tags.length > 0 && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-[11px] font-semibold uppercase text-slate-400">태그</dt>
                    <dd className="flex flex-wrap gap-1 mt-0.5">
                      {club.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                        >
                          #{tag}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {club.description && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-[11px] font-semibold uppercase text-slate-400">설명</dt>
                    <dd className="whitespace-pre-wrap text-slate-700 text-[13px]">{club.description}</dd>
                  </div>
                )}
                {club.logoUrl && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-slate-400">로고</dt>
                    <dd>
                      <div className="relative mt-0.5 h-10 w-10 overflow-hidden rounded-md bg-graysoft">
                        <ClubLogo logoUrl={club.logoUrl} alt={`${club.name} 로고`} />
                      </div>
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            {/* 회원 */}
            <section className="rounded-lg border border-line bg-graysoft p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-ink">
                  회원 {members.length}명
                  {isSearching && filteredMembers.length !== members.length && (
                    <span className="ml-2 text-[13px] font-normal text-slate-500">
                      · {filteredMembers.length}명 검색됨
                    </span>
                  )}
                </h2>
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(event) => {
                    setMemberSearch(event.target.value);
                    setMemberPage(0);
                  }}
                  placeholder="이름·학번·전공 검색"
                  aria-label="회원 검색"
                  className="w-full max-w-[240px] rounded-md border border-line bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>

              {membersQuery.isLoading ? (
                <LoadingGate className="min-h-0 py-10" label="회원 목록 불러오는 중" />
              ) : membersQuery.isError ? (
                <p className="text-[13px] text-coral">회원 목록을 불러오지 못했습니다.</p>
              ) : members.length === 0 ? (
                <p className="text-[13px] text-slate-400 italic">등록된 회원이 없습니다.</p>
              ) : filteredMembers.length === 0 ? (
                <p className="text-[13px] text-slate-400 italic">검색 결과가 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    {pageMembers.map((member) => (
                      <MemberRow key={member.memberId} member={member} />
                    ))}
                  </div>
                  <Pagination
                    page={memberPage}
                    totalPages={totalPages}
                    onChange={setMemberPage}
                    ariaLabel="회원 목록 페이지"
                    totalElements={filteredMembers.length}
                    pageSize={MEMBER_PAGE_SIZE}
                  />
                </div>
              )}
            </section>

            {/* 강제 회장 지정 카드 — LEADER 없을 때만 */}
            {hasNoLeader && <AdminAssignLeaderCard clubId={clubId} />}
          </div>
        ))}
    </main>
  );
}
```

> `formatDateKst`·`useClubMembersQuery`·`ClubMember` 타입·`MemberGroup` 컴포넌트는 더 이상 쓰지 않으므로 기존 파일에서 남기지 말 것(미사용 import lint 실패 방지).

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && pnpm --filter web test admin-club-detail-page`
Expected: PASS (5 tests). 실패 시 `Grade` 리터럴/`collegeDisplayName` 라벨/버튼 접근성 이름부터 확인.

- [ ] **Step 5: 타입체크 + 빌드**

Run: `cd frontend && pnpm --filter web typecheck && pnpm --filter web build`
Expected: 통과.

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/admin/clubs/[clubId]/_pages/AdminClubDetailPage.tsx frontend/apps/web/test/admin/clubs/admin-club-detail-page.test.tsx
git commit -m "feat(frontend): 총동연 동아리 상세에 회원 명단 확장·검색·페이지네이션·수정 모드 추가"
```

- [ ] **Step 7: 리뷰 디스패치** — `duing-code-reviewer` + `codex:review`. 시드 함정(전체 `ClubDetail`로 시드하는지)·검색 시 페이지 리셋·스크롤 유지·fail-open 상태 가드 확인. 구현 subagent에는 push·PR 금지 명시.

---

## 시각 QA (선택, PR 전)

로컬 dev 서버(:3000)로 관리자 로그인 → `/admin/clubs/{id}` 진입해 명단 단과대/전공 표기, 검색, 페이지 이동(스크롤 유지), 수정→저장→즉시 갱신, 취소를 눈으로 확인. dev 서버는 로그 파일 리다이렉트로 띄우고(파이프 금지), QA 후 종료. (백엔드 다운 시 저하는 코드버그 아님.)

---

## Self-Review (스펙 대비)

- **회원 명단 확장(단과대/학과):** Task 4 `MemberRow` — `collegeDisplayName(college) · major`. ✅
- **회원 검색(이름·학번·전공 부분검색, debounce, Empty):** Task 4 `filteredMembers` + `useDebouncedValue(250)` + "검색 결과가 없습니다." ✅
- **클라이언트 페이지네이션(공용 Pagination, 검색 후 기준, 20/페이지, 총 회원 수, 스크롤 유지):** Task 4 — `Pagination`(0-based, totalPages≤1 시 자동 숨김), `filteredMembers` 슬라이스, 헤더 `회원 N명`, `onChange={setMemberPage}`만(스크롤 미조작). ✅
- **관리자 수정 API(ADMIN 전용, 내부 로직 재사용, 리더 체크만 교체, 동일 입력):** Task 1 — `updateAsAdmin`+`applyProfileUpdate`, `@PreAuthorize`, `UpdateClubRequest`/`UpdateClubCommand`/`Club.update` 재사용. ✅
- **수정 화면(조회→수정 버튼→모드, ClubInfoForm 재사용, 전체 필드, 저장/취소, 즉시 갱신):** Task 3(주입 리팩터)+Task 4(편집 모드, `onSaved`로 종료, 뮤테이션 setQueryData/invalidate). ✅
- **PR 분리:** Task 1=PR-1(backend), Task 2~4=PR-2(frontend). ✅
- **타입 일관성:** `ClubUpdateMutation`(Task 3) ↔ `useAdminUpdateClubMutation`(Task 2) 반환 구조 대입 가능; `AdminClubMember` 필드(Task 4)와 타입 정의 일치; `admin.clubs.update` 시그니처(Task 2) ↔ 훅 mutationFn 일치. ✅
- **Placeholder:** 없음(모든 코드 실물). 단 `Grade` 리터럴·워크스페이스 필터명·이슈번호 브랜치는 환경 확인 후 확정 표기. 

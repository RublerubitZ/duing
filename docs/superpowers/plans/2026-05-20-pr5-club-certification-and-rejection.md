# P5 — 동아리 인증·거절 사유·중앙동아리 플래그 구현 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 `Club` 도메인에 (1) 거절 사유 필드, (2) 도메인 상태 전이 가드, (3) 중앙동아리 플래그, (4) 최신 상태 변경자/시각 감사 필드를 추가하고, 어드민/공개 화면을 보강한다.

**Architecture:** 도메인 불변식은 `ClubStatus#canTransitionTo()` 정적 매트릭스 + `Club#changeStatus(next, reason, actorUserId)` 3-arg 메서드에 응집. 신규 엔드포인트 `PATCH /admin/clubs/{id}/central-club` 는 별도 책임. 프론트는 `centralClub` 과 `division` 을 직교 정보로 노출 (병행).

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / QueryDSL / RestAssured + TestContainers / Next.js 15 / React 19 / TanStack Query v5 / Tailwind / Vitest

**Spec reference:** `docs/superpowers/specs/2026-05-20-club-certification-and-rejection-design.md`

**Branch:** `feat/club-certification-and-rejection`

**Out of Scope (이 PR 아님)**
- 전체 상태 변경 이력 audit log 테이블 (`club_status_log`) — 최신 1건만 유지
- 동아리장 self-service 재신청
- bulk 일괄 승인/거절
- 학과 마스터 데이터
- 인증 자격 자동 평가
- 인증 배지 디자인 시스템화 (chip + 이모지로 충분)

---

## File Structure

```
backend/src/main/resources/db/migration/
  V26__alter_club_add_certification_and_audit.sql            [신규]

backend/src/main/java/com/duing/domain/club/
  entity/Club.java                                           [수정] 4 필드 + 3-arg changeStatus + changeCentralClub
  entity/ClubStatus.java                                     [수정] canTransitionTo 정적 메서드
  exception/ClubException.java                               [수정] 2개 inner 예외 추가
  controller/dto/request/
    UpdateClubStatusRequest.java                             [수정] rejectionReason 추가
    UpdateClubCentralClubRequest.java                        [신규]
    CreateClubRequest.java                                   [수정] division @Size + centralClub 옵션 (등록 시점 표시)
  controller/dto/response/
    AdminClubSummaryResponse.java                            [수정] centralClub / rejectionReason / 감사 필드
    ClubDetailResponse.java                                  [수정] centralClub
  service/
    ClubService.java                                         [수정] 인터페이스 시그니처
    GeneralClubService.java                                  [수정] updateStatus 3-arg + updateCentralClub + division strip
    dto/command/UpdateClubStatusCommand.java                 [수정] rejectionReason / actorUserId
    dto/command/UpdateClubCentralClubCommand.java            [신규]
  api/AdminClubApi.java                                      [수정] 신규 엔드포인트
  controller/AdminClubController.java                        [수정] @AuthenticationPrincipal 활용 + 신규 핸들러

frontend/packages/types/src/club.ts                          [수정] AdminClubSummary + ClubDetail + Club 필드 추가
frontend/packages/api/src/client.ts                          [수정] admin.clubs.updateStatus payload + updateCentralClub
frontend/packages/hooks/src/admin.ts                         [수정] useUpdateClubCentralClubMutation + payload 타입

frontend/apps/web/app/admin/clubs/
  _components/AdminClubStatusChangeDialog.tsx                [수정] reason textarea + required + 500자 카운터
  _components/AdminClubsTable.tsx                            [수정] chip + REJECTED expand + 감사 line + 토글 액션
  _components/AdminClubCentralClubToggleDialog.tsx           [신규]
  new/_components/AdminClubCreateForm.tsx                    [수정] centralClub checkbox + division placeholder

frontend/apps/web/app/clubs/
  _components/ClubCard.tsx                                   [수정] chip + division 병행
  [clubId]/_components/ClubDetailHeader.tsx                  [수정] chip + division 병행

frontend/apps/web/test/admin/clubs/                          [신규]
  status-change-dialog.test.tsx
  central-club-toggle.test.tsx
frontend/apps/web/test/clubs/
  club-card-central-chip.test.tsx                            [신규]

REQUIREMENTS.md                                              [수정] C 섹션 동기
```

---

## Task 1 — Flyway 마이그레이션 `V26__alter_club_add_certification_and_audit.sql`

**Files:**
- Create: `backend/src/main/resources/db/migration/V26__alter_club_add_certification_and_audit.sql`

- [ ] **Step 1: SQL 작성**

```sql
ALTER TABLE club
    ADD COLUMN rejection_reason  VARCHAR(500),
    ADD COLUMN central_club      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN status_changed_by BIGINT REFERENCES users(id),
    ADD COLUMN status_changed_at TIMESTAMP;
```

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/resources/db/migration/V26__alter_club_add_certification_and_audit.sql
git commit -m "feat(backend): club 테이블에 인증/거절/감사 컬럼 추가"
```

(no Claude attribution)

---

## Task 2 — `ClubStatus.canTransitionTo()` 정적 매트릭스

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/entity/ClubStatus.java`

- [ ] **Step 1: 기존 enum 읽고 메서드 추가**

```java
public boolean canTransitionTo(ClubStatus next) {
    if (this == next) return false;
    return switch (this) {
        case PENDING_APPROVAL -> next == ACTIVE || next == REJECTED;
        case ACTIVE           -> next == INACTIVE;
        case INACTIVE         -> next == ACTIVE;
        case REJECTED         -> next == PENDING_APPROVAL;
    };
}
```

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/club/entity/ClubStatus.java
git commit -m "feat(backend): ClubStatus 상태 전이 매트릭스 도메인 메서드 추가"
```

---

## Task 3 — `ClubException` 에 신규 예외 2종 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/exception/ClubException.java`

- [ ] **Step 1: inner class 2개 append**

```java
public static class InvalidClubStatusTransitionException extends ClubException {
    public InvalidClubStatusTransitionException(String from, String to) {
        super("허용되지 않는 상태 전이입니다: " + from + " → " + to, HttpStatus.BAD_REQUEST);
    }
}

public static class RejectionReasonRequiredException extends ClubException {
    private static final String MESSAGE = "거절 사유는 필수입니다.";
    public RejectionReasonRequiredException() {
        super(MESSAGE, HttpStatus.BAD_REQUEST);
    }
}
```

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/club/exception/ClubException.java
git commit -m "feat(backend): InvalidClubStatusTransition / RejectionReasonRequired 예외 추가"
```

---

## Task 4 — `Club` 엔티티 변경

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`

- [ ] **Step 1: 필드 4개 추가**

```java
@Column(name = "rejection_reason", length = 500)
private String rejectionReason;

@Column(name = "central_club", nullable = false)
private boolean centralClub;

@Column(name = "status_changed_by")
private Long statusChangedBy;

@Column(name = "status_changed_at")
private LocalDateTime statusChangedAt;
```

- [ ] **Step 2: `changeStatus` 시그니처 변경 — 3-arg**

기존 `public void changeStatus(ClubStatus newStatus)` 를 삭제하고:

```java
public void changeStatus(ClubStatus next, String reason, Long actorUserId) {
    if (!this.status.canTransitionTo(next)) {
        throw new ClubException.InvalidClubStatusTransitionException(this.status.name(), next.name());
    }
    if (next == ClubStatus.REJECTED) {
        String normalized = reason == null ? "" : reason.strip();
        if (normalized.isEmpty()) {
            throw new ClubException.RejectionReasonRequiredException();
        }
        this.rejectionReason = normalized;
    } else {
        this.rejectionReason = null;
    }
    this.status = next;
    this.statusChangedBy = actorUserId;
    this.statusChangedAt = LocalDateTime.now();
}
```

- [ ] **Step 3: `changeCentralClub` 추가**

```java
public void changeCentralClub(boolean next) {
    this.centralClub = next;
}
```

- [ ] **Step 4: 컴파일 (호출처에서 컴파일 에러 발생 예상 — 다음 Task 에서 처리)**

```bash
cd backend && ./gradlew compileJava 2>&1 | tail -20
```

`GeneralClubService.updateStatus` 의 호출이 컴파일 에러 — Task 6 에서 처리.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/entity/Club.java
git commit -m "feat(backend): Club 엔티티에 인증/거절/감사 필드 + 3-arg changeStatus 추가"
```

---

## Task 5 — 요청 DTO 갱신

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubStatusRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/request/CreateClubRequest.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubCentralClubRequest.java`

- [ ] **Step 1: `UpdateClubStatusRequest` 확장**

기존 record 에 `rejectionReason` 필드 추가. `toCommand(Long clubId, Long actorUserId)` 시그니처 변경:

```java
public record UpdateClubStatusRequest(
        @NotNull ClubStatus status,
        @Size(max = 500) String rejectionReason
) {
    public UpdateClubStatusCommand toCommand(Long clubId, Long actorUserId) {
        return new UpdateClubStatusCommand(clubId, status, rejectionReason, actorUserId);
    }
}
```

- [ ] **Step 2: `CreateClubRequest` — division 검증 + centralClub 옵션**

기존 record 에 `@Size(max = 50)` 를 `division` 에 적용. `boolean centralClub` 필드 추가 (기본 false). `toCommand` 에 `centralClub` 전달.

```java
public record CreateClubRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull ClubCategory category,
        @Size(max = 50) String division,
        String description,
        @Size(max = 500) String logoUrl,
        @NotNull Long leaderId,
        boolean centralClub
) {
    public CreateClubCommand toCommand() {
        return new CreateClubCommand(
                name, category, division, description, logoUrl, leaderId, centralClub
        );
    }
}
```

(`CreateClubCommand` 도 함께 `centralClub` 필드 추가. Implementer 는 record 1줄 추가.)

- [ ] **Step 3: `UpdateClubCentralClubRequest` 신규**

```java
package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.service.dto.command.UpdateClubCentralClubCommand;
import jakarta.validation.constraints.NotNull;

public record UpdateClubCentralClubRequest(
        @NotNull Boolean centralClub
) {
    public UpdateClubCentralClubCommand toCommand(Long clubId) {
        return new UpdateClubCentralClubCommand(clubId, centralClub);
    }
}
```

- [ ] **Step 4: Command DTO 갱신**

`UpdateClubStatusCommand` 에 `rejectionReason: String`, `actorUserId: Long` 필드 추가:

```java
public record UpdateClubStatusCommand(
        Long clubId,
        ClubStatus status,
        String rejectionReason,
        Long actorUserId
) {}
```

`UpdateClubCentralClubCommand` 신규:

```java
public record UpdateClubCentralClubCommand(Long clubId, boolean centralClub) {}
```

`CreateClubCommand` 에 `centralClub: boolean` 추가.

- [ ] **Step 5: 컴파일 (호출처 에러 — Task 6/7 에서 정리) + 커밋**

```bash
cd backend && ./gradlew compileJava 2>&1 | tail -5  # 일부 에러 OK
git add backend/src/main/java/com/duing/domain/club/controller/dto/request/ \
       backend/src/main/java/com/duing/domain/club/service/dto/command/
git commit -m "feat(backend): club 요청 DTO 확장 (rejectionReason / centralClub / 감사 actor)"
```

---

## Task 6 — `ClubService` 인터페이스 + `GeneralClubService` 구현

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/ClubService.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`

- [ ] **Step 1: 인터페이스 확장**

기존 `void updateStatus(UpdateClubStatusCommand command)` 유지 (command 안에 actorUserId 들어감). 새 메서드 추가:

```java
void updateCentralClub(UpdateClubCentralClubCommand command);
```

- [ ] **Step 2: `GeneralClubService.updateStatus` 본문 수정**

```java
@Override
@Transactional
public void updateStatus(UpdateClubStatusCommand command) {
    Club club = clubRepository.findById(command.clubId())
            .orElseThrow(ClubException.ClubNotFoundException::new);
    club.changeStatus(command.status(), command.rejectionReason(), command.actorUserId());
}
```

- [ ] **Step 3: `GeneralClubService.updateCentralClub` 신규**

```java
@Override
@Transactional
public void updateCentralClub(UpdateClubCentralClubCommand command) {
    Club club = clubRepository.findById(command.clubId())
            .orElseThrow(ClubException.ClubNotFoundException::new);
    club.changeCentralClub(command.centralClub());
}
```

- [ ] **Step 4: `create()` 의 division strip + centralClub 전달**

기존 `create(CreateClubCommand)` 안에서:
- `String divisionNormalized = command.division() == null ? null : command.division().strip();`
- `if (divisionNormalized != null && divisionNormalized.isEmpty()) divisionNormalized = null;`
- `Club.create(...)` 에 `centralClub` 도 함께 전달. `Club.create` 의 시그니처에 boolean 추가 + 내부 builder 에 적용.

- [ ] **Step 5: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/club/service/
git commit -m "feat(backend): ClubService 에 updateCentralClub 추가 + division strip + 3-arg changeStatus 연결"
```

---

## Task 7 — `AdminClubApi` + `AdminClubController` — 신규 엔드포인트 + actor 전달

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/api/AdminClubApi.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/AdminClubController.java`

- [ ] **Step 1: API 인터페이스 변경**

기존 `updateClubStatus` 시그니처에 `@AuthenticationPrincipal UserPrincipal currentUser` 추가 + 신규 메서드:

```java
@Operation(summary = "동아리 상태 변경", description = "운영 상태 변경. REJECTED 전이 시 rejectionReason 필수.")
@PatchMapping("/admin/clubs/{clubId}/status")
ResponseEntity<ApiResponse<Void>> updateClubStatus(
        @PathVariable Long clubId,
        @Valid @RequestBody UpdateClubStatusRequest request,
        @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
);

@Operation(summary = "중앙동아리 토글", description = "ADMIN 이 동아리의 중앙동아리 여부를 변경한다.")
@PatchMapping("/admin/clubs/{clubId}/central-club")
ResponseEntity<ApiResponse<Void>> updateClubCentralClub(
        @PathVariable Long clubId,
        @Valid @RequestBody UpdateClubCentralClubRequest request
);
```

- [ ] **Step 2: Controller 구현 변경**

```java
@Override
public ResponseEntity<ApiResponse<Void>> updateClubStatus(
        @PathVariable Long clubId,
        @Valid @RequestBody UpdateClubStatusRequest request,
        @AuthenticationPrincipal UserPrincipal currentUser
) {
    clubService.updateStatus(request.toCommand(clubId, currentUser.id()));
    return ResponseEntity.noContent().build();
}

@Override
public ResponseEntity<ApiResponse<Void>> updateClubCentralClub(
        @PathVariable Long clubId,
        @Valid @RequestBody UpdateClubCentralClubRequest request
) {
    clubService.updateCentralClub(request.toCommand(clubId));
    return ResponseEntity.noContent().build();
}
```

import 추가: `com.duing.global.auth.UserPrincipal`, `org.springframework.security.core.annotation.AuthenticationPrincipal`.

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/club/api/AdminClubApi.java \
       backend/src/main/java/com/duing/domain/club/controller/AdminClubController.java
git commit -m "feat(backend): admin club 상태/중앙동아리 엔드포인트 + actor 전달 추가"
```

---

## Task 8 — 응답 DTO 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/AdminClubSummaryResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java`

- [ ] **Step 1: `AdminClubSummaryResponse` — 4 필드 추가**

`centralClub`, `rejectionReason`, `statusChangedAt`, `statusChangedByName` 추가. `from(...)` 팩토리에서 user 이름은 별도 조회한 값을 받아 채우거나, query 단계에서 join 으로 가져오도록 한다. 가장 단순하게: `AdminClubSummaryQuery` (queryDSL projection) 에 `statusChangedByName` 도 join 결과로 포함하고 response 는 그대로 매핑.

(Implementer 는 기존 `AdminClubSummaryQuery` / `ClubRepositoryImpl.findByAdminCondition` 의 projection 을 먼저 읽고, user 이름 join 을 추가하는 게 가장 깔끔하다. 단, 만약 그 변경이 크면 `statusChangedByName` 은 별도 query 로 해결해도 OK — 일관성 위해 같은 projection 권장.)

```java
public record AdminClubSummaryResponse(
        Long id,
        String name,
        ClubCategory category,
        String division,
        ClubStatus status,
        Long leaderId,
        String leaderName,
        boolean centralClub,
        String rejectionReason,
        java.time.LocalDateTime statusChangedAt,
        String statusChangedByName
) {
    public static AdminClubSummaryResponse from(AdminClubSummaryQuery query) {
        return new AdminClubSummaryResponse(
                query.id(), query.name(), query.category(), query.division(),
                query.status(), query.leaderId(), query.leaderName(),
                query.centralClub(), query.rejectionReason(),
                query.statusChangedAt(), query.statusChangedByName()
        );
    }
}
```

(필드 순서는 기존 record 의 정의를 따라 implementer 가 결정. 위는 권장 순서.)

- [ ] **Step 2: `ClubDetailResponse` — `centralClub` 만 추가**

기존 응답에 `boolean centralClub` 한 필드만 추가. 거절 사유/감사 필드는 공개 응답 미노출.

- [ ] **Step 3: `AdminClubSummaryQuery` + `ClubRepositoryImpl.findByAdminCondition` 갱신**

QueryDSL projection 에 `centralClub`, `rejectionReason`, `statusChangedAt`, `statusChangedByName` (user join) 추가. user 이름은 `users` 테이블 join 으로 가져옴.

- [ ] **Step 4: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/club/controller/dto/response/ \
       backend/src/main/java/com/duing/domain/club/service/dto/query/ \
       backend/src/main/java/com/duing/domain/club/repository/
git commit -m "feat(backend): admin club 응답 + projection 에 인증/거절/감사 필드 노출"
```

---

## Task 9 — 백엔드 테스트

**Files:**
- Modify or create test files under `backend/src/test/java/com/duing/domain/club/`

### 9-1. 도메인 단위 테스트

- [ ] **Step 1: `ClubStatusTransitionTest` (신규)**

`ClubStatus#canTransitionTo` 의 매트릭스 전 경로 검증:
- 정상 4개 (`PENDING→ACTIVE`, `PENDING→REJECTED`, `ACTIVE→INACTIVE`, `INACTIVE→ACTIVE`, `REJECTED→PENDING`)
- 거부 케이스: same→same (4개), 그 외 거부 매트릭스 셀 전체

JUnit 5 + AssertJ. `@Nested` 로 from 별 그룹화.

### 9-2. `Club#changeStatus` 단위 테스트

- [ ] **Step 2: `ClubChangeStatusTest` (신규)**

- REJECTED 전이 + reason null → `RejectionReasonRequiredException`
- REJECTED 전이 + reason "  " (공백) → 예외
- REJECTED 전이 + 정상 reason → status/rejectionReason/statusChangedBy/statusChangedAt 모두 갱신
- ACTIVE 전이 시 (REJECTED 였던) → `rejectionReason` null 로 초기화
- 잘못된 전이 (예: PENDING→INACTIVE) → `InvalidClubStatusTransitionException`

### 9-3. Service 통합 (TestContainers)

기존 `GeneralClubServiceTest` 가 있다면 확장 — 없으면 신규.

- [ ] **Step 3: 추가 케이스**
- `updateStatus` 정상 케이스 + actor 갱신
- `updateStatus` 가드 위반 → 예외 + 트랜잭션 롤백 (count 비교)
- `updateCentralClub` 토글
- `create` 시 `division` 공백 → null 저장
- `create` 시 `centralClub=true` 가 저장됨

### 9-4. Controller 인수 테스트 (RestAssured)

기존 `AdminClubsListControllerTest` 패턴 차용.

- [ ] **Step 4: 추가 케이스**
- ADMIN PATCH status `{ status: "REJECTED", rejectionReason: "사유" }` → 204, GET 시 reason 노출
- ADMIN PATCH status `{ status: "REJECTED" }` (reason 누락) → 400
- ADMIN PATCH status `{ status: "ACTIVE" }` to REJECTED 클럽 → 400 (가드 위반)
- ADMIN PATCH central-club `{ centralClub: true }` → 204, GET 시 응답에 노출
- STUDENT 가 위 endpoint 시도 → 403

- [ ] **Step 5: 전체 실행 + 커밋**

```bash
cd backend && ./gradlew test
git add backend/src/test/java/com/duing/domain/club/
git commit -m "test(backend): 동아리 상태 전이 가드 + 인증/거절 도메인·인수 테스트"
```

(Docker 가 사용 가능한 환경에서 모두 통과. 미가용 시 `compileTestJava` 만 verify 하고 보고.)

---

## Task 10 — 프론트 타입 확장

**Files:**
- Modify: `frontend/packages/types/src/club.ts`

- [ ] **Step 1: 기존 타입 확장**

```ts
// 기존 AdminClubSummary 에 추가:
//   centralClub: boolean;
//   rejectionReason: string | null;
//   statusChangedAt: string | null;
//   statusChangedByName: string | null;
//
// ClubDetail / 공개용 Club 타입에 추가:
//   centralClub: boolean;
//
// CreateClubPayload (있다면) 에 추가:
//   centralClub: boolean;
//
// UpdateClubStatusPayload 에 추가:
//   rejectionReason?: string;
```

각 record/type 정의를 읽고 적절한 위치에 필드 삽입.

- [ ] **Step 2: 빌드 + 커밋**

```bash
pnpm --filter @duing/types build
git add frontend/packages/types/src/club.ts
git commit -m "feat(frontend): club 타입에 인증/거절/감사 필드 추가"
```

---

## Task 11 — 프론트 API 클라이언트 + 훅

**Files:**
- Modify: `frontend/packages/api/src/client.ts`
- Modify: `frontend/packages/hooks/src/admin.ts`

- [ ] **Step 1: `client.ts`**

`admin.clubs.updateStatus(clubId, payload)` 의 payload 타입에 `rejectionReason?: string` 추가. 신규:

```ts
admin.clubs.updateCentralClub(clubId: number, centralClub: boolean): Promise<void>;
```

구현:

```ts
updateCentralClub: (clubId, centralClub) =>
  jsonVoid(http.patch(`admin/clubs/${clubId}/central-club`, { json: { centralClub } })),
```

- [ ] **Step 2: `admin.ts` 훅**

```ts
export function useUpdateClubCentralClubMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, centralClub }: { clubId: number; centralClub: boolean }) =>
      client.admin.clubs.updateCentralClub(clubId, centralClub),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsList({}) });
    },
  });
}
```

기존 `useUpdateClubStatusMutation` 의 payload 타입 확장 — `rejectionReason?: string` 가 mutation 인자에 자연스럽게 흐르도록 함.

`packages/hooks/src/index.ts` 에 신규 훅 re-export 확인.

- [ ] **Step 3: 빌드 + 커밋**

```bash
pnpm --filter @duing/api build && pnpm --filter @duing/hooks build
git add frontend/packages/api/src/client.ts frontend/packages/hooks/src/
git commit -m "feat(frontend): admin club 인증 토글 mutation + 상태 변경 payload 확장"
```

---

## Task 12 — `AdminClubStatusChangeDialog` — reason textarea + required

**Files:**
- Modify: `frontend/apps/web/app/admin/clubs/_components/AdminClubStatusChangeDialog.tsx`

- [ ] **Step 1: 기존 다이얼로그 읽기**

먼저 파일을 읽어 현재 props/제출 로직 파악. 그 다음 다음 동작 추가:

- `targetStatus === 'REJECTED'` 일 때 `<textarea>` 노출:
  - `required` 속성
  - placeholder "거절 사유를 입력하세요"
  - 500자 카운터 (`text-[11px] text-charcoal-3` 우측 하단)
  - `value`/`onChange` 로 local state 관리
- 제출 버튼: `targetStatus === 'REJECTED' && reason.trim().length === 0` 일 때 disabled
- 제출 시 `useUpdateClubStatusMutation` 에 `{ clubId, status, rejectionReason: reason.trim() }` 전달
- 다른 상태 전이 시 reason 입력 영역 비노출 + payload 에 rejectionReason 미포함

서버 가드 위반 응답 → 토스트(또는 다이얼로그 내 에러 라인) 노출.

- [ ] **Step 2: 빌드 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/clubs/_components/AdminClubStatusChangeDialog.tsx
git commit -m "feat(frontend): 동아리 상태 변경 다이얼로그에 REJECTED 사유 입력 추가"
```

---

## Task 13 — `AdminClubsTable` + `AdminClubCentralClubToggleDialog`

**Files:**
- Modify: `frontend/apps/web/app/admin/clubs/_components/AdminClubsTable.tsx`
- Create: `frontend/apps/web/app/admin/clubs/_components/AdminClubCentralClubToggleDialog.tsx`

- [ ] **Step 1: 토글 다이얼로그 신규**

```tsx
'use client';

type Props = {
  clubName: string | null;
  currentValue: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminClubCentralClubToggleDialog({ clubName, currentValue, isPending, onConfirm, onCancel }: Props) {
  if (clubName === null) return null;
  const action = currentValue ? '해제' : '지정';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40">
      <div className="rounded-2xl bg-paper p-6 max-w-sm w-full">
        <h2 className="text-[15px] font-bold text-ink">중앙동아리 {action}</h2>
        <p className="mt-2 text-[13px] text-charcoal-2">
          &quot;{clubName}&quot; 을 중앙동아리로 {action}하시겠습니까?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-line text-[13px] text-charcoal-2">취소</button>
          <button type="button" onClick={onConfirm} disabled={isPending}
            className="px-3 py-1.5 rounded-md bg-ink text-paper text-[13px] font-semibold disabled:opacity-50">
            {isPending ? '처리 중…' : '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `AdminClubsTable` 수정**

- 이름 셀 옆에 `centralClub === true` 일 때 작은 🏛️ chip 노출
- 상태 셀 옆 (또는 별도 컬럼) 에 작은 글씨로 `statusChangedByName` + `statusChangedAt` (toLocaleString) 노출 — null 이면 미노출
- 액션 컬럼에 "중앙동아리 토글" 버튼 추가 — 클릭 시 부모가 다이얼로그를 띄움
- REJECTED 행은 expand 가능 → `rejectionReason` 표시. 단순 구현으로 ` <details> ` 또는 클릭 시 row 아래에 펼침. 둘 다 OK.

부모(`AdminClubsListPage`) 도 `centralClubTarget` state + `useUpdateClubCentralClubMutation` 핸들러 추가:

```tsx
const [centralClubTarget, setCentralClubTarget] = useState<{ id: number; name: string; current: boolean } | null>(null);
const centralClubMutation = useUpdateClubCentralClubMutation();
// ...
<AdminClubsTable
  ...
  onCentralClubToggleClick={(id, name, current) =>
    setCentralClubTarget({ id, name, current })}
/>
<AdminClubCentralClubToggleDialog
  clubName={centralClubTarget?.name ?? null}
  currentValue={centralClubTarget?.current ?? false}
  isPending={centralClubMutation.isPending}
  onCancel={() => setCentralClubTarget(null)}
  onConfirm={() => {
    if (!centralClubTarget) return;
    centralClubMutation.mutate(
      { clubId: centralClubTarget.id, centralClub: !centralClubTarget.current },
      { onSuccess: () => setCentralClubTarget(null) },
    );
  }}
/>
```

- [ ] **Step 3: 빌드 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/clubs/_components/AdminClubsTable.tsx \
       frontend/apps/web/app/admin/clubs/_components/AdminClubCentralClubToggleDialog.tsx \
       frontend/apps/web/app/admin/clubs/_pages/AdminClubsListPage.tsx
git commit -m "feat(frontend): admin club table 에 중앙동아리 chip/토글 + 감사 라인 + REJECTED 사유 표시"
```

---

## Task 14 — `AdminClubCreateForm` — centralClub 체크 + division 검증

**Files:**
- Modify: `frontend/apps/web/app/admin/clubs/new/_components/AdminClubCreateForm.tsx`

- [ ] **Step 1: 폼 수정**

기존 폼 읽고:
- `centralClub` 체크박스 추가 (기본 false). 폼 state 와 payload 전송에 반영.
- `division` 입력에 `maxLength={50}` + placeholder `"예: 컴퓨터정보공학부"` 추가. 제출 시 `String#trim()` 적용.

- [ ] **Step 2: 빌드 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/clubs/new/_components/AdminClubCreateForm.tsx
git commit -m "feat(frontend): 동아리 등록 폼에 centralClub 체크 + division 검증 추가"
```

---

## Task 15 — 공개 화면: `ClubCard` + `ClubDetailHeader`

**Files:**
- Modify: `frontend/apps/web/app/clubs/_components/ClubCard.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailHeader.tsx` (또는 동일 역할의 헤더 컴포넌트 — 실제 파일명은 implementer 가 grep 으로 확인)

- [ ] **Step 1: 분기 매트릭스 반영**

```tsx
{club.centralClub && (
  <span className="px-1.5 py-0.5 rounded-full bg-ink text-paper text-[11px] font-semibold">
    🏛️ 중앙동아리
  </span>
)}
{club.division && (
  <span className="text-charcoal-3 text-[11.5px]">{club.division}</span>
)}
```

ClubCard 와 detail header 둘 다 동일한 분기 적용. 카드는 이름 아래, 헤더는 이름 옆 (디자인 시스템에 맞춰).

- [ ] **Step 2: 빌드 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/clubs/
git commit -m "feat(frontend): 동아리 카드/상세에 중앙동아리 chip + division 병행 노출"
```

---

## Task 16 — Vitest 테스트

**Files:**
- Create: `frontend/apps/web/test/admin/clubs/status-change-dialog.test.tsx`
- Create: `frontend/apps/web/test/admin/clubs/central-club-toggle.test.tsx`
- Create: `frontend/apps/web/test/clubs/club-card-central-chip.test.tsx`

- [ ] **Step 1: status-change-dialog 테스트**

3 시나리오:
1. `targetStatus=REJECTED` 일 때 textarea 보임 + 제출 버튼은 빈 textarea 동안 disabled
2. 정상 reason 입력 후 제출 시 mutation 이 `{ rejectionReason: "..." }` 와 함께 호출
3. `targetStatus=ACTIVE` 일 때 textarea 미노출, payload 에 rejectionReason 없음

- [ ] **Step 2: central-club-toggle 테스트**

2 시나리오:
1. 토글 버튼 클릭 → 다이얼로그 표시 → 확인 → mutation 호출 with `centralClub` 토글 값
2. 취소 → mutation 미호출

- [ ] **Step 3: club-card-central-chip 테스트**

4 분기 매트릭스:
1. `centralClub=true, division=null` → chip 만
2. `centralClub=true, division="컴퓨터정보공학부"` → chip + division 둘 다
3. `centralClub=false, division="컴퓨터정보공학부"` → division 만
4. `centralClub=false, division=null` → 둘 다 미노출

- [ ] **Step 4: 실행 + 커밋**

```bash
pnpm --filter @duing/web test
git add frontend/apps/web/test/
git commit -m "test(frontend): 상태 변경/중앙동아리 토글/카드 chip 테스트 추가"
```

---

## Task 17 — REQUIREMENTS.md 갱신

**Files:**
- Modify: `REQUIREMENTS.md`

- [ ] **Step 1: C 섹션 수정**

다음 항목 반영:
- `ClubStatus` enum 에 `REJECTED` 명시 추가
- C-4 요청 payload 에 `rejectionReason` (REJECTED 전이 시 필수) 명시
- C-5 (신규): "중앙동아리 토글 (ADMIN)" — `PATCH /admin/clubs/{id}/central-club` `{ centralClub: boolean }`
- Club 엔티티 필드 목록에 `rejectionReason`, `centralClub`, `statusChangedBy`, `statusChangedAt` 추가
- 권한 매트릭스 갱신
- 상태 전이 매트릭스 부록(짧게 표 1개) 추가

- [ ] **Step 2: 커밋**

```bash
git add REQUIREMENTS.md
git commit -m "docs: REQUIREMENTS.md 의 C 섹션 인증/거절/감사 반영"
```

---

## Task 18 — 최종 빌드 + PR

- [ ] **Step 1: 전체 검증**

```bash
cd backend && ./gradlew clean build
cd ../frontend && pnpm --filter @duing/web lint
pnpm --filter @duing/web typecheck
pnpm --filter @duing/web test
```

(`./gradlew build` 가 Docker 미가용 환경에서 실패하면 `compileJava compileTestJava` 만 확인.)

- [ ] **Step 2: PR 작성**

```bash
git push -u origin feat/club-certification-and-rejection
gh pr create --base develop --title "feat: 동아리 인증·거절 사유·중앙동아리 플래그 (P5)" --body "..."
```

PR 본문 템플릿:

```
## 🚀 작업 내용
기존 Club 도메인에 (1) 거절 사유(`rejectionReason`), (2) 도메인 상태 전이 가드
(`ClubStatus#canTransitionTo` 매트릭스 + `Club#changeStatus` 3-arg), (3) 중앙동아리
플래그(`centralClub`), (4) 최근 상태 변경자/시각 감사 필드를 추가했다. 어드민
화면(`/admin/clubs`)에는 REJECTED 시 사유 textarea, 행별 중앙동아리 chip/토글,
감사 라인을 추가했고, 공개 카드/상세 헤더는 `centralClub` + `division` 을 직교
정보로 병행 노출하도록 보강했다. REQUIREMENTS.md 의 C 섹션을 현 구현과 정합화.

## 🤔 고민했던 내용
- 상태 전이 가드를 Service 의 if-else 가 아니라 enum 정적 메서드 + 도메인 메서드에
  응집해 다른 진입점에서도 불변식이 보장되도록 함.
- 거절 사유 검증 위치를 도메인(`Club#changeStatus`)에 두어, DTO 가 아닌 단일
  지점에서 보장. trim 후 0자도 거부.
- 중앙동아리는 enum 으로 가지 않고 `boolean` + 운영 관행으로 처리. `division` 과
  병행 표시가 가능하도록 직교 정보로 둠.
- 감사 필드는 전체 이력이 아닌 "최근 1건" 만 유지 — 본 PR 범위를 좁혀 응집.

## 💬 리뷰 중점사항
- spec: docs/superpowers/specs/2026-05-20-club-certification-and-rejection-design.md
- plan: docs/superpowers/plans/2026-05-20-pr5-club-certification-and-rejection.md
- `ClubStatus#canTransitionTo` 매트릭스 + `Club#changeStatus` 의 reason/actor 정규화
- 다이얼로그의 REJECTED 사유 required + 500자 카운터 + 빈 trim 제출 비활성
- `AdminClubSummaryResponse` 의 user name join (projection 확장)
- 공개 카드/상세의 4가지 분기 매트릭스 (centralClub × division)

## 🧪 테스트
- 단위(도메인): `ClubStatus#canTransitionTo` 매트릭스 전체 + `Club#changeStatus`
  reason 검증/감사 필드 갱신
- 통합(service + TestContainers): updateStatus/updateCentralClub/division strip
- 인수(RestAssured): REJECTED + reason 정상/누락/잘못된 전이, central-club 토글, 403
- 프론트: 다이얼로그 textarea 분기/제출 비활성, 토글 다이얼로그, 카드 4분기 chip

## 📦 Out of Scope
- 전체 상태 변경 이력 audit log 테이블 (최신 1건만)
- 동아리장 self-service 재신청
- bulk 일괄 처리
- 학과 마스터 데이터 / 자동 분류
- 인증 자격 자동 평가
- 배지 디자인 시스템화
```

---

## Self-Review

- [x] **Spec coverage**: § 2 데이터모델 / § 3 백엔드 API / § 4 프론트엔드 / § 5 권한 / § 6 테스트 / § 7 마이그레이션 / § 8 REQUIREMENTS / § 9 트레이드오프 / § 10 OOS 모두 task 화.
- [x] **Out of Scope 명시**: 전체 audit log / self-service / bulk / 학과 마스터 / 자격 평가 / 배지 디자인 모두 본 PR 제외 명시.
- [x] **Placeholder scan**: 없음. Task 8 의 user name join 위치는 implementer 가 기존 `AdminClubSummaryQuery` / `ClubRepositoryImpl.findByAdminCondition` 을 먼저 읽고 결정하도록 명시.
- [x] **Type consistency**: `UpdateClubStatusCommand` 의 4 필드 / `Club#changeStatus(status, reason, actorUserId)` / Controller 의 `@AuthenticationPrincipal` 흐름이 일관.
- [x] **Breaking change 명시**: `Club#changeStatus(ClubStatus)` 단일 인자 메서드 제거. 호출처(`GeneralClubService.updateStatus`) + 단위 테스트 갱신 Task 4·6 에서 함께 처리.
- [ ] **유의**:
  - Task 8 의 user name join 이 클 수 있음. Implementer 가 부담스러우면 별도 query 로 분리 가능. 일관성은 trade-off.
  - Task 15 의 `ClubDetailHeader` 정확한 파일명은 grep 필요 (없으면 가장 가까운 헤더 컴포넌트에 적용).
  - Frontend test mocking 패턴은 기존 `frontend/apps/web/test/admin/notices/*.test.tsx` 를 차용.

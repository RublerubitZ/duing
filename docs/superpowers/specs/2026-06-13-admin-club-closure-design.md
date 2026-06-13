# 동아리 폐쇄 (Admin Club Closure) — 설계 문서

- 작성일: 2026-06-13
- 대상 화면: `/admin/clubs` (총동연 콘솔)
- 범위: 백엔드(신규 API + cascade) + 프론트(폐쇄 버튼·확인 다이얼로그·mutation)

---

## 1. 배경 / 목적

총동연(ADMIN)이 더 이상 활동하지 않는 동아리를 **폐쇄(영구 종료)** 할 수 있어야 한다.
폐쇄된 동아리는 운영진·학생·동아리장 앱 **모든 화면에서 사라지며**, 동아리에 매달린
진행 중인 프로세스(모집·지원·인증·위임·홍보 등)도 함께 종료된다.

## 2. 용어 / 현재 상태

이미 존재하는 것과 구분이 중요하다.

| 개념 | 의미 | 가역성 | 구현 상태 |
|---|---|---|---|
| **운영 중단 (INACTIVE)** | 학생 탐색에서 숨김. 멤버십·이력은 유지 | **가역** (재활성 가능) | ✅ 이미 구현됨 (`ClubStatus.INACTIVE`, 상태 변경 다이얼로그) |
| **폐쇄 (Closure)** | 동아리를 soft-delete(`deleted_at`) + 진행 중 프로세스 종료 | **비가역** (UI 기준) | ❌ 본 문서에서 신규 구현 |

- 폐쇄는 **새로운 상태값(enum)을 추가하지 않는다.** `ClubStatus`는 그대로 두고, soft-delete로 처리한다.
- `Club` 엔티티는 이미 `@SQLDelete(UPDATE club SET deleted_at = NOW())` + `@SQLRestriction("deleted_at IS NULL")`를 갖고 있어, Club 행을 soft-delete하면 **Club을 JOIN하는 모든 JPQL/QueryDSL 조회에서 자동으로 사라진다.**

### 핵심 전제: `@SQLRestriction`의 한계

`@SQLRestriction`은 **해당 엔티티를 참조/JOIN하는 JPQL·QueryDSL-JPA 쿼리에만** 자동 적용된다.
다음 경우에는 적용되지 않아 **orphan(고아 데이터)** 이 남는다.

1. 하위 엔티티를 `club_id`(raw 컬럼)로 **직접 조회**하고 Club을 JOIN하지 않는 쿼리
   - 예: `Recruitment.findByClubId...`, `RecertificationRequest.findByRoundIdAndClubIdAndStatus`, `ClubEvent.findWindow`, `LeaderSuccessionRequest.findByClubIdAndStatus`
2. 하위 엔티티에 soft-delete 자체가 없는 경우
   - 예: `ClubFavorite` (`@SQLDelete`/`@SQLRestriction`/`deleted_at` 모두 없음)

→ 따라서 **Club만 soft-delete하면 부족하고, 진행 중 프로세스는 명시적 cascade로 종료**해야 한다.

## 3. 기능 요구사항

1. `/admin/clubs` 목록에서 **운영 중단(INACTIVE) 상태 동아리에만** "폐쇄" 버튼이 노출된다. (2단계 안전장치)
2. 폐쇄 버튼 클릭 → **전용 확인 다이얼로그**가 뜬다.
   - 종료되는 항목(멤버십·모집·지원·인증 등)과 **"되돌릴 수 없음"** 경고를 명시한다.
   - **동아리명을 정확히 입력**해야 폐쇄 버튼이 활성화된다. (오삭제 방지)
   - **폐쇄 사유는 선택 입력**. 비우면 기본값 `"동아리 폐쇄"`로 처리한다.
3. 폐쇄 확정 시:
   - 대상 동아리와 진행 중 하위 프로세스가 **단일 트랜잭션**으로 종료된다.
   - 성공 후 목록이 갱신되어 폐쇄 동아리가 즉시 사라진다.
4. 폐쇄는 ADMIN(총동연)만 수행할 수 있다.

## 4. 비범위 (Out of Scope)

- **폐쇄 복구(되돌리기) UI** — soft-delete라 DB에는 남지만, v1에서 복구 기능은 제공하지 않는다.
- **폐쇄 동아리 전용 목록/필터** — 폐쇄 동아리는 모든 조회에서 사라지며, 별도 "폐쇄됨" 탭은 만들지 않는다.
- **`ClubStatus`에 `CLOSED`/`DELETED` enum 추가** — 상태가 아니라 삭제로 처리하므로 추가하지 않는다.
- **동아리장 화면에서의 폐쇄 신청** — 폐쇄는 ADMIN 전용. 동아리장 발의 흐름은 만들지 않는다.
- **폐쇄 사유를 Club 행에 별도 컬럼으로 저장** — 사유는 cascade 시 히스토리/처리 사유로만 전달한다. (Club에 컬럼 추가 없음)
- **폐쇄 알림(푸시·메일) 발송** — 멤버/지원자에게 별도 알림은 v1 범위 밖. (히스토리 기록만 남긴다)
- **인증 라운드(RecertificationRound) 자체의 종료** — 라운드는 여러 동아리가 공유(연 1개 OPEN)하므로 닫지 않는다. 해당 동아리의 요청만 종료한다.

## 5. 백엔드 설계

### 5.1 엔드포인트

```
DELETE /api/v1/admin/clubs/{clubId}
```

- 권한: `@PreAuthorize("hasRole('ADMIN')")` (기존 `AdminClubController` 클래스 가드와 동일)
- 요청 본문(선택): `{ "closureReason": string? }` — `@Size(max = 500)`, 없거나 공백이면 기본값 `"동아리 폐쇄"`
- 성공 응답: `204 No Content`
- Swagger 인터페이스 `AdminClubApi`에 메서드 추가 후 `AdminClubController`가 구현 (인터페이스 없는 컨트롤러 금지 규칙 준수)

### 5.2 검증 / 가드

| 상황 | 결과 |
|---|---|
| 대상 동아리가 존재하지 않거나 이미 폐쇄됨 | `404` — `ClubException.ClubNotFoundException` (`findById`가 `@SQLRestriction`으로 자동 처리) |
| 대상 동아리 상태가 **INACTIVE가 아님** | `400` — 신규 예외 `ClubException.ClubNotClosableException` |
| ADMIN 권한 없음 | `403` (Spring Security) |

### 5.3 아키텍처 — 오케스트레이션 서비스

DDD 도메인 경계를 지키기 위해, club 도메인에 **신규 `ClubClosureService`** 를 두고
**하나의 `@Transactional`** 안에서 각 도메인이 노출하는 cascade 메서드를 순서대로 호출한다.
club 서비스가 타 도메인 repository에 직접 쓰지 않고, **각 도메인이 자기 데이터 정리 책임**을 갖는다.

```
ClubClosureService.close(clubId, adminUserId, closureReason)   @Transactional
  ├─ 1. Club 조회 + INACTIVE 검증 (아니면 ClubNotClosableException)
  ├─ 2. ClubMemberCommandService    : 전 멤버 soft-delete + ClubMemberHistory(REMOVED) 기록
  ├─ 3. LeaderSuccessionService      : PENDING 위임요청 종료
  ├─ 4. RecruitmentService           : OPEN 모집 close() → CLOSED
  ├─ 5. ApplicationService           : 활성 지원서(SUBMITTED/UNDER_REVIEW/INTERVIEW_PENDING) → REJECTED
  ├─ 6. RecertificationRequestService: PENDING 인증요청 process(REJECTED, reason)  (라운드는 닫지 않음)
  ├─ 7. PromotionService             : 활성 Promotion soft-delete + PENDING PromotionRequest 종료
  ├─ 8. ClubFavoriteService          : 해당 club 즐겨찾기 soft-delete
  └─ 9. clubRepository.delete(club)  : Club soft-delete (deleted_at). actor 기록 위해 statusChangedBy/At 갱신(선택)
```

각 도메인 서비스에 추가할 cascade 메서드(명칭은 구현 단계에서 확정, 예시):

- `ClubMemberCommandService.removeAllOnClubClosure(clubId, adminUserId, reason)`
- `LeaderSuccessionService.cancelPendingOnClubClosure(clubId, adminUserId, reason)`
- `RecruitmentService.closeOpenOnClubClosure(clubId)`
- `ApplicationService.rejectActiveOnClubClosure(clubId, reason)`
- `RecertificationRequestService.rejectPendingOnClubClosure(clubId, adminUserId, reason)`
- `PromotionService.removeAllOnClubClosure(clubId, adminUserId, reason)`
- `ClubFavoriteService.removeAllByClub(clubId)` (서비스가 없으면 repository 정리 메서드)

> 참고: 4·5번은 "모집 close → 그 모집의 활성 지원 REJECTED"로 묶어 recruitment 도메인 내부에서 처리해도 된다. 구현 단계에서 결정.

### 5.4 Cascade 명세 (대상별 처리)

| 대상 엔티티 | 처리 | 비고 |
|---|---|---|
| **ClubMember** (전원) | 각 행 soft-delete + `ClubMemberHistory`에 `REMOVED`(fromRole=현재 역할, reason) 기록 | 멤버의 "내 동아리"에서 제거 |
| **LeaderSuccessionRequest** (PENDING) | soft-delete 또는 `process(REJECTED, reason)` | 위임 요청 잔존 방지 |
| **Recruitment** (OPEN) | `recruitment.close()` → CLOSED | 모집 진행 종료 |
| **Application** (SUBMITTED/UNDER_REVIEW/INTERVIEW_PENDING) | `transitionTo(REJECTED)` | 지원자 "심사 중" 잔존 방지 |
| **RecertificationRequest** (PENDING) | `process(REJECTED, reason)` | 인증 요청 종료 |
| **RecertificationRound** | **처리 안 함** | 여러 동아리 공유 — 닫지 않음 |
| **Promotion** (해당 clubId) | soft-delete | 홍보 배너 제거 |
| **PromotionRequest** (PENDING) | `process(REJECTED, reason)` | 홍보 요청 종료 |
| **ClubFavorite** (해당 clubId) | soft-delete | 5.5 마이그레이션 필요 |
| **Club** | soft-delete (`deleted_at`) | 최종 |

### 5.5 DB 마이그레이션

soft-delete가 없는 **`ClubFavorite`에만** 마이그레이션이 필요하다. 나머지는 모두 soft-delete 인프라가 이미 있다.

- 신규 파일: `backend/src/main/resources/db/migration/V51__alter_club_favorite_add_deleted_at.sql`
  (실제 버전 번호는 머지 시점의 최신 `V##` 다음 번호로 — 현재 최신은 `V50`)
  ```sql
  ALTER TABLE club_favorite ADD COLUMN deleted_at TIMESTAMP NULL;
  ```
- `ClubFavorite` 엔티티에 `@SQLDelete(sql = "UPDATE club_favorite SET deleted_at = NOW() WHERE id = ?")`
  + `@SQLRestriction("deleted_at IS NULL")` + `deleted_at` 매핑 추가
  (`findUserIdsByClubId` 등 기존 JPQL은 추가 후 자동으로 deleted 필터됨)
- **기존 마이그레이션 파일 수정 금지** — 새 파일 추가만.

### 5.6 예외

`ClubException`에 inner static 예외 추가:

- `ClubNotClosableException` — 폐쇄 불가 상태(INACTIVE 아님), `400`, 메시지 한국어
  (`InvalidClubStatusTransitionException` 패턴 참고)

## 6. 프론트엔드 설계

### 6.1 UI / UX

- **폐쇄 버튼**: `STATUS_ACTIONS`(상태 전이용)에 끼워넣지 않는다. 폐쇄는 상태 전이가 아니라 삭제이므로,
  `AdminClubsTable`의 INACTIVE 행에 **별도 "폐쇄" 버튼**(위험 톤)을 추가한다.
- **전용 확인 다이얼로그** `AdminClubDeleteDialog`:
  - 헤더: "동아리 폐쇄" / 대상 동아리명
  - 본문: 종료되는 항목 목록(멤버십·모집·지원·인증·홍보) + **"되돌릴 수 없습니다"** 경고
  - **동아리명 입력 필드**: 입력값이 `club.name`과 정확히 일치할 때만 폐쇄 버튼 활성화
  - **폐쇄 사유 입력 필드(선택)**: `@Size(max=500)` 대응, 비워도 제출 가능
  - 위험(빨강) 톤 confirm 버튼, `isPending` 시 비활성/로딩 표시
  - 기존 `AdminClubStatusChangeDialog`의 구조·스타일을 참고하되 별도 컴포넌트로 분리

### 6.2 데이터 레이어

`frontend/CLAUDE.md` 순서 준수: types → api client → hook → 컴포넌트 → 테스트.

- **types** (`packages/types`): 필요 시 `CloseClubPayload = { closureReason?: string }`. (`AdminClubSummary`, `ClubStatus`는 그대로)
- **api client** (`packages/api/src/client.ts`): `clubs.close(clubId, payload?)` = `DELETE /admin/clubs/{clubId}`
- **hook** (`packages/hooks`): `useCloseClubMutation()` — 성공 시 무효화
  - `adminQueryKeys.clubsAll` (목록)
  - `clubQueryKeys.all` / `clubQueryKeys.detail(clubId)` (학생/상세 캐시)
  - 기존 `useUpdateClubStatusMutation`의 무효화 패턴과 동일
- **페이지** (`AdminClubsListPage`): 폐쇄 다이얼로그 상태(`deleteDialog`)를 상태 변경 다이얼로그와 별도로 관리,
  `handleCloseConfirm(closureReason?)` → `closeMutation.mutate(...)` → 성공 시 다이얼로그 닫기 + 목록 갱신

### 6.3 페이지네이션 처리

INACTIVE 필터 2페이지에서 폐쇄 시 목록이 갱신되며 항목이 줄어든다. 무효화 후 현재 페이지가 비면
직전 페이지로 보정하는 정도만 고려(선택). v1에서는 단순 무효화로 충분.

## 7. 데이터 무결성 / 동시성

- 모든 cascade는 **단일 `@Transactional`**. 중간 실패 시 전체 롤백.
- `Application`, `LeaderSuccessionRequest` 등은 `@Version` 낙관적 락이 있어, 폐쇄 도중 동시 수정 시
  `OptimisticLockException` 가능 → 트랜잭션 롤백으로 일관성 유지(드물고 재시도 가능).
- 멱등성: 이미 폐쇄된 동아리(`deleted_at IS NOT NULL`)는 `findById`에서 조회되지 않아 `404` → 중복 폐쇄 방지.
- 프론트: 폐쇄 버튼은 `isPending` 중 비활성화하여 중복 제출 방지.

## 8. 테스트 계획

### 백엔드 (RestAssured + Fixture Monkey, TestContainers)
- INACTIVE 동아리는 폐쇄되고 `204` 반환, 이후 목록/상세 조회에서 사라진다.
- ACTIVE/PENDING_APPROVAL/REJECTED 동아리 폐쇄 시도 시 `400`(`ClubNotClosableException`).
- 존재하지 않거나 이미 폐쇄된 동아리 폐쇄 시 `404`.
- ADMIN 아닌 사용자 폐쇄 시도 시 `403`.
- cascade 검증: 폐쇄 후
  - 전 멤버 ClubMember soft-delete + `ClubMemberHistory(REMOVED)` 기록됨
  - OPEN 모집 → CLOSED, 활성 지원 → REJECTED
  - PENDING 인증요청 → REJECTED (공유 라운드는 OPEN 유지)
  - PENDING 위임요청 종료
  - 해당 club Promotion soft-delete, PENDING PromotionRequest 종료
  - 해당 club ClubFavorite soft-delete
  - 멤버의 "내 동아리"/즐겨찾기 목록에서 사라짐
- 폐쇄 사유 미입력 시 기본값으로 히스토리 기록되는지 확인.

### 프론트 (apps/web/test/admin/clubs/)
- INACTIVE 행에만 폐쇄 버튼 노출, 그 외 상태엔 미노출.
- 다이얼로그: 동아리명 불일치 시 폐쇄 버튼 비활성, 일치 시 활성.
- 폐쇄 사유는 비워도 제출 가능.
- confirm 시 `closeMutation` 호출 + 성공 시 다이얼로그 닫힘.

## 9. 결정 기록 (확정된 선택)

- 폐쇄 = soft-delete (상태값 추가 X)
- 폐쇄 가능 조건 = **INACTIVE 동아리만** (2단계 안전장치)
- 진행 중 데이터 = **자동 종료(cascade)**
- 확인 다이얼로그 = **동아리명 입력 확인**
- 폐쇄 사유 = **선택 입력** (기본값 "동아리 폐쇄")
- 엣지 데이터(Promotion·PromotionRequest·ClubFavorite) = **포함 정리**

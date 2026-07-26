# 총동연 콘솔 — 동아리 상세 개선 (수정 기능 + 회원 명단 확장)

- 날짜: 2026-07-21
- 대상: 총동연(ADMIN) 콘솔의 동아리 상세 화면 `/admin/clubs/{clubId}`
- 분리: PR-1(백엔드, 관리자 수정 API) → PR-2(프론트, 상세 수정 모드 + 회원 명단 확장·검색·페이지네이션)

---

## 배경 / 현재 상태

- 상세 페이지: `frontend/apps/web/app/admin/clubs/[clubId]/_pages/AdminClubDetailPage.tsx`
  - 동아리 기본 정보 + 회원 목록을 **조회만** 한다.
  - 회원 목록은 **리더 전용 훅** `useClubMembersQuery`(`GET clubs/{clubId}/members`)를 쓴다.
    - 이름·학번·가입일만 표시. 단과대/전공 없음.
    - 이 훅은 서비스 계층에서 `requireManager`(해당 동아리 LEADER/OFFICER) 검증을 하므로, **그 동아리 멤버가 아닌 총동연 관리자에게는 403이 나는 잠재 버그**가 있다.
- 이미 존재하지만 안 쓰이는 것:
  - 관리자 전용 회원 조회 `GET /api/v1/admin/clubs/{clubId}/members` — `@PreAuthorize("hasRole('ADMIN')")`, 아무 동아리나 조회 가능(멤버십 무관, 미존재 시 404). 응답에 `name, studentId, major(전공, 자유 텍스트), college(단과대 enum), grade, role` 포함. FE 훅 `useAdminClubMembersQuery`·타입 `AdminClubMember`도 이미 있음.
  - 공용 `Pagination` 컴포넌트(`apps/web/components/Pagination.tsx`), 공용 `useDebouncedValue`(`apps/web/app/admin/_hooks/useDebouncedValue.ts`).
  - 리더 수정 폼 `ClubInfoForm`(`apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`) — `{clubId, detail, readOnly}` props, ~20개 필드, 변경분만 보내는 diff payload + `clear*` 플래그. 단, 뮤테이션을 `useUpdateClubMutation`(리더 전용 `PATCH clubs/{id}`)로 하드코딩.
- 부족한 백엔드: **관리자가 동아리 일반 정보를 수정하는 API가 없다.** 관리자는 상태 변경/중앙동아리 토글/폐쇄만 가능.

`college`는 정규화된 enum(14개 단과대, 한글 라벨)이지만 `major`(학과/전공)는 `User`의 자유 텍스트 문자열이다. 별도 학과 테이블은 없음. → 표시는 `공과대학 · 컴퓨터공학과` 형태.

---

## PR-1 (백엔드) — 관리자 전용 동아리 수정 API

### 목표
리더 전용 `PATCH /clubs/{clubId}`와 **동일한 입력·검증·업데이트 로직**을 재사용하되, 리더 멤버십 검증을 ADMIN 권한 검증으로 대체한 `PATCH /admin/clubs/{clubId}`를 추가한다.

### 엔드포인트
- `PATCH /api/v1/admin/clubs/{clubId}`
- 요청 바디: 기존 `UpdateClubRequest` 재사용(그대로).
- 응답: 리더 엔드포인트와 동일하게 **200 + `ClubDetailResponse`**(수정 후 재조회 결과). 즉시 갱신에 유리.
- 권한: `AdminClubController`의 클래스 레벨 `@PreAuthorize("hasRole('ADMIN')")`로 이미 가드됨 → 메서드 추가만으로 ADMIN 전용.

### 변경 파일
1. `AdminClubApi`(인터페이스): `@PatchMapping("/admin/clubs/{clubId}")` + Swagger `@Operation` 추가. 시그니처는 리더 `ClubApi.updateClub`과 동일(`clubId`, `@Valid @RequestBody UpdateClubRequest`, `@AuthenticationPrincipal UserPrincipal`).
2. `AdminClubController`: 구현 →
   ```java
   clubService.updateAsAdmin(updateClubRequest.toCommand(clubId, currentUser.id()));
   ClubDetailResponse response = ClubDetailResponse.from(clubService.getById(clubId));
   return ResponseEntity.ok(ApiResponse.success(response));
   ```
3. `ClubService`(인터페이스): `void updateAsAdmin(UpdateClubCommand)` 추가.
4. `GeneralClubService`: 리더 `update()`의 공통 코어(404 조회 → 이름 중복 검사 → `club.update(payload)`)를 `private void applyProfileUpdate(UpdateClubCommand)`로 추출하고, 두 진입점이 호출:
   ```java
   @Transactional
   public void update(UpdateClubCommand cmd) {          // 리더
       clubAuthService.requireEditableClubLeader(cmd.requesterId(), cmd.clubId());
       applyProfileUpdate(cmd);
   }
   @Transactional
   public void updateAsAdmin(UpdateClubCommand cmd) {   // 총동연 — 웹 계층 @PreAuthorize 로 이미 ADMIN 검증됨
       applyProfileUpdate(cmd);
   }
   ```
   `applyProfileUpdate`는 기존 `update()` 본문(L163-172)을 그대로 옮긴다 — 이름 중복 검사(`DuplicateClubNameException`) 등 비즈니스 로직 유지.

### 결정 포인트 — 관리자 수정의 동아리 상태 게이트
리더 경로는 `requireEditableClubLeader`가 **역할 검증 + D6 상태 게이트(INACTIVE 차단, PENDING_APPROVAL/REJECTED/ACTIVE 허용)**를 함께 한다. 관리자 경로는 "리더 권한 체크만 ADMIN 권한 체크로 변경"이라는 요구에 따라 이 게이트 전체를 리더 검증째로 걷어낸다.

- 결과: 관리자는 **조회 가능한(soft-delete 되지 않은) 모든 상태의 동아리를 수정**할 수 있다(PENDING_APPROVAL/REJECTED/ACTIVE/INACTIVE).
- 근거: (a) ADMIN 검증이 `@PreAuthorize`로 이미 됨, (b) 관리자 상세 조회(`getAdminClub`)가 이미 전 상태 동아리를 노출하므로 편집 맥락과 일치, (c) D6 게이트는 *리더*의 비-ACTIVE 동아리 운영 행위를 막기 위한 것.
- 폐쇄(closed=soft-delete)된 동아리는 `@SQLRestriction`으로 `findById`가 비어 자동 404 → 편집 불가(의도됨).
- **확정(2026-07-21)**: 관리자는 INACTIVE(운영 중단) 동아리까지 편집 허용. 별도 상태 게이트 추가 안 함.
- 적대적 리뷰 포인트(막는 게 아니라 검증용): ADMIN 검증이 `@PreAuthorize` 한 곳에만 있으므로 그 가드가 실제로 걸리는지, 비-ADMIN 우회 경로가 없는지 확인.

### 테스트 (RestAssured + Fixture Monkey)
- ADMIN이 임의 동아리(자신이 멤버가 아닌) 정보를 수정하면 200 + 변경 반영·재조회.
- 비-ADMIN(STUDENT)이 호출하면 403.
- 이름 변경 시 다른 동아리와 중복이면 중복 예외(리더와 동일 매핑).
- 존재하지 않는 clubId → 404.
- (상태 게이트 결정에 따라) PENDING_APPROVAL/INACTIVE 동아리 수정 허용 여부 케이스.
- 부분 수정: 일부 필드만 보냈을 때 나머지 필드 불변.

### 마이그레이션
없음 (스키마 변경 없음).

---

## PR-2 (프론트) — 상세 수정 모드 + 회원 명단 확장·검색·페이지네이션

의존: PR-1 머지 후 시작(수정 API). 단, 회원 명단(2·3·4)은 기존 admin 회원 API에만 의존하므로 PR-1과 무관.

### 2-1. API/훅 추가 (백엔드 1:1 매칭)
- `packages/api/src/client.ts`: `admin.clubs.update(clubId, payload: UpdateClubPayload): Promise<ClubDetail>` → `PATCH admin/clubs/{clubId}`. 기존 `clubs.update`를 미러링.
- `packages/hooks/src/admin.ts`: `useAdminUpdateClubMutation(clubId)` — `useUpdateClubMutation`을 미러링하되 `admin.clubs.update` 호출, 성공 시 관리자 상세 쿼리 키(`useAdminClubDetailQuery`) invalidate(+ 필요 시 관리자 목록). 즉시 갱신.
- 신규 타입 불필요: `AdminClubMember`, `UpdateClubPayload`, `ClubDetail` 모두 존재.

### 2-2. 회원 명단 확장 (`AdminClubDetailPage.tsx`)
- `useClubMembersQuery` → **`useAdminClubMembersQuery`**로 교체(타입 `AdminClubMember`). 단과대/전공 확보 + 403 잠재 버그 동시 해소.
- 각 행 표시: 이름 / 학번 / `단과대 라벨 · 전공(major)` / 역할(회장·임원·회원 소형 라벨).
  - 단과대 라벨은 기존 `COLLEGE_OPTIONS`(`apps/web/app/_lib/college`)의 `code→label` 매핑 재사용.
  - `major`가 비어 있으면 전공 부분 생략.
- **레이아웃 변경**: 기존 역할별 3그룹(회장/임원/일반) 렌더를 **평면(flat) 목록**으로 전환. admin 회원 API가 이미 역할+가입순 정렬로 내려주므로 그 순서를 유지, 각 행에 역할 라벨을 붙여 정보 손실 없음. (그룹 헤더 3개는 페이지네이션과 상충하므로 제거.)
- `AdminAssignLeaderCard`의 `hasNoLeader` 판정은 페이지 슬라이스가 아닌 **전체 members 배열** 기준 유지.

### 2-3. 회원 검색
- 상단에 검색 인풋(기존 `ApplicantsSearchInput` 패턴 참고, 신규 소형 컴포넌트 또는 인라인).
- `useDebouncedValue(term, 250)` 적용 후 클라이언트 필터: `name.includes(q) || studentId.includes(q) || (major ?? '').includes(q)` — **이름·학번·전공(major) 부분 검색**. 단과대(college)는 검색 대상 아님.
  - 예: `"홍길"`→홍길동, `"2023"`→20231234, `"컴퓨터"`→컴퓨터공학과/컴퓨터소프트웨어학부.
- 검색어 변경 시 페이지를 1로 리셋.
- 검색 결과 0건 → Empty UI("검색 결과가 없습니다"). 동아리에 회원이 0명인 경우는 기존 "등록된 회원이 없습니다." 유지(서로 구분).

### 2-4. 클라이언트 페이지네이션
- 필터링된 결과 기준으로 페이지네이션(검색 → 필터 → 슬라이스 순서).
- 페이지당 20명(20~30 범위 내). 공용 `Pagination` 재사용: `{page, totalPages, onChange, totalElements, pageSize}`.
- 총 회원 수 표시: 섹션 헤더 `회원 {전체 수}명`, 검색 활성 시 필터 결과 수 함께 노출.
- **페이지 변경 시 스크롤 위치 유지**: `onChange`에서 `setPage`만 수행, `window.scrollTo`/자동 스크롤 호출 없음.
- 서버 페이지네이션·API 변경 없음(현 서비스 규모에서 클라이언트로 충분).

### 2-5. 동아리 수정 모드
- `AdminClubDetailPage`에 `editing` 상태 추가. 기본 정보 섹션 헤더에 **"수정" 버튼**.
- 수정 진입 시 기본 정보 조회 뷰 자리에 기존 **`ClubInfoForm` 재사용** 렌더. 관리자 뮤테이션은 상위에서 생성해 주입:
  ```tsx
  const adminMutation = useAdminUpdateClubMutation(clubId);
  // ...
  <ClubInfoForm
    detail={club}            // useAdminClubDetailQuery 의 전체 ClubDetail (부분 카드 아님)
    readOnly={false}
    mutation={adminMutation}
    onCancel={() => setEditing(false)}
    onSaved={() => setEditing(false)}
  />
  ```
  - **시드 주의(메모리 함정)**: 반드시 `useAdminClubDetailQuery`의 전체 `ClubDetail`로 시드한다. 부분 필드로 시드하면 안 보이는 필드를 `""`/clear로 덮어써 데이터 손실.
- 저장/취소 UX + 저장 성공 시 상세 즉시 갱신(뮤테이션 invalidate + `onSaved`로 편집 모드 종료).

### 2-6. `ClubInfoForm` 결합도 개선 — 뮤테이션 주입 (Option A 채택)
Form이 "누가 사용하는지"를 모르도록, 내부 뮤테이션 생성을 제거하고 상위에서 주입한다. 유일한 기존 호출부(`manage/clubs/[clubId]/info/page.tsx`)가 `'use client'` 컴포넌트라 훅을 들 수 있어 자연스럽게 적용 가능(변경 범위 과하지 않음).

- `ClubInfoForm`에서 제거: `import { useUpdateClubMutation }`, 내부 `const mutation = useUpdateClubMutation(clubId)`(L89), 그리고 이제 미사용이 되는 `clubId` prop.
- `ClubInfoForm`에 추가할 props:
  ```ts
  type ClubUpdateMutation = {
    mutateAsync: (payload: UpdateClubPayload) => Promise<ClubDetail>;
    isPending: boolean;
  };
  type ClubInfoFormProps = {
    detail: ClubDetail;
    readOnly: boolean;
    mutation: ClubUpdateMutation;   // 주입 — 리더/관리자 어느 쪽이든 구조적으로 대입 가능
    onCancel?: () => void;          // 제공 시 저장 버튼 옆 "취소" 렌더 (리더 페이지 미제공 → 기존 그대로)
    onSaved?: () => void;           // mutateAsync 성공 후 호출 (관리자 편집 모드 종료용)
  };
  ```
  - `useUpdateClubMutation`·`useAdminUpdateClubMutation` 결과 모두 `ClubUpdateMutation`에 구조적으로 대입되므로, Form은 주체를 몰라도 됨(향후 다른 수정 주체도 Form 변경 없이 확장). `any`/`as` 미사용.
  - 기존 `mutation.mutateAsync(payload)`·`mutation.isPending` 사용부는 주입된 prop을 그대로 사용. `handleSubmit` 성공 후 `setSavedAt(...)`에 더해 `onSaved?.()` 호출.
- 리더 호출부(`info/page.tsx`) 갱신 — 같은 PR에서:
  ```tsx
  const mutation = useUpdateClubMutation(currentClubId);
  return <ClubInfoForm detail={detail} readOnly={readOnly} mutation={mutation} />;
  ```
- 하위 호환: 리더 기능 동작 불변(뮤테이션·엔드포인트·payload 동일, 호출 위치만 상위로 이동). `onCancel`/`onSaved` 미전달 시 기존 저장 UX 그대로.

> 참고: 이 방식이 기존 구조상 과도해질 경우에만 `variant` 폴백을 쓰기로 했으나, 호출부가 클라이언트 컴포넌트여서 주입이 자연스러워 **주입 방식으로 확정**한다.

### 변경 파일 요약 (PR-2)
- `packages/api/src/client.ts`, `packages/hooks/src/admin.ts`
- `apps/web/app/admin/clubs/[clubId]/_pages/AdminClubDetailPage.tsx`
- `apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`(뮤테이션 주입 구조로 전환)
- `apps/web/app/manage/clubs/[clubId]/info/page.tsx`(리더 호출부 — 뮤테이션 생성·주입, `clubId` prop 제거)
- (필요 시) 회원 검색 인풋 소형 컴포넌트, 단과대 라벨 매핑 재사용
- 테스트: `apps/web/test/...`(회원 필터/페이지네이션/검색 Empty, 수정 모드 진입·저장 뮤테이션 mock)

---

## Out of Scope

- 서버 사이드 회원 페이지네이션/검색 (admin 회원 API에 Pageable·검색 파라미터 추가) — 현 규모에서 불필요, 명시적으로 안 함.
- 학과(전공) 정규화/별도 테이블 도입 — `major`는 자유 텍스트 유지.
- 관리자 전용 필드 제한(리더보다 좁은 편집 범위) — 관리자는 `ClubInfoForm` 전체 필드를 리더와 동일하게 수정.
- 회원 CSV export의 관리자 버전, 회원 역할 변경/추방 등 명단 조작 — 이번 범위 아님.
- 리더 수정 API·엔드포인트·payload·저장 동작 변경 없음 — `ClubInfoForm`은 뮤테이션 주입 구조로 리팩터링하되(호출부 동시 갱신) 리더 기능 동작은 그대로.
- 상세 페이지의 사진 관리·모집 등 다른 섹션.

---

## 리뷰 계획 (메모리 규약)
- PR-1: 권한·상태전이 관련 → `duing-code-reviewer` + `codex:review` + `codex:adversarial-review`(권한/상태 게이트 우회 여부, ADMIN 검증 위치, 임의 동아리 편집 안전성).
- PR-2: `duing-code-reviewer`(FE 컨벤션) + `codex:review`. 시드 함정·fail-open 상태 가드·페이지 리셋/스크롤 유지 확인.
- 각 구현 subagent 디스패치 시 push·PR 생성 금지 명시.
- PR 직전 spec/PR 7개 self-check 수행.

## 커밋/브랜치 (메모리 규약)
- PR-1 브랜치 `feat/{issue}-admin-club-update-api`, 커밋 `feat(backend): ...`(Conventional Commits, `[#issue]` 금지).
- PR-2 브랜치 `feat/{issue}-admin-club-detail-edit-members`, 커밋 `feat(frontend): ...`.
- Claude attribution 라인 금지. 자동 머지 금지(사용자 지시 후에만).

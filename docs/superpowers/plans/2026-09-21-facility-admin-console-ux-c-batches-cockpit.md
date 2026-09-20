# 시설 제출 대기·이력·상세·콕핏 UX (PR-C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제출 대기 탭·제출 이력 탭·배치 상세·전사 콕핏의 동선 결함 7건(스펙 C1~C7)을 고친다 — 콕핏 건 목록에 날짜, 상태별 뒤로가기, 콕핏 헤더 CSV·완료 처리, 콕핏 제목, REVIEWING 행 상세 링크, 배치 목록 검색(제출번호·메모·동아리명·생성일), CSV 비활성 행별.

**Architecture:** 프론트(`apps/web` + `packages/types`·`packages/hooks`) 변경. 백엔드는 PR-A 의 배치 목록 검색 파라미터(`q`, `submittedFrom`, `submittedTo`)에만 의존하며, API client 의 `list` 는 이미 `cleanParams(params)` 로 쿼리스트링을 만들므로 타입에 필드를 추가하면 그대로 전송된다(빈 값은 호출부가 `undefined` 로 넣어 생략). 콕핏의 완료 처리·CSV 는 상세 페이지 핸들러와 같은 로직이라 `useSubmissionBatchActions` 훅으로 승격해 두 화면이 공유한다(frontend/CLAUDE.md "두 곳 이상이면 승격"). 목록 탭은 행 단위 대상이라 이번엔 그대로 둔다.

**Tech Stack:** Next.js 15 App Router · React 19(`useDeferredValue`) · TanStack Query · Vitest + Testing Library · `@duing/types`·`@duing/hooks`·`@duing/api` 워크스페이스 패키지.

**Spec:** `docs/superpowers/specs/2026-09-21-facility-admin-console-ux-design.md` §2.3(C1~C7), §3 테스트 전략, §4 PR-C 행.

**Branch:** `fix/facility-submission-batches-ux`(`develop` 기준). PR 은 PR-A(`feat/facility-admin-console-api`) 머지 후 연다 — C6 는 파라미터를 보내기만 하므로 개발·테스트는 독립.

## Global Constraints

- `any` 금지, `as` 타입 단언 금지(테스트 파일의 기존 `{} as …` 스텁은 이 플랜에서 실제 값으로 교체한다), 타입 선언은 `type` 만(`interface` 금지).
- 서버 상태는 TanStack Query 로만 — `useEffect` 안 데이터 패칭 금지, `useQuery`/`useMutation` 내부 mock 금지(훅 단위 `vi.mock('@duing/hooks', …)` 만 허용).
- 네트워크는 `@duing/api` 경유 — 컴포넌트·훅에서 `ky`·`fetch` 직접 호출 금지.
- 변수명은 역할이 드러나게(`data`·`res`·`e` 금지).
- 훅이 바뀌는 Task 6(`useSubmissionBatchesQuery` params 타입 + `keepPreviousData`)은 `apps/web` 전체 스위트를 1회 돌린다.
- 각 Task 의 GREEN = `pnpm vitest run <테스트 파일>` + `pnpm typecheck` + `pnpm lint`(모두 `frontend/apps/web` 에서). Link `href` 를 추가·변경하는 Task(2·5)는 typedRoutes 위반이 `tsc` 로 잡히지 않으므로 `pnpm build` 를 추가로 돌린다(빌드 env 는 `.env.local` 없으면 CI 더미 https 값 — `reference_frontend_worktree_build_env` 참고).
- 커밋 메시지: Conventional Commits 한국어 `type(scope): 대상 — 변경점`. `Co-Authored-By`·🤖 라인 금지.
- 사용자 대면 문구는 한글, 기존 해요체·라벨(제출 대기/제출 이력/완료 처리/CSV/상세/제출 정보 보기)과 일관.
- 실행 위치: `cd /Users/ksy/orca/workspaces/Duing/osprey/frontend/apps/web` (워크트리 루트 기준). `node_modules` 가 없으면 `cd ../.. && pnpm install --frozen-lockfile` 먼저.

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `apps/web/app/admin/facility-bookings/submission/[batchId]/transcribe/_pages/TranscribeCockpitPage.tsx` | 콕핏 화면: 건 목록 날짜(C1), 헤더 제목(C4), 헤더 CSV·완료 처리(C3) | 1·3·4 |
| `apps/web/test/admin/facility-submission/transcribe-cockpit.test.tsx` | 콕핏 테스트 — 배치 스텁을 실제 값으로 교체 | 1·3·4 |
| `apps/web/app/admin/facility-bookings/submission/[batchId]/_pages/SubmissionBatchDetailPage.tsx` | 상세 뒤로가기 상태별(C2) | 2 |
| `apps/web/test/admin/facility-submission/submission-batch-detail.test.tsx` | 상세 테스트 | 2 |
| `apps/web/app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx` | REVIEWING 상세 링크(C5), 검색 필터 행(C6), CSV 행별 비활성(C7) | 5·6·7 |
| `apps/web/test/admin/facility-submission/submission-batches-tab.test.tsx` | 탭 테스트 | 5·6·7 |
| `apps/web/app/admin/facility-bookings/submission/_lib/useSubmissionBatchActions.ts` | 완료 처리·CSV 액션 훅(상세·콕핏 공유, C3 선행) | 3.5 |
| `packages/types/src/facilitySubmission.ts` | `SubmissionBatchListParams` 검색 필드(C6) | 6 |
| `packages/hooks/src/facilitySubmissionAdmin.ts` | `useSubmissionBatchesQuery` 에 `keepPreviousData`(C6) | 6 |

`packages/api/src/domains/admin.ts` 의 `facilitySubmission.list` 는 `cleanParams(params)` 로 이미 임의 키를 직렬화하므로 수정하지 않는다. `packages/hooks/src/adminQueryKeys.ts` 의 `facilitySubmissionBatches(params)` 는 params 객체 전체를 키에 넣으므로 수정하지 않는다. `SubmissionBatchesTab.tsx` 의 완료·CSV 핸들러는 행 단위(`completeTarget` 배치 객체)라 Task 3.5 훅으로 바꾸지 않는다.

---

### Task 1: 콕핏 건 목록에 날짜 표기 (C1, #4)

**Files:**
- Modify: `apps/web/app/admin/facility-bookings/submission/[batchId]/transcribe/_pages/TranscribeCockpitPage.tsx:276`
- Test: `apps/web/test/admin/facility-submission/transcribe-cockpit.test.tsx`

**Interfaces:**
- Consumes: `SubmissionCandidateBooking.reservationDate`(`YYYY-MM-DD`), `startTime`(`HH:mm`).
- Produces: 없음(표시만).

- [ ] **Step 1: 실패 테스트 추가**

`transcribe-cockpit.test.tsx` 의 `describe('TranscribeCockpitPage', …)` 안, `'현재 시설의 다른 건을 우측 리스트에서 선택해 이동한다'` 테스트 **다음**에 추가:

```tsx
  it('우측 건 목록은 같은 동아리라도 날짜·시간으로 구분된다(배치=동아리 단위)', () => {
    mockDetailQuery.mockReturnValue(
      detailSuccess([
        booking({ bookingId: 1, clubName: '밴드부', reservationDate: '2026-08-10', startTime: '18:00' }),
        booking({ bookingId: 2, clubName: '밴드부', reservationDate: '2026-08-17', startTime: '18:00' }),
      ]),
    );
    renderCockpit();

    // 동명·동시각 두 건이 날짜로 갈린다 — 날짜가 없으면 둘 다 "밴드부 18:00" 이라 구분 불가.
    expect(screen.getByRole('button', { name: /밴드부\s*08\/10 18:00/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /밴드부\s*08\/17 18:00/ })).toBeInTheDocument();
  });
```

기존 테스트 `'현재 시설의 다른 건을 우측 리스트에서 선택해 이동한다'` 의 셀렉터를 날짜 포함으로 갱신:

```tsx
    fireEvent.click(screen.getByRole('button', { name: /연극부\s*08\/10 19:00/ }));
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/transcribe-cockpit.test.tsx`
Expected: FAIL — 새 테스트 2단언과 갱신한 셀렉터가 `Unable to find role="button" and name /밴드부\s*08\/10 18:00/`.

- [ ] **Step 3: 구현**

`TranscribeCockpitPage.tsx:276` 의

```tsx
                        <span className="tabular-nums text-[10.5px] text-charcoal-3">{item.startTime}</span>
```

를 아래로 교체:

```tsx
                        {/* 배치=동아리 단위라 전 행이 같은 이름 — 날짜(MM/DD)+시간이 유일한 구분자다(감사 #4). */}
                        <span className="tabular-nums text-[10.5px] text-charcoal-3">
                          {item.reservationDate.slice(5).replace('-', '/')} {item.startTime}
                        </span>
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission/transcribe-cockpit.test.tsx && pnpm typecheck && pnpm lint`
Expected: 전부 PASS, lint 신규 경고 0(기존 `notifications/page.tsx` 경고 1건은 무관).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/admin/facility-bookings/submission/\[batchId\]/transcribe/_pages/TranscribeCockpitPage.tsx apps/web/test/admin/facility-submission/transcribe-cockpit.test.tsx
git commit -m "fix(frontend): 전사 콕핏 건 목록 — 동아리명만 있어 구분 안 되던 행에 날짜(MM/DD) 표기"
```

---

### Task 2: 배치 상세 뒤로가기를 상태별로 (C2, #5)

**Files:**
- Modify: `apps/web/app/admin/facility-bookings/submission/[batchId]/_pages/SubmissionBatchDetailPage.tsx:40-42, 136-155`
- Test: `apps/web/test/admin/facility-submission/submission-batch-detail.test.tsx`

**Interfaces:**
- Consumes: `deriveBatchStatus(batch)`(`../../_lib/submissionBatches`), `toRoute`.
- Produces: 없음.

- [ ] **Step 1: 실패 테스트 추가**

`submission-batch-detail.test.tsx` 의 `// ① 헤더` 테스트 **앞**에 추가:

```tsx
  // ⓪ 뒤로가기 — 진행 중 배치는 제출 대기 탭으로, 완료·취소는 제출 이력 탭으로 돌아간다(감사 #5).
  it('REVIEWING 배치의 뒤로가기는 제출 대기 탭, 완료 배치는 제출 이력 탭으로 향한다', () => {
    mockDetailQuery.mockReturnValue(detailSuccess(makeDetail()));
    const { unmount } = render(<SubmissionBatchDetailPage batchId={1} />);
    expect(screen.getByRole('link', { name: '← 제출 대기' })).toHaveAttribute(
      'href',
      '/admin/facility-bookings?tab=ready',
    );
    unmount();

    mockDetailQuery.mockReturnValue(
      detailSuccess(makeDetail({ batch: makeBatch({ completed: true, completedAt: '2026-08-02T09:00:00' }) })),
    );
    render(<SubmissionBatchDetailPage batchId={1} />);
    expect(screen.getByRole('link', { name: '← 제출 이력' })).toHaveAttribute(
      'href',
      '/admin/facility-bookings?tab=archive',
    );
  });

  it('상세 로딩 전에는 뒤로가기가 제출 이력 탭을 가리킨다(상태를 모를 때의 폴백)', () => {
    mockDetailQuery.mockReturnValue({ data: undefined, isLoading: true, isSuccess: false, isError: false });
    render(<SubmissionBatchDetailPage batchId={1} />);
    expect(screen.getByRole('link', { name: '← 제출 이력' })).toHaveAttribute(
      'href',
      '/admin/facility-bookings?tab=archive',
    );
  });
```

기존 `'취소를 확정하면 목록 탭으로 이동하고 성공 토스트를 띄운다'` 의 단언(`:399`)은 그대로 `tab=archive`(취소됐으므로 이력) — 변경 없음.

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-batch-detail.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "link" and name "← 제출 대기"`.

- [ ] **Step 3: 구현**

`SubmissionBatchDetailPage.tsx:40-42` 의

```tsx
// 완료·취소 배치 상세에서도 돌아갈 수 있게 전체 이력 탭으로 복귀한다(제출 대기 탭엔 진행 중만 있음).
const BATCH_LIST_ROUTE = toRoute('/admin/facility-bookings?tab=archive');
```

를 아래로 교체:

```tsx
// 진행 중(REVIEWING) 배치는 '제출 대기' 탭에서 들어오므로 그리로, 완료·취소는 '제출 이력' 탭으로 돌아간다(감사 #5).
// 상태를 모르는 로딩 전·404 와 취소 직후(취소됐으므로 이력)는 archive 폴백.
const ARCHIVE_ROUTE = toRoute('/admin/facility-bookings?tab=archive');
const READY_ROUTE = toRoute('/admin/facility-bookings?tab=ready');
```

`:116-117`(취소 성공 후 `router.replace(BATCH_LIST_ROUTE)`)을 `router.replace(ARCHIVE_ROUTE)` 로.

`:89` `const detail = detailQuery.data;` 다음 줄에 뒤로가기 파생 추가:

```tsx
  const backToReady = detail !== undefined && deriveBatchStatus(detail.batch) === 'REVIEWING';
  const backRoute = backToReady ? READY_ROUTE : ARCHIVE_ROUTE;
  const backLabel = backToReady ? '← 제출 대기' : '← 제출 이력';
```

`:137-139` 의 링크를

```tsx
        <Link href={backRoute} className="text-[13px] text-charcoal-2 hover:text-ink">
          {backLabel}
        </Link>
```

로. `:148-153` 의 404 링크 `href={BATCH_LIST_ROUTE}` → `href={ARCHIVE_ROUTE}`(라벨 "제출 이력으로 돌아가기" 유지).

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-batch-detail.test.tsx && pnpm typecheck && pnpm lint && pnpm build`
Expected: 전부 PASS(`toRoute` 리터럴 두 개 모두 typedRoutes 통과).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/admin/facility-bookings/submission/\[batchId\]/_pages/SubmissionBatchDetailPage.tsx apps/web/test/admin/facility-submission/submission-batch-detail.test.tsx
git commit -m "fix(frontend): 제출 목록 상세 뒤로가기 — 진행 중 배치는 제출 대기 탭으로, 완료·취소는 제출 이력 탭으로"
```

---

### Task 3: 콕핏 제목을 배치 제목으로 (C4, #13)

**Files:**
- Modify: `apps/web/app/admin/facility-bookings/submission/[batchId]/transcribe/_pages/TranscribeCockpitPage.tsx:15-16, 74`
- Test: `apps/web/test/admin/facility-submission/transcribe-cockpit.test.tsx:37-44`

**Interfaces:**
- Consumes: `batchTitle(batch)`(`../../../_lib/submissionBatches`, `Pick<SubmissionBatchSummary,'memo'|'submissionNo'>`).
- Produces: 테스트 헬퍼 `detailSuccess(bookings, batchOverrides?)` — Task 4 가 `completed`/`cancelled` 배치를 만들 때 재사용.

- [ ] **Step 1: 테스트 스텁을 실제 배치로 교체 + 실패 테스트**

`transcribe-cockpit.test.tsx:37-44` 의 `detailSuccess` 를 아래로 교체(`{} as …` 단언 제거 — `batchTitle` 은 `memo` 가 `undefined` 면 `.trim()` 에서 던지므로 스텁이 실제 값이어야 한다):

```tsx
function makeBatch(overrides: Partial<SubmissionBatchSummary> = {}): SubmissionBatchSummary {
  return {
    batchId: 7,
    submissionNo: 'SUB-20260801-007',
    facilityId: null,
    facilityName: null,
    facilityNames: ['세미나실 A'],
    bookingCount: 2,
    clubNames: ['밴드부'],
    submittedAt: '2026-08-01T15:30:00Z',
    submittedByName: '관리자',
    memo: '8월 1주차 · 밴드부',
    cancelled: false,
    cancelledAt: null,
    completed: false,
    completedAt: null,
    ...overrides,
  };
}

function detailSuccess(bookings: SubmissionCandidateBooking[], batchOverrides: Partial<SubmissionBatchSummary> = {}) {
  const data: SubmissionBatchDetail = { batch: makeBatch(batchOverrides), bookings, audits: [] };
  return { data, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn() };
}
```

파일 상단 타입 import 를 `import type { SubmissionBatchDetail, SubmissionBatchSummary, SubmissionCandidateBooking } from '@duing/types';` 로.

`'제출 대기로 돌아가는 링크를 제공한다'` 테스트 **앞**에 추가:

```tsx
  it('제목은 배치 메모(제목 승격)이고 제출번호는 서브로, 메모가 없으면 제출번호가 제목이다', () => {
    renderCockpit();
    expect(screen.getByRole('heading', { name: '8월 1주차 · 밴드부' })).toBeInTheDocument();
    expect(screen.getByText('SUB-20260801-007')).toBeInTheDocument();
  });

  it('메모 없는 배치는 제출번호가 제목이고 서브 번호는 중복 표기하지 않는다', () => {
    mockDetailQuery.mockReturnValue(detailSuccess(BOOKINGS, { memo: null }));
    renderCockpit();
    expect(screen.getByRole('heading', { name: 'SUB-20260801-007' })).toBeInTheDocument();
    expect(screen.getAllByText('SUB-20260801-007')).toHaveLength(1);
  });

  it('데이터 로딩 전에는 제목이 "제출 정보 보기" 다', () => {
    mockDetailQuery.mockReturnValue({ data: undefined, isLoading: true, isSuccess: false, isError: false, refetch: vi.fn() });
    renderCockpit();
    expect(screen.getByRole('heading', { name: '제출 정보 보기' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/transcribe-cockpit.test.tsx`
Expected: 새 테스트 2개 FAIL(`heading "8월 1주차 · 밴드부"` 없음), 로딩 테스트는 PASS(현행 고정 제목).

- [ ] **Step 3: 구현**

`TranscribeCockpitPage.tsx:15` import 아래에 추가:

```tsx
import { batchTitle } from '../../../_lib/submissionBatches';
```

`:74` 의 `<h1 className="text-xl text-ink-deep">제출 정보 보기</h1>` 를 아래로 교체:

```tsx
        {/* 메모=제목 승격(개편 스펙 §7, 목록·상세와 동일) — 어느 제출 목록을 옮겨 쓰는지 헤더에서 확인한다(감사 #13). */}
        <h1 className="text-xl text-ink-deep">
          {detailQuery.data !== undefined ? batchTitle(detailQuery.data.batch) : '제출 정보 보기'}
        </h1>
        {detailQuery.data !== undefined && batchTitle(detailQuery.data.batch) !== detailQuery.data.batch.submissionNo && (
          <span className="tabular-nums text-xs text-charcoal-3">{detailQuery.data.batch.submissionNo}</span>
        )}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission/transcribe-cockpit.test.tsx && pnpm typecheck && pnpm lint`
Expected: 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/admin/facility-bookings/submission/\[batchId\]/transcribe/_pages/TranscribeCockpitPage.tsx apps/web/test/admin/facility-submission/transcribe-cockpit.test.tsx
git commit -m "fix(frontend): 전사 콕핏 제목 — 고정 문구 대신 배치 메모(제목 승격)와 제출번호 표기"
```

---

### Task 3.5: 완료 처리·CSV 액션 훅 추출 (C3 선행 리팩토링)

**Files:**
- Create: `apps/web/app/admin/facility-bookings/submission/_lib/useSubmissionBatchActions.ts`
- Modify: `apps/web/app/admin/facility-bookings/submission/[batchId]/_pages/SubmissionBatchDetailPage.tsx:5-12, 17, 34, 65-69, 78-79, 85-86, 100-108, 122-132, 210-228, 336-345`
- Test: `apps/web/test/admin/facility-submission/submission-batch-detail.test.tsx`(무수정 — 회귀망)

**Why:** 완료 처리·CSV 핸들러가 이미 `SubmissionBatchesTab.tsx:46-117`·`SubmissionBatchDetailPage.tsx:65-132` 두 벌이고 Task 4 가 콕핏에 세 번째를 만든다 — frontend/CLAUDE.md "두 곳 이상에서 쓰이면 승격" 규칙. 상세 페이지와 콕핏이 이 훅을 쓰고, 목록 탭은 행 단위(`completeTarget` 이 배치 객체)라 시그니처가 달라 이번엔 그대로 둔다.

**Interfaces:**
- Produces:
  ```ts
  useSubmissionBatchActions(options?: { onCompleted?: (result: CompleteSubmissionBatchResult) => void }): {
    completeOpen: boolean; setCompleteOpen: (open: boolean) => void;
    completeResult: CompleteSubmissionBatchResult | null; setCompleteResult: (result: CompleteSubmissionBatchResult | null) => void;
    confirmComplete: (batchId: number) => Promise<void>;
    downloadCsv: (batch: Pick<SubmissionBatchSummary, 'batchId' | 'submissionNo'>) => Promise<void>;
    isCompleting: boolean; isDownloading: boolean; downloadingBatchId: number | null;
  }
  ```
  `confirmComplete` 는 성공 시 확인 Dialog 를 닫고 스킵 0 이면 토스트, 스킵 있으면 `completeResult` 를 채운 뒤 두 경우 모두 `onCompleted(result)` 를 부른다. 실패는 서버 메시지 우선 에러 토스트. `downloadCsv` 는 제출번호 규칙 파일명으로 저장, 실패는 에러 토스트.
- Consumes: `useCompleteSubmissionBatchMutation`·`useDownloadSubmissionCsvMutation`(`@duing/hooks`), `useToast`, `downloadBlobFile`, `submissionCsvFileName`.

- [ ] **Step 1: 훅 작성**

`apps/web/app/admin/facility-bookings/submission/_lib/useSubmissionBatchActions.ts` 생성:

```ts
'use client';

import { useState } from 'react';
import { useCompleteSubmissionBatchMutation, useDownloadSubmissionCsvMutation } from '@duing/hooks';
import type { CompleteSubmissionBatchResult, SubmissionBatchSummary } from '@duing/types';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { downloadBlobFile } from '@/app/_lib/downloadFile';
import { submissionCsvFileName } from './submissionBatches';

/** 완료 실패는 서버 메시지 우선(409 기취소·기완료 안내), 없으면 폴백 — 목록 탭 batchCompleteErrorMessage 동일. */
function completeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '학교 제출 완료에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

type Options = {
  /** 완료 성공 직후(스킵 유무와 무관) — 콕핏은 스킵 0 이면 여기서 이력 탭으로 이동한다. */
  onCompleted?: (result: CompleteSubmissionBatchResult) => void;
};

/**
 * 한 배치의 완료 처리·CSV 다운로드(스펙 v3 §7.3) — 상세 페이지와 전사 콕핏이 함께 쓴다(감사 #12 승격).
 * 확인 Dialog 열림·결과 Dialog 데이터를 훅이 들고, 스킵 0 은 토스트로 끝내고 스킵 있으면 결과를 채운다.
 * 목록 탭은 행 단위(배치 객체를 대상으로 잡음)라 이 훅을 쓰지 않는다.
 */
export function useSubmissionBatchActions({ onCompleted }: Options = {}) {
  const completeMutation = useCompleteSubmissionBatchMutation();
  const csvMutation = useDownloadSubmissionCsvMutation();
  const { addToast } = useToast();
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeResult, setCompleteResult] = useState<CompleteSubmissionBatchResult | null>(null);

  const confirmComplete = async (batchId: number) => {
    try {
      const result = await completeMutation.mutateAsync({ batchId });
      setCompleteOpen(false);
      // 스킵 0 은 토스트로 마무리, 스킵 있으면 확인 Dialog 를 닫고 결과 Dialog(제외 목록)를 연다.
      if (result.skippedCount === 0) addToast('학교 제출이 완료되었습니다.');
      else setCompleteResult(result);
      onCompleted?.(result);
    } catch (error) {
      // 실패 시 확인 Dialog 를 유지(completeOpen 그대로) — 서버 메시지 우선 안내만.
      addToast(completeErrorMessage(error), { variant: 'error' });
    }
  };

  const downloadCsv = async (batch: Pick<SubmissionBatchSummary, 'batchId' | 'submissionNo'>) => {
    try {
      const csvBlob = await csvMutation.mutateAsync({ batchId: batch.batchId });
      downloadBlobFile(submissionCsvFileName(batch.submissionNo), csvBlob);
    } catch {
      addToast('CSV 다운로드에 실패했어요. 잠시 후 다시 시도해 주세요.', { variant: 'error' });
    }
  };

  return {
    completeOpen,
    setCompleteOpen,
    completeResult,
    setCompleteResult,
    confirmComplete,
    downloadCsv,
    isCompleting: completeMutation.isPending,
    isDownloading: csvMutation.isPending,
    downloadingBatchId: csvMutation.variables?.batchId ?? null,
  };
}
```

- [ ] **Step 2: 상세 페이지를 훅 소비로 교체**

`SubmissionBatchDetailPage.tsx` import 블록(`:5-12`, `:17`, `:34`) 을 아래로:

```tsx
import {
  formatDateKst,
  useCancelSubmissionBatchMutation,
  useSubmissionBatchDetailQuery,
} from '@duing/hooks';
import type { SubmissionCandidateBooking } from '@duing/types';
```

(`useCompleteSubmissionBatchMutation`·`useDownloadSubmissionCsvMutation`·`CompleteSubmissionBatchResult`·`downloadBlobFile` import 삭제, `submissionCsvFileName` 을 `'../../_lib/submissionBatches'` import 목록에서 삭제.) 그리고 `'../../_lib/submissionBatches'` import 다음 줄에:

```tsx
import { useSubmissionBatchActions } from '../../_lib/useSubmissionBatchActions';
```

`:65-69` `completeErrorMessage` 함수 삭제. `:78-79` 두 뮤테이션 훅 줄과 `:85-86` 두 state 줄을 삭제하고, `:80` `const { addToast } = useToast();` 다음 줄에:

```tsx
  const batchActions = useSubmissionBatchActions();
```

`:100-108` `handleDownloadCsv`·`:122-132` `handleCompleteConfirm` 삭제.

`:210-228` 액션 버튼 두 개를 아래로:

```tsx
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={batchActions.isDownloading}
                  onClick={() => void batchActions.downloadCsv(detail.batch)}
                >
                  {batchActions.isDownloading && <ButtonSpinner />}
                  CSV
                </button>
                {status === 'REVIEWING' && (
                  // '완료 처리' — 상태 배지 '제출 완료'와 구분되는 명령형 동작 라벨(목록 탭과 통일).
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => batchActions.setCompleteOpen(true)}
                  >
                    완료 처리
                  </button>
                )}
```

`:336-345` 완료 Dialog 2종을 아래로:

```tsx
      <BatchCompleteDialog
        batch={batchActions.completeOpen && detail !== undefined ? detail.batch : null}
        isPending={batchActions.isCompleting}
        onConfirm={() => void batchActions.confirmComplete(batchId)}
        onClose={() => batchActions.setCompleteOpen(false)}
      />
      <BatchCompleteResultDialog
        result={batchActions.completeResult}
        bookingsById={bookingsById}
        onClose={() => batchActions.setCompleteResult(null)}
      />
```

- [ ] **Step 3: 기존 상세 테스트로 회귀 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-batch-detail.test.tsx && pnpm typecheck && pnpm lint`
Expected: 전부 PASS, 테스트 파일 무수정. 근거: 상세 테스트는 `vi.mock('@duing/hooks')` 로 `useCompleteSubmissionBatchMutation`·`useDownloadSubmissionCsvMutation` 을, `vi.mock('@/app/_lib/downloadFile')`·`vi.mock('@/app/_components/toast/ToastProvider')` 로 다운로드·토스트를 모듈 단위로 바꾸므로 새 훅 파일이 같은 모듈을 import 해도 동일 mock 을 받는다. 단언 대상(`mockCompleteMutateAsync({ batchId })`·`mockDownloadBlobFile(파일명, Blob)`·토스트 문구·결과 Dialog 문구)은 훅이 그대로 옮긴 로직이다.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/app/admin/facility-bookings/submission/_lib/useSubmissionBatchActions.ts apps/web/app/admin/facility-bookings/submission/\[batchId\]/_pages/SubmissionBatchDetailPage.tsx
git commit -m "refactor(frontend): 제출 목록 완료 처리·CSV 핸들러 — 상세 페이지에서 useSubmissionBatchActions 훅으로 승격(콕핏 공유 준비)"
```

---

### Task 4: 콕핏 헤더에 CSV·완료 처리 (C3, #12)

**Files:**
- Modify: `apps/web/app/admin/facility-bookings/submission/[batchId]/transcribe/_pages/TranscribeCockpitPage.tsx`(import·훅·헤더·다이얼로그)
- Test: `apps/web/test/admin/facility-submission/transcribe-cockpit.test.tsx`

**Interfaces:**
- Consumes: Task 3.5 의 `useSubmissionBatchActions({ onCompleted })`, `BatchCompleteDialog { batch, isPending, onConfirm, onClose }`, `BatchCompleteResultDialog { result, bookingsById, onClose }`, `deriveBatchStatus`, `useGuardedRouter().replace`, `toRoute`.
- Produces: 없음.

- [ ] **Step 1: 테스트 mock 확장 + 실패 테스트**

`transcribe-cockpit.test.tsx` 상단 mock 을 아래로 교체:

```tsx
const mockDetailQuery = vi.fn();
const mockMembersQuery = vi.fn();
const mockCompleteMutateAsync = vi.fn();
const mockCsvMutateAsync = vi.fn();
const mockAddToast = vi.fn();
const mockDownloadBlobFile = vi.fn();
const mockReplace = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useSubmissionBatchDetailQuery: (...args: unknown[]) => mockDetailQuery(...args),
  useAdminClubMembersQuery: (...args: unknown[]) => mockMembersQuery(...args),
  useCompleteSubmissionBatchMutation: () => ({ mutateAsync: mockCompleteMutateAsync, isPending: false }),
  useDownloadSubmissionCsvMutation: () => ({ mutateAsync: mockCsvMutateAsync, isPending: false }),
}));
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));
vi.mock('@/app/_lib/downloadFile', () => ({
  downloadBlobFile: (...args: unknown[]) => mockDownloadBlobFile(...args),
}));
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ replace: mockReplace }),
}));
```

`beforeEach` 에 리셋 추가:

```tsx
  mockCompleteMutateAsync.mockReset();
  mockCsvMutateAsync.mockReset();
  mockAddToast.mockReset();
  mockDownloadBlobFile.mockReset();
  mockReplace.mockReset();
  mockCsvMutateAsync.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }));
```

import 에 `waitFor` 추가: `import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';`

`describe` 끝에 추가:

```tsx
  it('헤더 CSV 는 batchId 로 내려받아 제출번호 규칙 파일명으로 저장한다', async () => {
    renderCockpit();
    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    await waitFor(() => {
      expect(mockCsvMutateAsync).toHaveBeenCalledWith({ batchId: 7 });
      expect(mockDownloadBlobFile).toHaveBeenCalledWith('facility-submission-SUB-20260801-007.csv', expect.any(Blob));
    });
  });

  it('헤더 완료 처리 → 확인 Dialog → 확인 시 batchId 로 완료하고 스킵 0 이면 토스트 후 제출 이력 탭으로 이동한다', async () => {
    mockCompleteMutateAsync.mockResolvedValue({
      totalCount: 2, confirmedCount: 2, skippedCount: 0, completedAt: '2026-08-02T09:00:00', skippedBookings: [],
    });
    renderCockpit();
    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '완료 처리' }));
    await waitFor(() => {
      expect(mockCompleteMutateAsync).toHaveBeenCalledWith({ batchId: 7 });
      expect(mockAddToast).toHaveBeenCalledWith('학교 제출이 완료되었습니다.');
      expect(mockReplace).toHaveBeenCalledWith('/admin/facility-bookings?tab=archive');
    });
  });

  it('스킵이 있으면 결과 Dialog 에 예약일·동아리로 제외 행을 보여주고, 닫으면 제출 이력 탭으로 이동한다', async () => {
    mockCompleteMutateAsync.mockResolvedValue({
      totalCount: 2, confirmedCount: 1, skippedCount: 1, completedAt: '2026-08-02T09:00:00',
      skippedBookings: [{ bookingId: 2, status: 'CANCELLED', reason: '취소된 예약' }],
    });
    renderCockpit();
    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '완료 처리' }));
    const resultDialog = await screen.findByRole('dialog', { name: '학교 제출 완료' });
    expect(within(resultDialog).getByText('2026-08-10 연극부 · 취소된 예약')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.click(within(resultDialog).getByRole('button', { name: '확인' }));
    expect(mockReplace).toHaveBeenCalledWith('/admin/facility-bookings?tab=archive');
  });

  it('완료 실패 시 서버 메시지를 토스트로 띄우고 이동하지 않는다', async () => {
    mockCompleteMutateAsync.mockRejectedValue(new Error('이미 완료된 제출 목록입니다.'));
    renderCockpit();
    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '완료 처리' }));
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('이미 완료된 제출 목록입니다.', { variant: 'error' });
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('완료·취소된 배치에는 완료 처리 버튼이 없고 CSV 는 남는다', () => {
    mockDetailQuery.mockReturnValue(detailSuccess(BOOKINGS, { completed: true, completedAt: '2026-08-02T09:00:00' }));
    renderCockpit();
    expect(screen.queryByRole('button', { name: '완료 처리' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CSV/ })).toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/transcribe-cockpit.test.tsx`
Expected: 새 테스트 4개 FAIL(`button /CSV/`·`'완료 처리'` 없음), 마지막 테스트는 CSV 단언에서 FAIL.

- [ ] **Step 3: 구현**

`TranscribeCockpitPage.tsx` import 블록을 아래로 교체:

```tsx
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';

import { useSubmissionBatchDetailQuery } from '@duing/hooks';
import type { SubmissionCandidateBooking } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { ConsoleCard } from '../../../../../_components/ConsoleCard';
import { BatchCompleteDialog } from '../../../_components/BatchCompleteDialog';
import { BatchCompleteResultDialog } from '../../../_components/BatchCompleteResultDialog';
import { CopyField } from '../../../_components/CopyField';
import { ClubRosterAccordion } from '../../../_components/ClubRosterAccordion';
import { HWP_FIELDS, groupByFacility, toFormBlock, toTabLine } from '../../../_lib/hwpFields';
import { batchTitle, deriveBatchStatus } from '../../../_lib/submissionBatches';
import { useSubmissionBatchActions } from '../../../_lib/useSubmissionBatchActions';
import { useTranscribeProgress } from '../../../_lib/useTranscribeProgress';

// 완료 처리 후 복귀지 — 완료된 배치는 제출 이력 탭에 있다.
const ARCHIVE_ROUTE = toRoute('/admin/facility-bookings?tab=archive');
```

컴포넌트 본문 `:24-27`(훅 4줄) 아래에 추가:

```tsx
  const router = useGuardedRouter();
  // 콕핏은 전 건 작성 후 바로 완료 처리까지 이어지는 화면이다(감사 #12) — 상세 페이지와 같은 훅.
  // 스킵 0 은 즉시 이력 탭으로, 스킵 있으면 결과 Dialog 를 보여준 뒤 닫을 때 이동한다.
  const batchActions = useSubmissionBatchActions({
    onCompleted: (result) => {
      if (result.skippedCount === 0) router.replace(ARCHIVE_ROUTE);
    },
  });

  const batch = detailQuery.data?.batch;
  const isReviewing = batch !== undefined && deriveBatchStatus(batch) === 'REVIEWING';
  // 완료 결과 Dialog(제외 목록)의 예약일·동아리 라벨 소스 — 상세 페이지와 동일 규칙.
  const bookingsById = useMemo<ReadonlyMap<number, SubmissionCandidateBooking> | null>(
    () => (detailQuery.data === undefined ? null : new Map(bookings.map((booking) => [booking.bookingId, booking]))),
    [detailQuery.data, bookings],
  );
```

헤더 `:69-75`(`<div className="flex items-center gap-2">…</div>`)를 아래로 교체(Task 3 의 제목 포함):

```tsx
      <div className="flex flex-wrap items-center gap-2">
        <Link href={backHref} className="btn btn-ghost btn-sm">
          <ArrowLeft size={15} />
          제출 대기로
        </Link>
        {/* 메모=제목 승격(개편 스펙 §7, 목록·상세와 동일) — 어느 제출 목록을 옮겨 쓰는지 헤더에서 확인한다(감사 #13). */}
        <h1 className="text-xl text-ink-deep">{batch !== undefined ? batchTitle(batch) : '제출 정보 보기'}</h1>
        {batch !== undefined && batchTitle(batch) !== batch.submissionNo && (
          <span className="tabular-nums text-xs text-charcoal-3">{batch.submissionNo}</span>
        )}
        {/* 헤더 액션(감사 #12) — 작업 순서대로 CSV → 완료 처리. 완료는 REVIEWING 전용, CSV 는 전 상태(감사용 재다운로드). */}
        {batch !== undefined && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={batchActions.isDownloading}
              onClick={() => void batchActions.downloadCsv(batch)}
            >
              {batchActions.isDownloading && <ButtonSpinner />}
              CSV
            </button>
            {isReviewing && (
              <button
                type="button"
                className="btn btn-primary btn-sm bg-ink-deep hover:bg-ink"
                onClick={() => batchActions.setCompleteOpen(true)}
              >
                완료 처리
              </button>
            )}
          </div>
        )}
      </div>
```

`</main>` 직전(`:296` `)}` 다음)에 다이얼로그 2종을 쿼리 게이트 밖에 마운트:

```tsx
      {/* Dialog 는 쿼리 게이트 밖(페이지 레벨) — 완료 후 onSettled refetch 가 실패해도 결과 Dialog 가 사라지지 않게(상세 페이지 동일). */}
      <BatchCompleteDialog
        batch={batchActions.completeOpen && batch !== undefined ? batch : null}
        isPending={batchActions.isCompleting}
        onConfirm={() => void batchActions.confirmComplete(batchId)}
        onClose={() => batchActions.setCompleteOpen(false)}
      />
      <BatchCompleteResultDialog
        result={batchActions.completeResult}
        bookingsById={bookingsById}
        onClose={() => {
          batchActions.setCompleteResult(null);
          router.replace(ARCHIVE_ROUTE);
        }}
      />
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission/transcribe-cockpit.test.tsx && pnpm typecheck && pnpm lint`
Expected: 전부 PASS(Task 3 테스트 포함 15개).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/admin/facility-bookings/submission/\[batchId\]/transcribe/_pages/TranscribeCockpitPage.tsx apps/web/test/admin/facility-submission/transcribe-cockpit.test.tsx
git commit -m "feat(frontend): 전사 콕핏 헤더 — CSV·완료 처리 액션 추가로 전 건 작성 후 제출 대기 탭 왕복 제거"
```

---

### Task 5: 제출 대기 행에 읽기 전용 상세 링크 (C5, #14)

**Files:**
- Modify: `apps/web/app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx:252-268`
- Test: `apps/web/test/admin/facility-submission/submission-batches-tab.test.tsx:487-496`

**Interfaces:** 없음(링크 추가).

- [ ] **Step 1: 테스트 갱신**

`:487-496` 테스트를 아래로 교체:

```tsx
  it('진행 중(REVIEWING) 행은 제출 정보 보기(전사 콕핏)와 읽기 전용 상세 링크를 모두 노출한다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch({ batchId: 55 })]));
    render(<SubmissionBatchesTab />);

    expect(screen.getByRole('link', { name: '제출 정보 보기' })).toHaveAttribute(
      'href',
      '/admin/facility-bookings/submission/55/transcribe',
    );
    // 운영 기록·시간표는 상세에만 있어 진행 중 배치도 갈 수 있어야 한다(감사 #14).
    expect(screen.getByRole('link', { name: '상세' })).toHaveAttribute(
      'href',
      '/admin/facility-bookings/submission/55',
    );
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-batches-tab.test.tsx`
Expected: FAIL — `Unable to find … role "link" and name "상세"`.

- [ ] **Step 3: 구현**

`SubmissionBatchesTab.tsx:252-268` 의 삼항 링크를 아래로 교체:

```tsx
                        {/* 진행 중(REVIEWING)은 전사 콕핏(제출 정보 보기)이 주 진입점이고, 운영 기록·시간표를 보는
                            읽기 전용 상세도 함께 연다(감사 #14). 완료·취소는 상세만. */}
                        {status === 'REVIEWING' && (
                          <Link
                            href={toRoute(`/admin/facility-bookings/submission/${batch.batchId}/transcribe`)}
                            className="btn btn-ghost btn-sm"
                          >
                            제출 정보 보기
                          </Link>
                        )}
                        <Link
                          href={toRoute(`/admin/facility-bookings/submission/${batch.batchId}`)}
                          className="btn btn-ghost btn-sm"
                        >
                          상세
                        </Link>
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-batches-tab.test.tsx && pnpm typecheck && pnpm lint && pnpm build`
Expected: 전부 PASS(`'완료·취소 행은 …'` 테스트의 `queryByRole('link', { name: '제출 정보 보기' })` 부재 단언도 유지).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx apps/web/test/admin/facility-submission/submission-batches-tab.test.tsx
git commit -m "fix(frontend): 제출 대기 행 — 진행 중 배치에도 읽기 전용 상세 링크 노출"
```

---

### Task 6: 배치 목록 검색(제출번호·메모·동아리명·생성일) (C6, #15)

**Files:**
- Modify: `packages/types/src/facilitySubmission.ts:81`
- Modify: `packages/hooks/src/facilitySubmissionAdmin.ts:1, 48-54`
- Modify: `apps/web/app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx`(state·쿼리 인자·필터 행·표 딤·빈 상태)
- Test: `apps/web/test/admin/facility-submission/submission-batches-tab.test.tsx`

**Interfaces:**
- Produces: `SubmissionBatchListParams = { page; size; status?; q?: string; submittedFrom?: string; submittedTo?: string }` — API client·쿼리키는 객체를 그대로 전달하므로 추가 변경 없음. BE(PR-A A3) 계약: `q` 부분 일치, `submittedFrom/To` = `YYYY-MM-DD`. `useSubmissionBatchesQuery` 는 `placeholderData: keepPreviousData` 로 필터 전환 중 이전 목록을 유지한다.
- 결정: 훅 인자에는 빈 값을 `undefined` 로 넣는다(`''` → `undefined`). 이유: 기존 단언 `toHaveBeenCalledWith({ page: 0, size: 10, status: 'REVIEWING' })`(`:390`)·`toHaveBeenLastCalledWith({ page: 1, size: 10 })`(`:401`)·`:106` 은 vitest 의 `toHaveBeenCalledWith` 가 `undefined` 프로퍼티를 결측과 동일하게 보는 재귀 동등성이라 그대로 통과하고, 쿼리키에도 빈 문자열 대신 결측이 실려 첫 진입 캐시 키가 종전과 같다.
- Consumes: `useDeferredValue`(React 19), `keepPreviousData`(`@tanstack/react-query`, `packages/hooks/src/adminFees.ts:1` 전례), 딤 처리 `aria-busy` + `opacity-60`(`AdminFeesPage.tsx:159-161` 전례).

- [ ] **Step 1: 타입·훅 확장**

`packages/types/src/facilitySubmission.ts:81` 을 아래로 교체:

```ts
// 배치 목록 검색(감사 #15, BE PR-A A3) — q 는 제출번호·메모·동아리명 부분 일치, 생성일은 YYYY-MM-DD(KST 일 단위).
// 빈 값은 호출부가 undefined 로 넣고 API client 의 cleanParams 가 쿼리스트링에서 생략한다.
export type SubmissionBatchListParams = {
  page: number;
  size: number;
  status?: SubmissionBatchStatusFilter;
  q?: string;
  submittedFrom?: string;
  submittedTo?: string;
};
```

`packages/hooks/src/facilitySubmissionAdmin.ts:1` 을 `import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';` 로, `:48-54` 를 아래로:

```ts
export function useSubmissionBatchesQuery(params: SubmissionBatchListParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.facilitySubmissionBatches(params),
    queryFn: () => client.admin.facilitySubmission.list(params),
    // 검색·페이지 전환 중 표가 LoadingGate 로 사라지지 않게 이전 목록을 유지한다(회비 콘솔 전례, 감사 #15).
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 2: 실패 테스트 추가**

`submission-batches-tab.test.tsx` `describe` 끝에 추가(`waitFor`·`within` 은 이미 import):

```tsx
  it('검색어·생성일 필터를 입력하면 page 0 으로 q·submittedFrom·submittedTo 를 넘긴다', async () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()], 3));
    render(<SubmissionBatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(mockBatchesQuery).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));

    fireEvent.change(screen.getByRole('searchbox', { name: '제출 목록 검색' }), { target: { value: '8월' } });
    fireEvent.change(screen.getByLabelText('생성일 시작'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('생성일 종료'), { target: { value: '2026-08-31' } });

    // useDeferredValue 는 다음 렌더에서 따라온다 — waitFor 로 흡수.
    await waitFor(() => {
      expect(mockBatchesQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 0, q: '8월', submittedFrom: '2026-08-01', submittedTo: '2026-08-31' }),
      );
    });
  });

  it('필터가 걸린 빈 결과는 조건 안내와 초기화 버튼을 보여주고, 초기화하면 필터 키가 빠진다', async () => {
    mockBatchesQuery.mockReturnValue(listSuccess([]));
    render(<SubmissionBatchesTab />);
    fireEvent.change(screen.getByRole('searchbox', { name: '제출 목록 검색' }), { target: { value: '없는목록' } });

    expect(await screen.findByText('조건에 맞는 제출 목록이 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));

    expect(screen.getByRole('searchbox', { name: '제출 목록 검색' })).toHaveValue('');
    await waitFor(() => {
      const lastParams = mockBatchesQuery.mock.calls.at(-1)?.[0];
      expect(lastParams).toMatchObject({ page: 0, size: 10 });
      // 빈 값은 undefined 로 넘긴다 — cleanParams 가 생략하고 기존 캐시 키와 같아진다.
      expect(lastParams).toEqual(expect.not.objectContaining({ q: expect.any(String) }));
    });
    expect(screen.getByText('아직 만든 제출 목록이 없어요')).toBeInTheDocument();
  });

  it('필터 전환 중(placeholder)에는 이전 표를 딤 처리한 채 유지한다', () => {
    mockBatchesQuery.mockReturnValue({ ...listSuccess([makeBatch()]), isPlaceholderData: true });
    render(<SubmissionBatchesTab />);

    // keepPreviousData 로 표가 남고, aria-busy 딤으로 "갱신 전 데이터" 신호를 준다(회비 콘솔 #906 전례).
    expect(screen.getByRole('table').closest('[aria-busy="true"]')).not.toBeNull();
  });
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-batches-tab.test.tsx`
Expected: 새 테스트 3개 FAIL(`searchbox "제출 목록 검색"` 없음 2건, `[aria-busy="true"]` 없음 1건). 기존 `:92`·`:390`·`:401` 단언은 `undefined` 변환 덕에 이 단계에서도 PASS.

- [ ] **Step 4: 구현**

`SubmissionBatchesTab.tsx:3` 을 `import { useDeferredValue, useEffect, useState } from 'react';` 로.

`:58` `const [page, setPage] = useState(0);` 아래에 추가:

```tsx
  // 검색(감사 #15) — 제출번호·메모·동아리명 부분 일치 + 생성일 범위. 검색어는 useDeferredValue 로 타이핑 중
  // 요청을 늦추고(React 19 내장, 별도 디바운스 훅 불필요), 빈 값은 undefined 로 넘겨 쿼리키·쿼리스트링에서 뺀다.
  const [keyword, setKeyword] = useState('');
  const [submittedFrom, setSubmittedFrom] = useState('');
  const [submittedTo, setSubmittedTo] = useState('');
  const deferredKeyword = useDeferredValue(keyword);
  const hasFilter = keyword !== '' || submittedFrom !== '' || submittedTo !== '';
  const orUndefined = (value: string) => (value === '' ? undefined : value);
  const resetFilters = () => {
    setKeyword('');
    setSubmittedFrom('');
    setSubmittedTo('');
    setPage(0);
  };
```

`:62` 의 쿼리 호출을 아래로 교체:

```tsx
  const batchesQuery = useSubmissionBatchesQuery({
    page,
    size: PAGE_SIZE,
    status: statusFilter,
    q: orUndefined(deferredKeyword),
    submittedFrom: orUndefined(submittedFrom),
    submittedTo: orUndefined(submittedTo),
  });
```

`<ConsoleCard>` 바로 안(`:122` 다음, 로딩 게이트 앞)에 필터 행 추가:

```tsx
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-[18px] py-3">
        <input
          type="search"
          aria-label="제출 목록 검색"
          placeholder="제출번호·메모·동아리명"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(0);
          }}
          className="w-full max-w-xs rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal"
        />
        <input
          type="date"
          aria-label="생성일 시작"
          value={submittedFrom}
          onChange={(event) => {
            setSubmittedFrom(event.target.value);
            setPage(0);
          }}
          className="rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal"
        />
        <input
          type="date"
          aria-label="생성일 종료"
          value={submittedTo}
          onChange={(event) => {
            setSubmittedTo(event.target.value);
            setPage(0);
          }}
          className="rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal"
        />
        {hasFilter && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
            필터 초기화
          </button>
        )}
      </div>
```

빈 상태 `:134-145` 를 아래로 교체(필터 유무로 분기):

```tsx
      {!batchesQuery.isLoading && batchesQuery.isSuccess && batches.length === 0 && (
        hasFilter ? (
          <EmptyState
            icon="🔍"
            title="조건에 맞는 제출 목록이 없어요"
            body="검색어·생성일 범위를 넓혀보세요."
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters}>
                필터 초기화
              </button>
            }
          />
        ) : (
          <EmptyState
            icon="📄"
            title={statusFilter === 'REVIEWING' ? '진행 중인 제출 목록이 없어요' : '아직 만든 제출 목록이 없어요'}
            body="'제출 준비' 탭에서 승인된 예약을 골라 만들 수 있어요."
            action={
              <Link href={toRoute('/admin/facility-bookings?tab=prepare')} className="btn btn-secondary btn-sm">
                제출 준비로 이동
              </Link>
            }
          />
        )
      )}
```

표 래퍼 `:148` `<div className="overflow-x-auto">` 를 아래로(닫는 `</div>` 는 그대로):

```tsx
        {/* keepPreviousData 전환 중(검색·기간·페이지 변경)에는 이전 목록이 남는다 — 딤으로 "갱신 전 데이터" 신호(회비 콘솔 #906 전례). 필터 행은 딤 밖. */}
        <div
          aria-busy={batchesQuery.isPlaceholderData}
          className={`overflow-x-auto ${batchesQuery.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}`}
        >
```

- [ ] **Step 5: 통과 확인 (훅 변경 → web 전체 스위트)**

Run: `pnpm vitest run test/admin/facility-submission/submission-batches-tab.test.tsx && pnpm typecheck && pnpm lint && pnpm vitest run`
Expected: 전부 PASS(`Pagination` 의 다음 버튼 접근성 이름은 `'다음'`, `components/Pagination.tsx:63`). `keepPreviousData` 는 `useSubmissionBatchesQuery` 를 mock 하지 않는 다른 테스트(있다면 `admin-bookings-page.test.tsx` 의 `readyBatchCountQuery`)에도 영향이 없다 — 첫 조회는 placeholder 가 없다.

- [ ] **Step 6: 커밋**

```bash
git add packages/types/src/facilitySubmission.ts packages/hooks/src/facilitySubmissionAdmin.ts apps/web/app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx apps/web/test/admin/facility-submission/submission-batches-tab.test.tsx
git commit -m "feat(frontend): 제출 대기·이력 검색 — 제출번호·메모·동아리명·생성일 필터, 전환 중 이전 목록 유지(keepPreviousData)"
```

---

### Task 7: CSV 비활성을 해당 행에만 (C7, #16)

**Files:**
- Modify: `apps/web/app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx:239-251`
- Test: `apps/web/test/admin/facility-submission/submission-batches-tab.test.tsx:208-234`

**Interfaces:** `csvMutation.variables?.batchId`(TanStack `useMutation` 의 마지막 호출 변수).

- [ ] **Step 1: 테스트 갱신**

`:208-214` 테스트를 아래로 교체:

```tsx
  it('CSV 다운로드 진행 중이면 그 행의 CSV 만 비활성이고 다른 행은 클릭할 수 있다', () => {
    mockCsvMutation.mockReturnValue({
      mutateAsync: mockCsvMutateAsync,
      isPending: true,
      variables: { batchId: 2 },
    });
    mockBatchesQuery.mockReturnValue(
      listSuccess([
        makeBatch({ batchId: 1, submissionNo: 'SUB-OTHER' }),
        makeBatch({ batchId: 2, submissionNo: 'SUB-DOWNLOADING' }),
      ]),
    );
    render(<SubmissionBatchesTab />);

    // 뮤테이션 하나를 표 전체가 공유하지만 다른 배치의 CSV 까지 막을 이유는 없다(감사 #16).
    expect(within(rowOf('SUB-DOWNLOADING')).getByRole('button', { name: /CSV/ })).toBeDisabled();
    expect(within(rowOf('SUB-OTHER')).getByRole('button', { name: /CSV/ })).toBeEnabled();
  });
```

`:216-234`(스피너 테스트)는 그대로 둔다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-batches-tab.test.tsx`
Expected: FAIL — `SUB-OTHER` 행 CSV 가 `disabled`.

- [ ] **Step 3: 구현**

`SubmissionBatchesTab.tsx:239-251` 의 CSV 버튼을 아래로 교체:

```tsx
                        {/* 같은 batchId 중복 발사·CSV_DOWNLOADED 중복 기록만 막으면 되므로 비활성·스피너 모두 해당 행에만(감사 #16). */}
                        {(() => {
                          const downloadingThisRow =
                            csvMutation.isPending && csvMutation.variables?.batchId === batch.batchId;
                          return (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={downloadingThisRow}
                              onClick={() => void handleDownloadCsv(batch)}
                            >
                              {downloadingThisRow && <ButtonSpinner />}
                              CSV
                            </button>
                          );
                        })()}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-batches-tab.test.tsx && pnpm typecheck && pnpm lint`
Expected: 전부 PASS(스피너 테스트 포함).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx apps/web/test/admin/facility-submission/submission-batches-tab.test.tsx
git commit -m "fix(frontend): 제출 목록 CSV — 내려받는 행만 비활성, 다른 배치는 바로 받을 수 있게"
```

---

## PR

브랜치 `fix/facility-submission-batches-ux` → `develop`. 제목 `fix(frontend): 제출 대기·이력·상세·콕핏 — 검색·상태별 뒤로가기·콕핏 완료 처리 등 동선 결함 7건`. 본문은 🚀/🤔/💬 형식, PR-A 머지 후 생성(자동 머지 금지). 🤔 에 "완료·CSV 핸들러를 상세·콕핏 공유 훅으로 승격, 목록 탭은 행 단위라 제외"와 "검색 빈 값은 undefined 로 넘겨 기존 캐시 키 유지"를 적는다.

## Self-Review

- 스펙 커버리지: C1→T1, C2→T2, C3→T3.5+T4, C4→T3, C5→T5, C6→T6, C7→T7. 스펙 C6 의 "빈 결과 문구 + 초기화" 포함. 누락 없음.
- 플레이스홀더: 없음. 모든 코드 스텝이 실제 코드.
- 타입 정합: `detailSuccess(bookings, batchOverrides)`(T3 정의 → T4 사용), `useSubmissionBatchActions` 반환 키(T3.5 정의 → T3.5 상세·T4 콕핏 사용: `completeOpen/setCompleteOpen/completeResult/setCompleteResult/confirmComplete/downloadCsv/isCompleting/isDownloading`), `ARCHIVE_ROUTE`(T2 상세 / T4 콕핏은 각 파일 로컬 상수), `SubmissionBatchListParams.q/submittedFrom/submittedTo`(T6 정의 → 같은 Task 사용). `useDeferredValue` 는 `react`, `keepPreviousData` 는 `@tanstack/react-query` 에서 import.

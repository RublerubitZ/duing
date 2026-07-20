# 학교 제출(Submission Batch) PR-4a 프론트 구현 계획 — 단일 페이지 통합 + 준비 탭 개편

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/facility-bookings` 단일 페이지(탭 3종: 예약 관리 | 학교 제출 준비 | 제출 목록)로 통합하고, 준비 탭을 자동 큐 UX(전 시설 시설별 섹션·기본 전체 선택·제외 모델·"학교 제출하기")로 개편한다.

**Architecture:** 도메인·API 무변경 — UI 재배치. 탭 상태는 `useSearchParams`+`router.replace`(URL 동기화, Suspense 경계). 예약 관리 탭 = 기존 화면 무손실 이식. 준비 탭 = candidates 를 facilityId 생략으로 호출(전 시설, PR-3 #685)해 시설별 섹션으로 렌더, 선택은 **제외(excluded) 집합의 여집합**으로 파생(기본 전체 선택·신규 유입 자동 선택). 기존 submission 컴포넌트(그룹 목록·시간표·Sheet) 재사용.

**Tech Stack:** Next.js 15 App Router / TanStack Query / vitest + testing-library(훅 모듈 모킹 + next/navigation 모킹).

**스펙:** `docs/superpowers/specs/2026-07-19-facility-submission-batch-design.md` **§7 v3** — §7.0/§7.1/§7.2 가 이 PR 범위(§7.3 은 PR-4b)

## Global Constraints

- 커밋: Conventional Commits 한국어(`feat(frontend): ...`), Co-Authored-By/🤖 라인 금지. **push·PR 생성 금지**
- `any`·`as` 금지(기존 관용 예외: `as const` 튜플), `type` 전용, TanStack Query 내부 모킹 금지 — 훅 모듈 모킹 관례
- **기존 submission 컴포넌트(SubmissionClubGroupList·SubmissionTimetable·SubmissionDetailSheet·SubmissionSummaryCards)와 `_lib` 은 무수정 재사용이 기본** — 수정이 불가피하면 최소 diff 로 하고 사유를 리포트에 명시
- 예약 관리 탭 이식은 **기능 변경 0** — 파일 이동·컴포넌트명·헤더 배치만
- `useSearchParams` 는 Suspense 경계 필수(`faq/page.tsx` 전례 — fallback 컴포넌트 import 경로까지 그 파일에서 확인), 탭 전환은 `router.replace(..., { scroll: false })`(`ClubExplorePage.tsx` 전례 — 경로 헬퍼(toRoute 등) 사용 여부도 그 파일 관례를 따름)
- 선택 모델(v3): `선택 = 화면의 selectable − excluded`. excluded 는 세션 내 클라 상태(비영속). 재조회 유입분 자동 선택. 영속 제외 플래그 금지(YAGNI)
- v3 문구(스펙 §7.2 그대로): 섹션 버튼 `학교 제출하기 (N건)`, Dialog 제목 `{시설명} 예약 N건을 학교에 제출할까요?`, 본문 "선택한 예약으로 제출 목록을 만들어요. 학교 행정실 제출은 담당자가 진행하고, 제출을 마치면 '제출 목록' 탭에서 완료 처리해 주세요.", 확인 버튼 `학교 제출하기`, 토스트 "제출 목록이 만들어졌어요. 학교 제출 후 '제출 목록' 탭에서 완료 처리해 주세요."
- 테스트 위치: 기존 `apps/web/test/admin/facility-bookings/`·`facility-submission/` 파일을 개조(파일명 변경 시 git mv), 상대 날짜만
- 검증은 `frontend/` cwd(`| tail` 금지)

**브랜치:** `feat/facility-submission-unified-fe` (develop 148fa982 분기, 스펙 §7 v3 커밋 포함)

---

### Task 1: 탭 셸 + URL 동기화 + 예약 관리 탭 이식 + 구경로 리다이렉트 + 메뉴 정리

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx` (탭 셸로 전면 교체)
- Create: `frontend/apps/web/app/admin/facility-bookings/_tabs/BookingManagementTab.tsx` (기존 페이지 내용 이식)
- Modify: `frontend/apps/web/app/admin/facility-bookings/page.tsx` (Suspense 래핑)
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/page.tsx` (redirect 로 교체)
- Modify: `frontend/apps/web/app/admin/_lib/adminSections.ts` ("학교 제출" 항목 제거 + "시설 예약 관리" 설명 갱신)
- Test: `frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx` (탭 셸 기준 개조)

**Interfaces:**
- Produces: `AdminFacilityBookingsPage`(탭 셸 — pending/prepare/batches), `BookingManagementTab`(기존 화면 전체). **Task 1 시점의 prepare 탭은 기존 `AdminSubmissionPage` 를 임시 렌더**(기능 연속성 — Task 3 이 `SubmissionPrepareTab` 으로 교체하고 구 페이지를 삭제한다). batches 탭은 "준비 중" placeholder.

- [ ] **Step 1: 실패하는 테스트 개조**

기존 `admin-bookings-page.test.tsx` 를 다음 방향으로 개조(기존 관리 화면 단언은 유지하되 렌더 대상·모킹 갱신):

1. 파일 상단에 next/navigation 모킹 추가(기존 훅 모킹과 병행):

```tsx
const mockReplace = vi.fn();
let mockTabParam: string | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockTabParam === null ? '' : `tab=${mockTabParam}`),
}));
```

2. `vi.mock('@duing/hooks', ...)` 팩토리에 prepare 탭(임시 AdminSubmissionPage)이 쓰는 훅 추가: `useSubmissionCandidatesQuery`·`useCreateSubmissionBatchMutation`(기존 facility-submission 테스트의 mock 반환값 스타일 복제). toast Provider 도 모킹(`vi.mock('../../../app/_components/toast/ToastProvider', ...)`).
3. `beforeEach` 에 `mockTabParam = null; mockReplace.mockReset();` 추가.
4. 신규 테스트 3건:

```tsx
  it('업무 단계 탭 3개가 렌더되고 기본은 예약 관리다', () => {
    render(<AdminFacilityBookingsPage />);

    expect(screen.getByRole('tab', { name: '예약 관리' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '학교 제출 준비' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '제출 목록' })).toBeInTheDocument();
    // 기본 탭 = 기존 관리 화면(요약 카드 렌더)
    expect(screen.getByText('승인 대기')).toBeInTheDocument();
  });

  it('탭 클릭은 URL 을 replace 로 동기화한다', () => {
    render(<AdminFacilityBookingsPage />);

    fireEvent.click(screen.getByRole('tab', { name: '학교 제출 준비' }));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('/admin/facility-bookings?tab=prepare'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('tab=batches 로 진입하면 제출 목록 준비 중 안내가 보인다', () => {
    mockTabParam = 'batches';
    render(<AdminFacilityBookingsPage />);

    expect(screen.getByText(/준비 중/)).toBeInTheDocument();
    expect(screen.queryByText('승인 대기')).not.toBeInTheDocument();
  });
```

5. 기존 관리 화면 단언 테스트들은 그대로 두되, 렌더가 기본 탭(pending)에서 이뤄지므로 통과해야 한다 — 깨지는 단언이 있으면 셀렉터만 조정(검증 의도 보존).

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- admin-bookings-page`
Expected: FAIL (탭 셸 미존재)

- [ ] **Step 3: 구현**

**`_tabs/BookingManagementTab.tsx`** — 기존 `AdminFacilityBookingsPage.tsx` 의 **본문 전체를 그대로 이동**하되:
- 컴포넌트명 `BookingManagementTab` 으로 변경, 페이지 헤더(`<h1>시설 예약 관리</h1>` + 부제 `<p>`) 블록은 **제거**(셸이 소유)
- import 상대 경로만 조정(`../_components/...` 등). 로직·상태·JSX 그 외 무변경(기능 변경 0 계약)

**`_pages/AdminFacilityBookingsPage.tsx`** — 탭 셸로 전면 교체:

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { AdminSubmissionPage } from '../submission/_pages/AdminSubmissionPage';
import { BookingManagementTab } from '../_tabs/BookingManagementTab';

const TAB_KEYS = ['pending', 'prepare', 'batches'] as const;
type FacilityOpsTab = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<FacilityOpsTab, string> = {
  pending: '예약 관리',
  prepare: '학교 제출 준비',
  batches: '제출 목록',
};

function isFacilityOpsTab(value: string | null): value is FacilityOpsTab {
  return value !== null && (TAB_KEYS as readonly string[]).includes(value);
}

/**
 * 시설 예약 업무 단일 페이지(스펙 v3 §7.0) — 승인부터 학교 제출까지 한 화면에서 끝난다.
 * 탭 상태는 URL(?tab=)과 동기화해 새로고침·뒤로가기·딥링크를 보존한다(ClubExplorePage 전례).
 */
export function AdminFacilityBookingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: FacilityOpsTab = isFacilityOpsTab(tabParam) ? tabParam : 'pending';

  const selectTab = (tab: FacilityOpsTab) => {
    router.replace(`/admin/facility-bookings?tab=${tab}`, { scroll: false });
  };

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-xl text-ink-deep">시설 예약 관리</h1>
        <p className="mt-1 text-sm text-charcoal-3">예약 승인부터 학교 제출까지 한 화면에서 처리해요.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="시설 예약 업무 단계">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => selectTab(tab)}
            className={`rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors ${
              activeTab === tab ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'pending' && <BookingManagementTab />}
      {/* Task 3 에서 SubmissionPrepareTab 으로 교체 — 그때까지 기존 화면으로 기능 연속 */}
      {activeTab === 'prepare' && <AdminSubmissionPage />}
      {activeTab === 'batches' && (
        <p className="text-sm text-charcoal-3">제출 목록은 준비 중이에요. 만든 제출 목록을 곧 이 탭에서 관리할 수 있어요.</p>
      )}
    </section>
  );
}
```

(주의: `router.replace` 경로 인자에 헬퍼(toRoute 등)를 쓰는 것이 `ClubExplorePage.tsx` 관례라면 그 형태를 따른다 — 실파일 확인.)

**`page.tsx`** — `faq/page.tsx` 를 열어 Suspense 경계 패턴(fallback 컴포넌트·import 경로·주석 취지)을 그대로 복제해 `AdminFacilityBookingsPage` 를 감싼다.

**`submission/page.tsx`** — 교체:

```tsx
import { redirect } from 'next/navigation';

// v3 단일 페이지 통합(스펙 §7.0) — 구경로는 준비 탭으로 보낸다. Batch 상세(PR-4b)는 하위 경로로 유지 예정.
export default function Page() {
  redirect('/admin/facility-bookings?tab=prepare');
}
```

**`adminSections.ts`** — "학교 제출" 항목(href `/admin/facility-bookings/submission`) 삭제, "시설 예약 관리" 항목 description 을 `대관 신청 승인·학교 제출 준비·제출 목록 관리` 로 갱신.

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- admin-bookings-page && pnpm --filter @duing/web test -- admin-submission-page && pnpm typecheck`
Expected: 전부 GREEN — 기존 submission 페이지 테스트(AdminSubmissionPage 직접 렌더)는 아직 유효(Task 3 에서 개조)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin frontend/apps/web/test/admin
git commit -m "feat(frontend): 시설 예약 단일 페이지 탭 셸 — 예약 관리 이식·구경로 리다이렉트"
```

---

### Task 2: 시설 섹션·제외 선택 모델 순수 lib + 유닛 테스트

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_lib/submissionSections.ts`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-sections.test.ts`

**Interfaces:**
- Consumes: `SubmissionCandidateBooking`(facilityId/facilityName 포함 — PR-3 타입 확장분)
- Produces(Task 3 소비):
  - `buildFacilitySections(bookings) → FacilitySection[]` — `{ facilityId, facilityName(null 이면 "시설 {id}" 폴백 라벨로 정렬·표시), bookings }`, 시설명 오름차순(ko)
  - `deriveSelectedIds(bookings, excludedIds) → number[]` — 화면의 selectable 중 excluded 에 없는 id(v3 선택 모델의 단일 파생 지점)

- [ ] **Step 1: 실패하는 유닛 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import {
  buildFacilitySections,
  deriveSelectedIds,
} from '../../../app/admin/facility-bookings/submission/_lib/submissionSections';

function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    facilityId: 100,
    facilityName: '강당',
    clubId: 10,
    clubName: '밴드부',
    applicantName: '홍길동',
    contactPhone: '010-1234-5678',
    reservationDate: '2026-08-01',
    startTime: '18:00',
    endTime: '21:00',
    purpose: '정기 합주',
    attendeeCount: 30,
    status: 'APPROVED',
    submitted: false,
    selectable: true,
    submissionNo: null,
    decidedByName: '관리자',
    decidedAt: '2026-07-20T10:00:00',
    ...overrides,
  };
}

describe('buildFacilitySections', () => {
  it('시설별로 묶고 시설명 오름차순으로 정렬한다', () => {
    const sections = buildFacilitySections([
      makeBooking({ bookingId: 1, facilityId: 200, facilityName: '세미나실' }),
      makeBooking({ bookingId: 2, facilityId: 100, facilityName: '강당' }),
      makeBooking({ bookingId: 3, facilityId: 200, facilityName: '세미나실' }),
    ]);

    expect(sections.map((section) => section.facilityName)).toEqual(['강당', '세미나실']);
    expect(sections[1]!.bookings).toHaveLength(2);
  });

  it('시설명이 없으면 폴백 라벨로 표시하고 맨 뒤로 정렬한다', () => {
    const sections = buildFacilitySections([
      makeBooking({ bookingId: 1, facilityId: 300, facilityName: null }),
      makeBooking({ bookingId: 2, facilityId: 100, facilityName: '강당' }),
    ]);

    expect(sections.map((section) => section.facilityName)).toEqual(['강당', '시설 300']);
  });

  it('빈 입력은 빈 섹션 배열을 낸다', () => {
    expect(buildFacilitySections([])).toEqual([]);
  });
});

describe('deriveSelectedIds', () => {
  const bookings = [
    makeBooking({ bookingId: 1 }),
    makeBooking({ bookingId: 2 }),
    makeBooking({ bookingId: 3, status: 'PENDING', selectable: false }),
  ];

  it('제출 필요 예약은 기본 전체 선택이다(제외 없음)', () => {
    expect(deriveSelectedIds(bookings, new Set())).toEqual([1, 2]);
  });

  it('제외한 예약만 선택에서 빠지고, 선택 불가 예약은 애초에 포함되지 않는다', () => {
    expect(deriveSelectedIds(bookings, new Set([2, 3]))).toEqual([1]);
  });

  it('재조회로 유입된 신규 예약은 자동으로 선택에 포함된다', () => {
    const withNewBooking = [...bookings, makeBooking({ bookingId: 9 })];
    expect(deriveSelectedIds(withNewBooking, new Set([2]))).toEqual([1, 9]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-sections`
Expected: FAIL

- [ ] **Step 3: 구현**

```ts
import type { SubmissionCandidateBooking } from '@duing/types';

export type FacilitySection = {
  facilityId: number;
  /** 조회 결측 시 "시설 {id}" 폴백 — 라벨·정렬 모두 이 값을 쓴다(검색 폴백과 동일 원칙). */
  facilityName: string;
  bookings: SubmissionCandidateBooking[];
};

/** 시설별 섹션(스펙 v3 §7.2) — 준비 탭의 기본 골격. 시설명 오름차순(ko), 결측 라벨은 맨 뒤. */
export function buildFacilitySections(bookings: SubmissionCandidateBooking[]): FacilitySection[] {
  const byFacility = new Map<number, SubmissionCandidateBooking[]>();
  for (const booking of bookings) {
    const facilityBookings = byFacility.get(booking.facilityId) ?? [];
    facilityBookings.push(booking);
    byFacility.set(booking.facilityId, facilityBookings);
  }
  return [...byFacility.entries()]
    .map(([facilityId, facilityBookings]) => ({
      facilityId,
      facilityName: facilityBookings[0]?.facilityName ?? `시설 ${facilityId}`,
      bookings: facilityBookings,
    }))
    .sort((left, right) => {
      // TODO: 시설 표시 순서(displayOrder)가 도입되면 displayOrder → facilityName 순으로 확장한다.
      const leftMissing = left.facilityName.startsWith('시설 ');
      const rightMissing = right.facilityName.startsWith('시설 ');
      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
      return left.facilityName.localeCompare(right.facilityName, 'ko');
    });
}

/**
 * v3 선택 모델의 단일 파생 지점 — 선택 = 화면의 selectable − excluded.
 * 기본 전체 선택·재조회 유입분 자동 선택이 이 파생에서 자연히 성립한다(제외만 상태로 남는다).
 */
export function deriveSelectedIds(
  bookings: SubmissionCandidateBooking[],
  excludedIds: ReadonlySet<number>,
): number[] {
  return bookings
    .filter((booking) => booking.selectable && !excludedIds.has(booking.bookingId))
    .map((booking) => booking.bookingId);
}
```

(참고: 폴백 라벨 `시설 {id}` 가 실시설명과 충돌할 이론 가능성은 무시 — 시설명은 학교 크롤 데이터라 "시설 300" 형태가 아니며, 정렬 힌트일 뿐이다.)

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-sections`
Expected: PASS (6/6)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 시설 섹션·제외 선택 모델 파생 로직 구현"
```

---

### Task 3: SubmissionPrepareTab 조립 (준비 탭 개편 + 구 페이지 대체)

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx`
- Modify: `frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx` (prepare 탭을 SubmissionPrepareTab 으로 교체)
- Delete: `frontend/apps/web/app/admin/facility-bookings/submission/_pages/AdminSubmissionPage.tsx` (git rm — 이식 완료 후)
- Test: `frontend/apps/web/test/admin/facility-submission/admin-submission-page.test.tsx` → `submission-prepare-tab.test.tsx` (git mv 후 개조)

**Interfaces:**
- Consumes: Task 2 `buildFacilitySections`/`deriveSelectedIds`, 기존 `SubmissionSummaryCards`(SummaryFilter)·`SubmissionClubGroupList`·`SubmissionTimetable`·`SubmissionDetailSheet`(무수정), `useSubmissionCandidatesQuery`(facilityId 생략 파라미터)
- Produces(Task 4 소비): `SubmissionPrepareTab` 내부의 `dialogSection`/`handleSubmitConfirm` 자리(주석) — Task 4 가 Dialog 를 잇는다
- 선택 어댑터 계약: 재사용 컴포넌트는 "selection+onToggleSelect/onToggleMany" 를 말하므로, **excluded 상태를 반전 어댑터로 연결** — `onToggleSelect(id)` = excluded 토글, `onToggleMany(ids, nextSelected)` = nextSelected ? excluded 에서 제거 : 전부 추가. selection prop = `new Set(deriveSelectedIds(...))`

- [ ] **Step 1: 실패하는 테스트 개조**

`git mv` 후 파일을 다음 기준으로 개조(기존 카드·필터·검색·기간 가드 테스트의 검증 의도는 유지하며 셀렉터·전제만 갱신):

1. 렌더 대상: `SubmissionPrepareTab` (`../../../app/admin/facility-bookings/_tabs/SubmissionPrepareTab`). 시설 select·게이트 관련 테스트 **삭제**(v3 에서 게이트 제거), `useFacilityUsageQuery` 모킹 제거.
2. 픽스처 `makeResponse()` 를 두 시설로: 밴드부(bookingId 1·facilityId 100·facilityName '강당'·APPROVED selectable), 방송국(bookingId 2·facilityId 200·facilityName '세미나실'·CONFIRMED submitted — 기존 값 + facility 필드 2개).
3. 신규·개조 테스트:

```tsx
  it('진입 즉시 시설 없이 전 시설 후보를 조회한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    const lastParams = mockCandidatesQuery.mock.calls.at(-1)?.[0] as { startDate: string; facilityId?: number };
    expect(lastParams.facilityId).toBeUndefined();
    expect(lastParams.startDate.endsWith('-01')).toBe(true);
  });

  it('시설별 섹션이 렌더되고 헤더에 제출할 예약 수가 보인다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    expect(screen.getByText('강당')).toBeInTheDocument();
    expect(screen.getByText('세미나실')).toBeInTheDocument();
    expect(screen.getByText(/학교에 제출할 예약 1건/)).toBeInTheDocument();
  });

  it('제출 필요 예약은 기본 전체 선택이고, 체크 해제는 제외로 동작한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    const rowCheckbox = screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ });
    expect(rowCheckbox).toBeChecked();
    expect(screen.getByRole('button', { name: /학교 제출하기 \(1건\)/ })).toBeEnabled();

    fireEvent.click(rowCheckbox);
    expect(rowCheckbox).not.toBeChecked();
    expect(screen.getByRole('button', { name: /학교 제출하기 \(0건\)/ })).toBeDisabled();
  });

  it('검색으로 화면에서 사라진 예약의 제외 상태는 정리된다 — 검색 해제 시 기본 선택으로 복귀', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    // 제외 → 검색으로 해당 예약을 숨김 → 검색 해제 → 제외가 정리되어 다시 기본 선택
    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ }));
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '방송' } });
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '' } });

    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).toBeChecked();
  });
```

4. 유지 개조: 카드 4장 v2.2 라벨(전 시설 합산 값), 카드↔셀렉트 필터 연동, 동아리 검색(밴드부/방송국 구분 — 그룹 롤 셀렉터), 기간 31일·빈 값 가드(`role="alert"` + `mockCandidatesQuery` 마지막 호출 null), 시간표 토글(섹션 안에 시간표 렌더 — `getByRole('columnheader', { name: '09' })` 존재 정도로 단언).

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-prepare-tab`
Expected: FAIL

- [ ] **Step 3: 구현**

`SubmissionPrepareTab.tsx` — 기존 `AdminSubmissionPage` 를 기반으로 개조(카드·검색·기간·제출 상태 필터·뷰 토글·Sheet 는 그대로 가져오되 아래가 다르다):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSubmissionCandidatesQuery } from '@duing/hooks';
import type { SubmissionCandidateBooking, SubmissionCandidatesParams } from '@duing/types';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { SubmissionClubGroupList } from '../submission/_components/SubmissionClubGroupList';
import { SubmissionDetailSheet } from '../submission/_components/SubmissionDetailSheet';
import { SubmissionSummaryCards, type SummaryFilter } from '../submission/_components/SubmissionSummaryCards';
import { SubmissionTimetable } from '../submission/_components/SubmissionTimetable';
import { buildFacilitySections, deriveSelectedIds } from '../submission/_lib/submissionSections';

const MAX_PERIOD_DAYS = 31;

type ViewMode = 'list' | 'timetable';
type SubmissionStatusFilter = 'ALL' | 'NEED' | 'SUBMITTED';

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function currentMonthRange(): { startDate: string; endDate: string } {
  const today = new Date();
  return {
    startDate: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: toIso(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

function periodDayCount(startDate: string, endDate: string): number {
  const diffMs = new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime();
  return Math.round(diffMs / 86_400_000) + 1;
}

function matchesFilter(booking: SubmissionCandidateBooking, filter: SummaryFilter): boolean {
  if (filter === 'APPROVED') return booking.status === 'APPROVED';
  if (filter === 'NEED') return booking.selectable;
  if (filter === 'SUBMITTED') return booking.submitted;
  if (filter === 'CONFIRMED') return booking.status === 'CONFIRMED';
  return true;
}

/**
 * 학교 제출 준비 탭(스펙 v3 §7.2) — 승인된 예약이 자동 유입되는 준비 큐.
 * 전 시설을 시설별 섹션으로 표시하고, 제출 필요 예약은 기본 전체 선택(선택 = selectable − excluded 파생).
 * 운영자는 제외만 하고 시설 단위 "학교 제출하기"를 수행한다.
 */
export function SubmissionPrepareTab() {
  const defaultRange = currentMonthRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [clubKeyword, setClubKeyword] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('ALL');
  // v3 선택 모델 — 제외 집합만 상태로 두고 선택은 파생한다(기본 전체 선택·신규 유입 자동 선택).
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<number>>(new Set());
  const [detailBooking, setDetailBooking] = useState<SubmissionCandidateBooking | null>(null);

  const { addToast } = useToast();
  const periodDays = periodDayCount(startDate, endDate);
  const periodInvalid = !(periodDays >= 1 && periodDays <= MAX_PERIOD_DAYS);
  const candidatesParams: SubmissionCandidatesParams | null =
    periodInvalid ? null : { startDate, endDate };
  const candidatesQuery = useSubmissionCandidatesQuery(candidatesParams);

  const allBookings = candidatesQuery.data?.bookings ?? [];
  const keyword = clubKeyword.trim();
  const searchedBookings =
    keyword === ''
      ? allBookings
      : allBookings.filter((booking) => (booking.clubName ?? `동아리 ${booking.clubId}`).includes(keyword));
  const visibleBookings = searchedBookings.filter((booking) => matchesFilter(booking, summaryFilter));
  const sections = buildFacilitySections(visibleBookings);
  const selectedIdSet = new Set(deriveSelectedIds(visibleBookings, excludedIds));

  const statusFilterValue: SubmissionStatusFilter =
    summaryFilter === 'NEED' || summaryFilter === 'SUBMITTED' ? summaryFilter : 'ALL';

  // 화면에서 사라진 예약(기간·검색·필터 변경, 재조회)은 excluded 에서도 정리한다 — 세션 상태 누적 방지.
  // (레포의 useEffect 금지는 데이터 패칭 한정 — 페이지 클램프 전례와 같은 상태 정리 용도)
  const visibleSelectableKey = visibleBookings
    .filter((booking) => booking.selectable)
    .map((booking) => booking.bookingId)
    .sort((left, right) => left - right)
    .join(',');
  useEffect(() => {
    setExcludedIds((previous) => {
      const visibleIds = new Set(
        visibleSelectableKey === '' ? [] : visibleSelectableKey.split(',').map(Number),
      );
      const next = new Set([...previous].filter((bookingId) => visibleIds.has(bookingId)));
      return next.size === previous.size ? previous : next;
    });
  }, [visibleSelectableKey]);

  // 재사용 컴포넌트의 선택 콜백을 제외 모델로 반전 연결한다.
  const toggleSelect = (bookingId: number) =>
    setExcludedIds((previous) => {
      const next = new Set(previous);
      if (next.has(bookingId)) next.delete(bookingId);
      else next.add(bookingId);
      return next;
    });
  const toggleMany = (bookingIds: number[], nextSelected: boolean) =>
    setExcludedIds((previous) => {
      const next = new Set(previous);
      for (const bookingId of bookingIds) {
        if (nextSelected) next.delete(bookingId);
        else next.add(bookingId);
      }
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date" aria-label="시작일" value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
        />
        <input
          type="date" aria-label="종료일" value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
        />
        <input
          type="search" aria-label="동아리 검색" value={clubKeyword} placeholder="동아리 검색"
          onChange={(event) => setClubKeyword(event.target.value)}
          className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
        />
        <select
          aria-label="제출 상태"
          className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
          value={statusFilterValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            setSummaryFilter(nextValue === 'NEED' || nextValue === 'SUBMITTED' ? nextValue : 'ALL');
          }}
        >
          <option value="ALL">전체</option>
          <option value="NEED">학교에 제출할 예약</option>
          <option value="SUBMITTED">제출 목록에 담긴 예약</option>
        </select>
        <div className="ml-auto flex items-center gap-2" role="tablist" aria-label="보기 전환">
          {([['list', '목록'], ['timetable', '시간표']] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              onClick={() => setView(mode)}
              className={`rounded-md border px-2.5 py-1.5 text-xs motion-safe:transition-colors ${
                view === mode ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {periodInvalid && (
        <div role="alert" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal-2">
          조회 기간을 확인해주세요 — 종료일이 시작일보다 앞설 수 없고, 시작일부터 최대 31일까지 조회할 수 있어요.
        </div>
      )}

      {candidatesParams !== null && (
        <>
          {candidatesQuery.data && (
            <SubmissionSummaryCards
              counts={candidatesQuery.data.summary}
              activeFilter={summaryFilter}
              onSelectFilter={setSummaryFilter}
            />
          )}

          {candidatesQuery.isLoading && <LoadingGate className="min-h-0 py-8" label="예약 목록 불러오는 중" />}
          {!candidatesQuery.isLoading && candidatesQuery.isError && (
            <div role="alert" className="text-sm text-charcoal-2">
              <p>예약 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
              <button type="button" className="btn btn-ghost mt-2" onClick={() => void candidatesQuery.refetch()}>
                다시 시도
              </button>
            </div>
          )}
          {!candidatesQuery.isLoading && candidatesQuery.isSuccess && visibleBookings.length === 0 && (
            <p className="text-sm text-charcoal-3">
              {summaryFilter !== 'ALL' || keyword !== ''
                ? '조건에 맞는 예약이 없어요. 검색어나 필터를 바꿔보세요.'
                : '현재 학교에 제출할 예약이 없어요.'}
            </p>
          )}
          {!candidatesQuery.isLoading && candidatesQuery.isSuccess && sections.length > 0 && (
            <ul className="space-y-6">
              {sections.map((section) => {
                const sectionSelectedCount = deriveSelectedIds(section.bookings, excludedIds).length;
                const sectionNeedCount = section.bookings.filter((booking) => booking.selectable).length;
                return (
                  <li key={section.facilityId} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="font-medium text-ink-deep">{section.facilityName}</h2>
                        <p className="text-xs text-charcoal-3">학교에 제출할 예약 {sectionNeedCount}건</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={sectionSelectedCount === 0}
                        onClick={() => {/* Task 4: 학교 제출 Dialog 연결 */}}
                      >
                        학교 제출하기 ({sectionSelectedCount}건)
                      </button>
                    </div>
                    {view === 'list' ? (
                      <SubmissionClubGroupList
                        bookings={section.bookings}
                        selection={selectedIdSet}
                        onToggleSelect={toggleSelect}
                        onToggleMany={toggleMany}
                        onShowDetail={setDetailBooking}
                      />
                    ) : (
                      <SubmissionTimetable
                        bookings={section.bookings}
                        facilityName={section.facilityName}
                        selection={selectedIdSet}
                        onToggleSelect={toggleSelect}
                        onShowDetail={setDetailBooking}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <SubmissionDetailSheet booking={detailBooking} facilityName={detailBooking?.facilityName ?? ''} onClose={() => setDetailBooking(null)} />
      {/* Task 4: SubmitToSchoolDialog(BatchCreateDialog v3 개조)를 dialogSection 상태와 함께 연결한다. */}
    </div>
  );
}
```

(주의: **Task 3 은 조회·렌더·선택 UI 까지만** — `useCreateSubmissionBatchMutation` 은 여기서 생성하지 않는다(제출 플로우는 Task 4 책임). `useToast` 도 Task 4 에서 필요해지면 그때 추가. `SubmissionDetailSheet` 의 facilityName 은 booking 자체의 facilityName 사용 — 전 시설 컨텍스트.)

셸(`AdminFacilityBookingsPage.tsx`)의 prepare 분기를 `<SubmissionPrepareTab />` 로 교체하고 `AdminSubmissionPage` import 제거 → `git rm frontend/apps/web/app/admin/facility-bookings/submission/_pages/AdminSubmissionPage.tsx`. Task 1 셸 테스트의 `@duing/hooks` 모킹은 그대로 유효해야 한다(같은 훅 사용).

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-prepare-tab && pnpm --filter @duing/web test -- admin-bookings-page && pnpm typecheck`
Expected: 전부 GREEN

- [ ] **Step 5: 커밋**

```bash
git add -A frontend/apps/web/app/admin frontend/apps/web/test/admin
git commit -m "feat(frontend): 학교 제출 준비 탭 개편 — 시설별 섹션·기본 전체 선택·제외 모델"
```

---

### Task 4: 학교 제출 Dialog(v3) + 생성 플로우 연결

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/_components/BatchCreateDialog.tsx` (v3 문구·facilityName prop 개조)
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx` (Dialog·플로우 연결)
- Test: `frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx` (플로우 테스트 추가)

**Interfaces:**
- Produces: `BatchCreateDialog({ open, facilityName, selectedCount, isPending, onClose, onConfirm(memo) })` — 제목 `` `${facilityName} 예약 ${selectedCount}건을 학교에 제출할까요?` ``, 본문·버튼은 Global Constraints 의 v3 문구

- [ ] **Step 1: 실패하는 플로우 테스트 추가**

```tsx
  it('학교 제출하기 확인까지 진행하면 그 시설의 선택 예약으로 제출 목록이 만들어진다', async () => {
    const createMutateAsync = vi.fn().mockResolvedValue({
      batchId: 7, submissionNo: 'SUB-20260801-002', csvFileName: 'facility-submission-SUB-20260801-002.csv',
    });
    mockCreateMutation.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false });
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.click(screen.getByRole('button', { name: /학교 제출하기 \(1건\)/ }));
    expect(screen.getByText(/강당 예약 1건을 학교에 제출할까요/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '8월 1차' } });
    fireEvent.click(screen.getByRole('button', { name: '학교 제출하기' }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({ bookingIds: [1], memo: '8월 1차' });
      expect(mockAddToast).toHaveBeenCalledWith(
        "제출 목록이 만들어졌어요. 학교 제출 후 '제출 목록' 탭에서 완료 처리해 주세요.",
      );
    });
    expect(mockAddToast).toHaveBeenCalledTimes(1);
  });

  it('생성 실패 시 서버 메시지 에러 토스트를 띄운다', async () => {
    const createMutateAsync = vi.fn().mockRejectedValue(new Error('이미 제출된 예약이 포함되어 있습니다.'));
    mockCreateMutation.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false });
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);
    fireEvent.click(screen.getByRole('button', { name: /학교 제출하기 \(1건\)/ }));
    fireEvent.click(screen.getByRole('button', { name: '학교 제출하기' }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('이미 제출된 예약이 포함되어 있습니다.', { variant: 'error' });
    });
  });
```

(주의: 섹션 버튼 접근성 이름은 `학교 제출하기 (1건)`, Dialog 확인 버튼은 `학교 제출하기` — getByRole 의 문자열 name 은 전체 일치라 서로 충돌하지 않는다. 다중 매칭이 생기면 셀렉터 구체화로 해결, 문구 변조 금지.)

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-prepare-tab`
Expected: 신규 2건 FAIL

- [ ] **Step 3: 구현**

`BatchCreateDialog.tsx` 개조 — memo 리셋 useEffect·isPending 닫기 차단·구조는 유지하고 다음만 변경:
- props 에 `facilityName: string` 추가
- `DialogTitle` → `` `${facilityName} 예약 ${selectedCount}건을 학교에 제출할까요?` ``
- `DialogDescription` → `학교 행정실 제출은 담당자가 진행하고, 제출을 마치면 '제출 목록' 탭에서 완료 처리해 주세요.` 를 포함한 v3 본문("선택한 예약으로 제출 목록을 만들어요. " 선행)
- 확인 버튼 라벨 `제출 목록 만들기` → `학교 제출하기`

`SubmissionPrepareTab.tsx` 연결:
- **뮤테이션 훅은 이 태스크에서 생성**(Task 3/4 책임 분리): import 에 `useCreateSubmissionBatchMutation` 추가 + `const createMutation = useCreateSubmissionBatchMutation();`
- 상태 추가: `const [dialogSection, setDialogSection] = useState<{ facilityId: number; facilityName: string } | null>(null);`
- 섹션 버튼 onClick → `setDialogSection({ facilityId: section.facilityId, facilityName: section.facilityName })`
- 핸들러(시설 단위 — dialogSection 의 시설에 속한 선택 예약만 전송):

```tsx
  const handleSubmitConfirm = async (memo: string) => {
    if (dialogSection === null) return;
    const sectionBookings = visibleBookings.filter((booking) => booking.facilityId === dialogSection.facilityId);
    const bookingIds = deriveSelectedIds(sectionBookings, excludedIds);
    if (bookingIds.length === 0) return;
    try {
      await createMutation.mutateAsync({
        bookingIds,
        memo: memo.trim() === '' ? undefined : memo.trim(),
      });
      setDialogSection(null);
      // excluded 정리는 별도 불필요 — 제출된 예약은 재조회 후 selectable 에서 빠지고, Task 3 의
      // 화면 기준 프루닝 이펙트가 잔재를 정리한다(세션 상태 누적 방지 규약).
      addToast("제출 목록이 만들어졌어요. 학교 제출 후 '제출 목록' 탭에서 완료 처리해 주세요.");
    } catch (error) {
      addToast(submissionErrorMessage(error), { variant: 'error' });
    }
  };
```

- `submissionErrorMessage` 헬퍼는 구 AdminSubmissionPage 의 것을 이 파일로 이관(서버 메시지 우선·폴백 "제출 목록을 만들지 못했어요. 잠시 후 다시 시도해주세요.").
- Dialog 렌더(Task 3 주석 자리):

```tsx
      <BatchCreateDialog
        open={dialogSection !== null}
        facilityName={dialogSection?.facilityName ?? ''}
        selectedCount={
          dialogSection === null
            ? 0
            : deriveSelectedIds(
                visibleBookings.filter((booking) => booking.facilityId === dialogSection.facilityId),
                excludedIds,
              ).length
        }
        isPending={createMutation.isPending}
        onClose={() => setDialogSection(null)}
        onConfirm={(memo) => void handleSubmitConfirm(memo)}
      />
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-prepare-tab && pnpm typecheck`
Expected: 전부 GREEN(기존 + 신규 2)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 학교 제출하기 다이얼로그 — 시설 단위 제출 플로우"
```

---

### Task 5: 전체 게이트 + 실브라우저 QA

**Files:** 신규 없음 (회귀 수정만)

- [ ] **Step 1: 전체 게이트 실행**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm --filter @duing/web test && pnpm --filter @duing/web build`
Expected: 4개 전부 성공(성공 문구 직접 확인, `| tail` 금지). build 실패 시 stale `.next` 캐시 정리 후 재시도(알려진 함정), env 는 `NEXT_PUBLIC_API_BASE_URL=https://api.duings.com/api/v1` 오버라이드.

- [ ] **Step 2: 실브라우저 QA (컨트롤러 체크포인트)**

dev 서버(:3000)에서 — jsdom 사각지대:
1. `/admin/facility-bookings` 미인증 → login 리다이렉트, `/admin/facility-bookings/submission` → `?tab=prepare` 리다이렉트 체인(login next 파라미터에 tab 보존 여부 확인)
2. 임시 dev-qa 페이지(커밋 금지·QA 후 삭제)로 SubmissionPrepareTab 픽스처 렌더: 시설 섹션 2개·기본 전체 선택·제외 토글·섹션 버튼 카운트·Dialog v3 문구·시간표 토글
3. 탭 셸: 탭 전환 시 URL 변화(replace)·새로고침 후 탭 유지 — dev-qa 로는 불가하니 로그인 가능 시 실화면, 불가 시 사용자 스모크 항목으로 이월 명시

QA 종료 후 dev 서버·임시 페이지 정리(git status 클린 확인).

- [ ] **Step 3: 마무리 self-check**

1. 스펙 §7.0~7.2 전 항목 커버(탭 3종·URL 동기화·이식 무손실·리다이렉트·메뉴 정리·전 시설 섹션·제외 모델·학교 제출하기·v3 문구·Empty/로딩/에러)
2. 기존 submission 컴포넌트 수정이 BatchCreateDialog(의도된 개조)와 최소 diff 뿐인지
3. `any`/`as`(관용 예외 외)/커밋 규칙·attribution 없음

- [ ] **Step 4: 커밋 (수정 발생 시에만)**

```bash
git add -A && git commit -m "test(frontend): 통합 페이지 회귀 정리"
```

**완료 후:** push·PR 생성은 하지 않는다 — 컨트롤러가 최종 리뷰 뒤 사용자 지시로 진행한다.

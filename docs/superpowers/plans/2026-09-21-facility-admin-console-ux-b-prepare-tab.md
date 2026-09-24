# 시설 관리자 콘솔 UX — PR-B 제출 준비 탭(B1~B6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제출 준비 탭이 승인 예약을 기본 화면에서 놓치지 않고(오늘~다음 달 말일), 카드·셀렉트·검색 숫자가 서로 맞고, 제출된 예약에서 배치 상세로 바로 가며, 기간을 잘못 넣어도 직전 결과가 사라지지 않게 한다.

**Architecture:** 전부 프론트(`apps/web`)의 기존 파일 수정. 기간 계산은 `_lib/submissionPeriod.ts` 순수 함수로 모으고(KST 헬퍼 사용), 탭은 "마지막 유효 기간" 상태를 onChange/프리셋 핸들러에서만 갱신한다(useEffect 없음). 카드 재계산은 `submission/_lib/submissionSections.ts` 의 순수 함수. BE 응답 필드 `submissionBatchId` 는 결측 허용(`?`)이라 PR-A 와 배포 순서 무관.

**Tech Stack:** Next.js 15 App Router · React 19 · TanStack Query(훅은 `@duing/hooks`) · Vitest + Testing Library · TypeScript strict(`noUncheckedIndexedAccess`).

**Spec:** `docs/superpowers/specs/2026-09-21-facility-admin-console-ux-design.md` §2.2(B1~B6), §1 표 "제출 준비 …" 행, §3 테스트 전략.

**브랜치:** `fix/facility-submission-prepare-ux`(develop 기준). PR 제목: `fix(frontend): 제출 준비 탭 — 기본 기간 오늘~다음 달 말일·프리셋, 카드·셀렉트 정합, 배치 링크, 기간 오류 시 결과 유지`.

## Global Constraints

- 스펙 §2.2 값 그대로: 기본 기간 = **오늘 ~ 다음 달 말일**, 상한 **62일**, 프리셋 **이번 달 / 다음 달 / 이번+다음 달**, 셀렉트 5값 = `SummaryFilter`(ALL·APPROVED·NEED·SUBMITTED·CONFIRMED) 1:1, 카드 4장 유지, 부제 문구는 Task 4 에 적힌 문자열 그대로.
- `any` 금지, `as` 타입 단언 금지(타입 가드 사용), 타입 선언은 `type` 만(`interface` 금지). (frontend/CLAUDE.md)
- `useEffect` 안에서 데이터 패칭 금지. 이 PR 은 새 effect 를 만들지 않는다(기존 제외 정리 effect 는 그대로).
- 서버 상태는 TanStack Query 만. `useQuery` 자체를 mock 하지 않는다 — 테스트는 `@duing/hooks` 의 훅을 `vi.mock` 으로 스텁(기존 파일 패턴).
- `@duing/api` 없이 `fetch`/`ky` 직접 호출 금지(이 PR 은 API 호출 추가 없음).
- 변수명은 역할이 드러나게(`data`·`res`·`e` 금지).
- 날짜: 테스트·구현 모두 KST 달력 헬퍼 사용 — `todayKstDateString(now: Date)`(`@duing/hooks` export, `packages/hooks/src/dashboardDate.ts:31`). `new Date().getMonth()` 로컬 계산 금지.
- GREEN 조건(태스크마다): `pnpm vitest run test/admin/facility-submission test/admin/facility-bookings` + `pnpm typecheck` + `pnpm lint` 를 `frontend/apps/web` 에서. 훅 시그니처는 바뀌지 않으므로 web 전체 스위트는 PR 마지막에 1회.
- `pnpm` 명령은 `frontend/` 또는 `frontend/apps/web` 에서 실행(루트에서 실행 금지).
- 커밋: Conventional Commits 한국어 `type(scope): 대상 — 변경점`. Co-Authored-By·🤖 라인 금지.

---

## File Structure

| 파일 | 역할 | 태스크 |
|---|---|---|
| `frontend/apps/web/app/admin/facility-bookings/_lib/submissionPeriod.ts` | 기간 계산 순수 함수(기본·프리셋 3종), KST 기준 | 1 |
| `frontend/apps/web/test/admin/facility-submission/submission-period.test.ts` | (신규) 기간 함수 단위 테스트, 고정 `now` | 1 |
| `frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx:102` | 스테퍼 건수 조회 인자를 기본 기간으로 | 1 |
| `frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx:27` | 스테퍼 건수 훅 인자 단언 | 1 |
| `frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx` | 기본 기간·프리셋(1), 셀렉트 5값(2), 카드 재계산(3), 마지막 유효 기간(6) | 1·2·3·6 |
| `frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx` | 탭 통합 테스트 | 1·2·3·4·6 |
| `frontend/apps/web/app/admin/facility-bookings/submission/_lib/submissionSections.ts` | `summarizeCandidates` 추가 | 3 |
| `frontend/apps/web/test/admin/facility-submission/submission-sections.test.ts` | `summarizeCandidates` 단위 테스트 | 3 |
| `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionSummaryCards.tsx:16-19` | 부제 문구 | 4 |
| `frontend/packages/types/src/facilitySubmission.ts:28` | `submissionBatchId?: number \| null` | 5 |
| `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionClubGroupList.tsx:116-118` | 제출번호 → 배치 상세 링크 | 5 |
| `frontend/apps/web/test/admin/facility-submission/submission-club-group-list.test.tsx` | 링크 테스트 | 5 |

---

### Task 1: 기본 기간 오늘~다음 달 말일 + 프리셋 3개 + 스테퍼 건수 공유 (B1, #1·#2·#3)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_lib/submissionPeriod.ts` (전체 교체)
- Create: `frontend/apps/web/test/admin/facility-submission/submission-period.test.ts`
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx:13,28,57-60,223-227,285-297`
- Modify: `frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx:15,102`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx:113-120,372-381`
- Test: `frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx:27`

**Interfaces:**
- Produces (`submissionPeriod.ts`):
  ```ts
  export type SubmissionDateRange = { startDate: string; endDate: string }; // 'YYYY-MM-DD'
  export function defaultSubmissionRange(now?: Date): SubmissionDateRange;      // 오늘(KST) ~ 다음 달 말일
  export function currentMonthRange(now?: Date): SubmissionDateRange;           // 이번 달 1일 ~ 말일
  export function nextMonthRange(now?: Date): SubmissionDateRange;              // 다음 달 1일 ~ 말일
  export function currentAndNextMonthRange(now?: Date): SubmissionDateRange;    // 이번 달 1일 ~ 다음 달 말일
  ```
- Consumes: `todayKstDateString(now: Date): string` from `@duing/hooks`.
- Task 6 이 `SubmissionDateRange` 를 `lastValidRange` 상태 타입으로 쓴다.

- [ ] **Step 1: 기간 함수 실패 테스트 작성**

`frontend/apps/web/test/admin/facility-submission/submission-period.test.ts` (신규):

```ts
import { describe, expect, it } from 'vitest';
import {
  currentAndNextMonthRange,
  currentMonthRange,
  defaultSubmissionRange,
  nextMonthRange,
} from '../../../app/admin/facility-bookings/_lib/submissionPeriod';

// KST 자정 직후(UTC 로는 전날 15:00) — 로컬/UTC 로 계산하면 날짜가 하루 어긋나는 시각으로 고정한다.
const kstMidnightAfter = (isoDate: string) => new Date(`${isoDate}T00:30:00+09:00`);

describe('submissionPeriod', () => {
  it('기본 기간은 오늘(KST)부터 다음 달 말일까지다', () => {
    expect(defaultSubmissionRange(kstMidnightAfter('2026-09-21'))).toEqual({
      startDate: '2026-09-21',
      endDate: '2026-10-31',
    });
  });

  it('12월에는 다음 해 1월 말일까지, 최대 62일(7/1→8/31·12/1→1/31)이다', () => {
    expect(defaultSubmissionRange(kstMidnightAfter('2026-12-01'))).toEqual({
      startDate: '2026-12-01',
      endDate: '2027-01-31',
    });
    expect(defaultSubmissionRange(kstMidnightAfter('2026-07-01'))).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-08-31',
    });
  });

  it('프리셋 3종 — 이번 달·다음 달·이번+다음 달', () => {
    const now = kstMidnightAfter('2026-02-10');
    expect(currentMonthRange(now)).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' });
    expect(nextMonthRange(now)).toEqual({ startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(currentAndNextMonthRange(now)).toEqual({ startDate: '2026-02-01', endDate: '2026-03-31' });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run (in `frontend/apps/web`): `pnpm vitest run test/admin/facility-submission/submission-period.test.ts`
Expected: FAIL — `defaultSubmissionRange`/`nextMonthRange`/`currentAndNextMonthRange` is not a function.

- [ ] **Step 3: `submissionPeriod.ts` 구현(전체 교체)**

```ts
// 제출 준비 조회 기간 — 기본은 "오늘 ~ 다음 달 말일"(승인 예약의 대부분이 승인 시점의 다음 달 예약, 스펙 §2.2 B1).
// 프리셋(이번 달·다음 달·이번+다음 달)도 여기서 만든다. 워크플로 탭 건수(셸)와 준비 탭이 같은 기본값을
// 공유해야 React Query 캐시가 하나로 합쳐진다. 날짜는 KST 달력 기준(브라우저 로컬·CI UTC 무관).
import { todayKstDateString } from '@duing/hooks/datetime';

export type SubmissionDateRange = { startDate: string; endDate: string };

/** 'YYYY-MM-DD' 문자열의 연·월(0-based)·일 — 문자열 슬라이스라 타임존 영향이 없다. */
function kstCalendarOf(now: Date): { year: number; monthIndex: number } {
  const today = todayKstDateString(now);
  return { year: Number(today.slice(0, 4)), monthIndex: Number(today.slice(5, 7)) - 1 };
}

/** UTC 자정으로 만든 뒤 ISO 앞 10자리 — day=0 은 전달 말일(월 넘김은 Date.UTC 가 처리). */
function isoDate(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

export function defaultSubmissionRange(now: Date = new Date()): SubmissionDateRange {
  const { year, monthIndex } = kstCalendarOf(now);
  return { startDate: todayKstDateString(now), endDate: isoDate(year, monthIndex + 2, 0) };
}

export function currentMonthRange(now: Date = new Date()): SubmissionDateRange {
  const { year, monthIndex } = kstCalendarOf(now);
  return { startDate: isoDate(year, monthIndex, 1), endDate: isoDate(year, monthIndex + 1, 0) };
}

export function nextMonthRange(now: Date = new Date()): SubmissionDateRange {
  const { year, monthIndex } = kstCalendarOf(now);
  return { startDate: isoDate(year, monthIndex + 1, 1), endDate: isoDate(year, monthIndex + 2, 0) };
}

export function currentAndNextMonthRange(now: Date = new Date()): SubmissionDateRange {
  const { year, monthIndex } = kstCalendarOf(now);
  return { startDate: isoDate(year, monthIndex, 1), endDate: isoDate(year, monthIndex + 2, 0) };
}
```

- [ ] **Step 4: 기간 함수 테스트 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-period.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: 탭 실패 테스트 — 기본 인자·프리셋·62일 문구**

`submission-prepare-tab.test.tsx` 상단 import 에 추가:

```ts
import {
  currentAndNextMonthRange,
  currentMonthRange,
  defaultSubmissionRange,
  nextMonthRange,
} from '../../../app/admin/facility-bookings/_lib/submissionPeriod';
```

`:113-120` 기존 테스트를 아래로 교체:

```ts
  it('진입 즉시 시설 없이 오늘~다음 달 말일 기간으로 전 시설 후보를 조회한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    const lastParams = mockCandidatesQuery.mock.calls.at(-1)?.[0];
    expect(lastParams.facilityId).toBeUndefined();
    expect(lastParams).toEqual(defaultSubmissionRange());
  });

  it('기간 프리셋(이번 달·다음 달·이번+다음 달)이 두 날짜를 함께 바꾸고 그 기간으로 재조회한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByLabelText('시작일')).toHaveValue(nextMonthRange().startDate);
    expect(screen.getByLabelText('종료일')).toHaveValue(nextMonthRange().endDate);
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(nextMonthRange());

    fireEvent.click(screen.getByRole('button', { name: '이번+다음 달' }));
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(currentAndNextMonthRange());

    fireEvent.click(screen.getByRole('button', { name: '이번 달' }));
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(currentMonthRange());
  });
```

`:372-381` 기존 "31일" 테스트를 아래로 교체(Task 6 에서 `null` 단언을 다시 바꾼다 — 여기서는 문구·경계만):

```ts
  it('기간이 62일을 넘으면 조회하지 않고 안내를 보여준다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-05' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/62일/);
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(null);
  });
```

`admin-bookings-page.test.tsx:27` 의 `useSubmissionCandidatesQuery` 스텁을 스파이로 바꾸고 단언 추가. `:5` 근처 다른 `vi.fn()` 선언 옆에:

```ts
const mockCandidatesQuery = vi.fn();
```

`:27` 교체:

```ts
  useSubmissionCandidatesQuery: (...args: unknown[]) => {
    mockCandidatesQuery(...args);
    return { data: undefined, isLoading: false, isSuccess: false, isError: false, refetch: vi.fn() };
  },
```

import 추가(테스트 상단, 대상 import 옆):

```ts
import { defaultSubmissionRange } from '../../../app/admin/facility-bookings/_lib/submissionPeriod';
```

`describe` 안 `:165` 첫 테스트 뒤에 추가:

```ts
  it('스테퍼 "제출 준비" 건수는 준비 탭 기본 기간(오늘~다음 달 말일)으로 조회한다', () => {
    render(<AdminFacilityBookingsPage />);
    expect(mockCandidatesQuery).toHaveBeenCalledWith(defaultSubmissionRange());
  });
```

(`within` 이 테스트 파일 import 에 없으면 `@testing-library/react` import 에 추가한다.)

- [ ] **Step 6: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-prepare-tab.test.tsx test/admin/facility-bookings/admin-bookings-page.test.tsx`
Expected: FAIL — 기본 인자가 이번 달 1일, 프리셋 버튼 없음, 문구 "31일", 스테퍼 인자 불일치.

- [ ] **Step 7: 탭·셸 구현**

`SubmissionPrepareTab.tsx`:

`:13` import 교체:
```ts
import { currentAndNextMonthRange, currentMonthRange, defaultSubmissionRange, nextMonthRange } from '../_lib/submissionPeriod';
```

`:28`:
```ts
const MAX_PERIOD_DAYS = 62;
```

`:28` 아래에 프리셋 정의 추가:
```ts
// 기간 프리셋(스펙 §2.2 B1) — 클릭 = 두 date 입력을 동시에 세팅. 라벨이 접근성 이름이다.
const PERIOD_PRESETS: { label: string; range: () => { startDate: string; endDate: string } }[] = [
  { label: '이번 달', range: currentMonthRange },
  { label: '다음 달', range: nextMonthRange },
  { label: '이번+다음 달', range: currentAndNextMonthRange },
];
```

`:58` 교체:
```ts
  const defaultRange = defaultSubmissionRange();
```

`:225` 문구의 `최대 31일` → `최대 62일`.

`:88` 주석 `(31일 상한 소량)` → `(62일 상한 소량)`.

`:286-297` 필터 행 — 종료일 input 다음(검색 input 앞)에 프리셋 버튼 그룹 추가:
```tsx
          <div role="group" aria-label="기간 프리셋" className="flex gap-1">
            {PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const range = preset.range();
                  setStartDate(range.startDate);
                  setEndDate(range.endDate);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
```

`AdminFacilityBookingsPage.tsx`:
- `:15` `import { currentMonthRange } from '../_lib/submissionPeriod';` → `import { defaultSubmissionRange } from '../_lib/submissionPeriod';`
- `:102` `useSubmissionCandidatesQuery(currentMonthRange())` → `useSubmissionCandidatesQuery(defaultSubmissionRange())`
- `:101` 주석 `준비 탭 건수는 이번 달 기본 기간 기준` → `준비 탭 건수는 기본 기간(오늘~다음 달 말일) 기준`
- 스테퍼 `title={tab === 'prepare' ? '이번 달 기준' : undefined}` → `'오늘~다음 달 말일 기준'`

- [ ] **Step 8: 통과 확인 + typecheck + lint**

Run: `pnpm vitest run test/admin/facility-submission test/admin/facility-bookings && pnpm typecheck && pnpm lint`
Expected: 전부 PASS. lint 는 기존 경고(`app/notifications/page.tsx` exhaustive-deps) 1건만.

- [ ] **Step 9: Commit**

```bash
git add frontend/apps/web/app/admin/facility-bookings/_lib/submissionPeriod.ts \
  frontend/apps/web/test/admin/facility-submission/submission-period.test.ts \
  frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx \
  frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx \
  frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx \
  frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx
git commit -m "fix(frontend): 제출 준비 탭 — 기본 기간 오늘~다음 달 말일(KST)·프리셋 3종·상한 62일, 스테퍼 건수 동일 기간"
```

---

### Task 2: 제출 상태 셀렉트를 카드 필터 5값과 1:1 (B2, #7)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx:30,117-119,303-315`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx:347-358`

**Interfaces:**
- Consumes: `SummaryFilter = 'ALL' | 'APPROVED' | 'NEED' | 'SUBMITTED' | 'CONFIRMED'`(`SubmissionSummaryCards.tsx:5`, 변경 없음).
- Produces: 없음(탭 내부).

- [ ] **Step 1: 실패 테스트**

`:347-358` 테스트를 아래로 교체:

```ts
  it('제출 상태 셀렉트와 카드가 같은 5값 필터를 조작한다 — 카드 클릭이 셀렉트에, 셀렉트가 카드에 반영된다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.change(screen.getByLabelText('제출 상태'), { target: { value: 'SUBMITTED' } });
    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /방송국/ })).toBeInTheDocument();

    // 제출 대기 예약 카드 재클릭 = 전체 복귀 → 셀렉트도 '전체'
    fireEvent.click(screen.getByRole('button', { name: /제출 대기 예약/ }));
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
    expect(screen.getByLabelText('제출 상태')).toHaveValue('ALL');

    // 카드 '학교 등록 완료' 클릭 → 셀렉트 CONFIRMED (예전엔 '전체'로 뭉개졌다)
    fireEvent.click(screen.getByRole('button', { name: /학교 등록 완료/ }));
    expect(screen.getByLabelText('제출 상태')).toHaveValue('CONFIRMED');
    expect(screen.getByRole('group', { name: /방송국/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();

    // 셀렉트로 '승인 완료' → 카드 aria-pressed
    fireEvent.change(screen.getByLabelText('제출 상태'), { target: { value: 'APPROVED' } });
    expect(screen.getByRole('button', { name: /^승인 완료/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-prepare-tab.test.tsx -t "5값 필터"`
Expected: FAIL — 셀렉트 값 `CONFIRMED` 옵션 없음(값이 'ALL').

- [ ] **Step 3: 구현**

`:30` `type SubmissionStatusFilter = 'ALL' | 'NEED' | 'SUBMITTED';` 삭제. 대신 그 자리에:

```ts
const SUMMARY_FILTER_OPTIONS: { value: SummaryFilter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'APPROVED', label: '승인 완료' },
  { value: 'NEED', label: '미제출 예약' },
  { value: 'SUBMITTED', label: '제출 대기 예약' },
  { value: 'CONFIRMED', label: '학교 등록 완료' },
];

/** select 는 문자열만 돌려주므로 알려진 필터 값인지 확인하고 좁힌다(`as` 단언 금지). */
function toSummaryFilter(value: string): SummaryFilter {
  const matched = SUMMARY_FILTER_OPTIONS.find((option) => option.value === value);
  return matched ? matched.value : 'ALL';
}
```

`:117-119`(`statusFilterValue` 파생 3줄 + 주석) 삭제.

`:303-315` 셀렉트 교체:

```tsx
          <select
            aria-label="제출 상태"
            className="rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-semibold text-charcoal"
            value={summaryFilter}
            onChange={(event) => setSummaryFilter(toSummaryFilter(event.target.value))}
          >
            {SUMMARY_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-prepare-tab.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS. (`:138` 의 `'ALL'` 변경·`:212` `'SUBMITTED'`·`:214` `'NEED'` 기존 테스트도 그대로 통과.)

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx \
  frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx
git commit -m "fix(frontend): 제출 준비 탭 — 제출 상태 셀렉트를 카드 필터 5값과 1:1 로"
```

---

### Task 3: 검색 중 카드 숫자 = 화면 기준 (B3, #8)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/_lib/submissionSections.ts` (끝에 함수 추가)
- Test: `frontend/apps/web/test/admin/facility-submission/submission-sections.test.ts` (끝에 describe 추가)
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx:26,215-221`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx` (테스트 추가)

**Interfaces:**
- Produces: `export function summarizeCandidates(bookings: SubmissionCandidateBooking[]): SubmissionSummaryCounts` — BE `GeneralFacilitySubmissionQueryService.summarize` 와 같은 4규칙(approved=`status==='APPROVED'`, awaiting=`selectable`, submitted=`submitted`, confirmed=`status==='CONFIRMED'`).
- Consumes: `SubmissionSummaryCounts`(`@duing/types`).

- [ ] **Step 1: 순수 함수 실패 테스트**

`submission-sections.test.ts` import 에 `summarizeCandidates` 추가하고 파일 끝에:

```ts
describe('summarizeCandidates', () => {
  it('BE summarize 와 같은 4규칙 — 승인=APPROVED, 미제출=selectable, 제출=submitted, 등록완료=CONFIRMED', () => {
    const counts = summarizeCandidates([
      makeBooking({ bookingId: 1, status: 'APPROVED', submitted: false, selectable: true }),
      makeBooking({ bookingId: 2, status: 'APPROVED', submitted: true, selectable: false }),
      makeBooking({ bookingId: 3, status: 'CONFIRMED', submitted: true, selectable: false }),
      makeBooking({ bookingId: 4, status: 'CANCELLED', submitted: false, selectable: false }),
    ]);
    expect(counts).toEqual({ approvedCount: 2, awaitingCount: 1, submittedCount: 2, confirmedCount: 1 });
  });

  it('빈 입력은 전부 0', () => {
    expect(summarizeCandidates([])).toEqual({ approvedCount: 0, awaitingCount: 0, submittedCount: 0, confirmedCount: 0 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-sections.test.ts`
Expected: FAIL — `summarizeCandidates` is not exported.

- [ ] **Step 3: 순수 함수 구현**

`submissionSections.ts` `:1` import 교체 및 파일 끝 추가:

```ts
import type { SubmissionCandidateBooking, SubmissionSummaryCounts } from '@duing/types';
```

```ts
/**
 * 화면 기준 요약(스펙 §2.2 B3) — 검색어로 좁힌 목록의 카드 숫자. BE `summarize`(4규칙)와 동일해야
 * 검색어가 없을 때 서버 summary 와 같은 값이 나온다: 승인=APPROVED, 미제출=selectable, 제출=submitted, 등록완료=CONFIRMED.
 */
export function summarizeCandidates(bookings: SubmissionCandidateBooking[]): SubmissionSummaryCounts {
  return {
    approvedCount: bookings.filter((booking) => booking.status === 'APPROVED').length,
    awaitingCount: bookings.filter((booking) => booking.selectable).length,
    submittedCount: bookings.filter((booking) => booking.submitted).length,
    confirmedCount: bookings.filter((booking) => booking.status === 'CONFIRMED').length,
  };
}
```

- [ ] **Step 4: 순수 함수 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-sections.test.ts`
Expected: PASS.

- [ ] **Step 5: 탭 실패 테스트**

`submission-prepare-tab.test.tsx` `:360-370`("동아리명 부분 검색") 테스트 뒤에 추가:

```ts
  it('검색어가 있으면 카드 숫자를 화면 예약 기준으로 다시 센다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeMultiClubResponse()));
    render(<SubmissionPrepareTab />);

    // 카드 값 <p> 만 정확히 잡는다 — toHaveTextContent 부분 일치는 부제에 숫자가 섞이면 오탐한다.
    const cardValue = (name: RegExp) => within(screen.getByRole('button', { name })).getByText(/^\d+$/);
    // 서버 summary: approved 4 · awaiting 3 · submitted 1 · confirmed 1
    expect(cardValue(/^승인 완료/)).toHaveTextContent('4');
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '테니스' } });
    // 테니스부 예약 1건(APPROVED·selectable)만 남는다.
    expect(cardValue(/^승인 완료/)).toHaveTextContent('1');
    expect(cardValue(/^미제출 예약/)).toHaveTextContent('1');
    expect(cardValue(/제출 대기 예약/)).toHaveTextContent('0');
    expect(cardValue(/학교 등록 완료/)).toHaveTextContent('0');

    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '' } });
    expect(cardValue(/^승인 완료/)).toHaveTextContent('4');
  });
```

- [ ] **Step 6: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-prepare-tab.test.tsx -t "화면 예약 기준"`
Expected: FAIL — 검색 후에도 '4'.

- [ ] **Step 7: 탭 구현**

`:26` import 에 `summarizeCandidates` 추가:
```ts
import { buildClubSections, buildFacilitySections, deriveSelectedIds, summarizeCandidates } from '../submission/_lib/submissionSections';
```

`:95`(`visibleBookings` 선언) 아래에:
```ts
  // 검색 중엔 카드 숫자도 화면 기준(스펙 §2.2 B3) — 검색어 없으면 서버 summary 그대로(같은 4규칙이라 값 동일).
  const summaryCounts = candidatesQuery.data
    ? keyword === '' ? candidatesQuery.data.summary : summarizeCandidates(searchedBookings)
    : null;
```

`:215-221` 카드 렌더 교체:
```tsx
      {summaryCounts !== null && candidatesParams !== null && (
        <SubmissionSummaryCards
          counts={summaryCounts}
          activeFilter={summaryFilter}
          onSelectFilter={setSummaryFilter}
        />
      )}
```

- [ ] **Step 8: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission/_lib/submissionSections.ts \
  frontend/apps/web/test/admin/facility-submission/submission-sections.test.ts \
  frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx \
  frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx
git commit -m "fix(frontend): 제출 준비 탭 — 검색 중 요약 카드 숫자를 화면 예약 기준으로 재계산"
```

---

### Task 4: 카드 부제로 포함 관계 표기 (B4, #10)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionSummaryCards.tsx:16-19`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx:335-345`

**Interfaces:** 없음(문구만).

- [ ] **Step 1: 실패 테스트**

`:335-345` 테스트를 아래로 교체(라벨은 유지, 부제로 관계 확인):

```ts
  it('전 시설 합산 Summary 4카드를 v2.2 라벨로 보여주고 부제가 카드 사이 포함 관계를 드러낸다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    // 카드 라벨은 상태 배지·셀렉트 옵션·섹션 헤더와 문자열이 겹쳐 role=button(aria-pressed 카드)으로 조회.
    expect(screen.getByRole('button', { name: /^승인 완료.*미제출 \+ 제출 대기\(승인 상태\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^미제출 예약.*승인 완료 중 아직 목록에 없는 예약/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^제출 대기 예약.*목록에 담겨 학교 제출을 기다림/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^학교 등록 완료.*학교 시스템 반영 확인\(확정\)/ })).toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-prepare-tab.test.tsx -t "포함 관계"`
Expected: FAIL — 부제 문구 불일치.

- [ ] **Step 3: 구현** — `SubmissionSummaryCards.tsx:16-19` 교체:

```ts
    { filter: 'APPROVED', label: '승인 완료', value: counts.approvedCount, sub: '미제출 + 제출 대기(승인 상태)' },
    { filter: 'NEED', label: '미제출 예약', value: counts.awaitingCount, sub: '승인 완료 중 아직 목록에 없는 예약' },
    { filter: 'SUBMITTED', label: '제출 대기 예약', value: counts.submittedCount, sub: '목록에 담겨 학교 제출을 기다림' },
    { filter: 'CONFIRMED', label: '학교 등록 완료', value: counts.confirmedCount, sub: '학교 시스템 반영 확인(확정)' },
```

`:13` 주석 끝에 ` 부제는 카드 사이 포함 관계(승인 ⊇ 미제출 ∪ 제출 대기)를 드러낸다(스펙 §2.2 B4).` 추가.

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission && pnpm typecheck && pnpm lint`
Expected: PASS. Task 3 테스트의 `/^미제출 예약/` 조회는 라벨이 그대로라 영향 없음.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionSummaryCards.tsx \
  frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx
git commit -m "fix(frontend): 제출 준비 카드 — 부제로 승인·미제출·제출 대기 포함 관계 표기"
```

---

### Task 5: 제출 대기 예약의 제출번호 → 배치 상세 링크 (B5, #11)

**Files:**
- Modify: `frontend/packages/types/src/facilitySubmission.ts:28`
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionClubGroupList.tsx:4,116-118`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-club-group-list.test.tsx`

**Interfaces:**
- Produces(타입): `SubmissionCandidateBooking.submissionBatchId?: number | null` — PR-A(A2) 응답 필드. 결측(구 백엔드)·null(미제출) 모두 평문 폴백.
- Consumes: `toRoute` (`@/app/_lib/route`), `Link`(`next/link`).

- [ ] **Step 1: 실패 테스트**

`submission-club-group-list.test.tsx` `:240-259` 테스트 뒤에 추가:

```ts
  it('제출번호는 submissionBatchId 가 있으면 배치 상세 링크, 없으면(구 응답·null) 평문이다', () => {
    const linked = makeBooking({
      bookingId: 7, clubId: 11, clubName: '방송국', submitted: true, selectable: false,
      submissionNo: 'SUB-20260801-007', submissionBatchId: 42,
    });
    const plain = makeBooking({
      bookingId: 8, clubId: 12, clubName: '테니스부', submitted: true, selectable: false,
      submissionNo: 'SUB-20260801-008', submissionBatchId: null,
    });
    render(
      <SubmissionClubGroupList
        bookings={[linked, plain]}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'SUB-20260801-007' })).toHaveAttribute(
      'href',
      expect.stringContaining('/admin/facility-bookings/submission/42'),
    );
    expect(screen.getByText('SUB-20260801-008')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'SUB-20260801-008' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-club-group-list.test.tsx -t "배치 상세 링크"`
Expected: FAIL — typecheck 오류(`submissionBatchId` 없음)는 vitest 가 안 잡으므로 런타임 단언 실패(link 없음)로 FAIL.

- [ ] **Step 3: 구현**

`facilitySubmission.ts:28` 아래에 추가:
```ts
  // 활성 배치 id(BE §5.1 additive, 2026-09-21) — 제출번호를 배치 상세 링크로 만든다. 구 응답 결측·미제출 null 은 평문 폴백.
  submissionBatchId?: number | null;
```

`SubmissionClubGroupList.tsx:4` 위에 import 추가:
```ts
import Link from 'next/link';
```
그리고 `:8` 아래에:
```ts
import { toRoute } from '@/app/_lib/route';
```

`:116-118` 교체:
```tsx
                          {booking.submitted && booking.submissionNo !== null && (
                            booking.submissionBatchId !== undefined && booking.submissionBatchId !== null ? (
                              <Link
                                href={toRoute(`/admin/facility-bookings/submission/${booking.submissionBatchId}`)}
                                className="tabular-nums text-[10px] text-charcoal-3 underline underline-offset-2 hover:text-ink-deep"
                              >
                                {booking.submissionNo}
                              </Link>
                            ) : (
                              <span className="tabular-nums text-[10px] text-charcoal-3">{booking.submissionNo}</span>
                            )
                          )}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission && pnpm typecheck && pnpm lint`
Expected: PASS. `typecheck` 는 `packages/types` 변경을 포함해 통과해야 한다(모노레포 참조).

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/types/src/facilitySubmission.ts \
  frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionClubGroupList.tsx \
  frontend/apps/web/test/admin/facility-submission/submission-club-group-list.test.tsx
git commit -m "fix(frontend): 제출 준비 목록 — 제출번호를 배치 상세 링크로(submissionBatchId 결측은 평문 폴백)"
```

---

### Task 6: 기간 오류 시 직전 결과 유지 + 인라인 경고 (B6, #24)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx:59-60,78-84,125-126,215,223-227,286-297,318`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx` (Task 1 에서 바꾼 "62일" 테스트와 `:383-391` "빈 값" 테스트 교체)

**Interfaces:**
- Consumes: `SubmissionDateRange`(Task 1), `defaultSubmissionRange`, `PERIOD_PRESETS`(Task 1), `MAX_PERIOD_DAYS = 62`.
- Produces: 없음.

- [ ] **Step 1: 실패 테스트** — Task 1 의 "62일" 테스트와 `:383-391` 을 아래 둘로 교체:

```ts
  it('기간이 62일을 넘으면 안내를 띄우되 마지막 유효 기간의 결과(카드·목록)는 그대로 둔다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);
    setPeriod('2026-08-01', '2026-08-31');
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith({ startDate: '2026-08-01', endDate: '2026-08-31' });

    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-05' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/62일/);
    // 새 인자로 재조회하지 않는다 — 마지막 유효 기간 유지.
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^승인 완료/ })).toBeInTheDocument();

    // 유효한 값으로 되돌리면 경고가 사라지고 그 기간으로 조회한다.
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-09-15' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith({ startDate: '2026-08-01', endDate: '2026-09-15' });
  });

  it('시작일이 빈 값이면(NaN 일수) 안내를 띄우고 마지막 유효 기간으로 계속 조회한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);
    const defaultRange = defaultSubmissionRange();

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '' } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(defaultRange);
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run test/admin/facility-submission/submission-prepare-tab.test.tsx -t "마지막 유효 기간"`
Expected: FAIL — 마지막 호출 인자가 `null`, 그룹 사라짐.

- [ ] **Step 3: 구현**

`SubmissionPrepareTab.tsx`:

`:13` import 에 `type SubmissionDateRange` 추가:
```ts
import {
  currentAndNextMonthRange,
  currentMonthRange,
  defaultSubmissionRange,
  nextMonthRange,
  type SubmissionDateRange,
} from '../_lib/submissionPeriod';
```

`:32-35` `periodDayCount` 아래에:
```ts
function isValidPeriod(startDate: string, endDate: string): boolean {
  // 빈 값이면 periodDayCount 가 NaN — 범위 비교(NaN >= 1)는 항상 false 라 NaN·역순·초과·0일을 한 식으로 차단한다.
  const days = periodDayCount(startDate, endDate);
  return days >= 1 && days <= MAX_PERIOD_DAYS;
}
```

`:58-60` 교체:
```ts
  const defaultRange = defaultSubmissionRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  // 마지막 유효 기간(스펙 §2.2 B6) — 입력이 잘못돼도 카드·목록은 이 기간의 결과를 유지한다.
  // 갱신은 아래 applyPeriod(onChange·프리셋 핸들러)에서만 한다(useEffect 없음).
  const [lastValidRange, setLastValidRange] = useState<SubmissionDateRange>(defaultRange);
  const applyPeriod = (nextStartDate: string, nextEndDate: string) => {
    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    if (isValidPeriod(nextStartDate, nextEndDate)) {
      setLastValidRange({ startDate: nextStartDate, endDate: nextEndDate });
    }
  };
```

`:78-84` 교체:
```ts
  const periodInvalid = !isValidPeriod(startDate, endDate);
  // 전 시설 조회 — facilityId 는 생략(BE §5.1 v3). 항상 마지막 유효 기간으로 조회한다.
  const candidatesParams: SubmissionCandidatesParams = lastValidRange;
  const candidatesQuery = useSubmissionCandidatesQuery(candidatesParams);
```

`:125-126`:
```ts
  const periodStart = candidatesParams.startDate;
  const periodEnd = candidatesParams.endDate;
```
그리고 `:131` effect 의 `if (serverIdsKey === null || periodStart === null || periodEnd === null) return;` → `if (serverIdsKey === null) return;`

`:215`(Task 3 에서 바꾼 조건) `summaryCounts !== null && candidatesParams !== null` → `summaryCounts !== null`.

`:223-227` 상단 경고 블록 삭제. 대신 필터 행(`:286` div) **바로 아래**에 인라인 경고 추가:
```tsx
        {periodInvalid && (
          <p role="alert" className="px-[18px] pb-3 text-xs text-coral">
            조회 기간을 확인해주세요 — 종료일이 시작일보다 앞설 수 없고, 시작일부터 최대 62일까지 조회할 수 있어요. 아래는 마지막으로 유효했던 기간({lastValidRange.startDate} ~ {lastValidRange.endDate})의 결과예요.
          </p>
        )}
```

`:286-297` 두 date input 의 onChange 교체:
```tsx
            onChange={(event) => applyPeriod(event.target.value, endDate)}
```
```tsx
            onChange={(event) => applyPeriod(startDate, event.target.value)}
```
프리셋 버튼(Task 1) onClick 을:
```tsx
                onClick={() => {
                  const range = preset.range();
                  applyPeriod(range.startDate, range.endDate);
                }}
```

`:318` `{candidatesParams !== null && (` → 조건 제거(Fragment 그대로 렌더): `<>` … `</>` 로 두거나 조건 wrapper 삭제.

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/admin/facility-submission test/admin/facility-bookings && pnpm typecheck && pnpm lint`
Expected: PASS. 기존 `:220-240`(기간 복귀 로딩 경유) 테스트는 `setPeriod` 두 change 가 각각 `applyPeriod` 를 부르는데, 첫 change 의 중간 상태 `2026-08-01 ~ 2026-09-30`(61일)은 62일 상한 안이라 **유효** → `lastValidRange` 가 잠깐 그 값으로 바뀌어 훅이 한 번 그 인자로 호출된다. 그 시점 mock 은 `queryLoading` 이라 `serverIdsKey === null` 로 정리 effect 가 스킵되고(`SubmissionPrepareTab.tsx:127-131`), 종료일 change 에서 최종 기간으로 바뀌어 기존 단언은 그대로 통과한다.

- [ ] **Step 5: web 전체 스위트 1회 + Commit**

Run: `pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx \
  frontend/apps/web/test/admin/facility-submission/submission-prepare-tab.test.tsx
git commit -m "fix(frontend): 제출 준비 탭 — 기간 입력 오류 시 마지막 유효 기간 결과 유지·인라인 경고"
```

---

## Self-Review

- **Spec coverage:** B1(기본 기간·프리셋·상한·스테퍼)=Task 1, B2=Task 2, B3=Task 3, B4=Task 4, B5=Task 5, B6=Task 6. 스펙 §3 "FE 준비 탭·셸" 행의 테스트 파일 전부 사용.
- **Placeholder scan:** 없음 — 모든 스텝에 코드·명령·기대 결과 명시.
- **Type consistency:** `SubmissionDateRange`(Task 1 정의 → Task 6 사용), `summarizeCandidates`(Task 3 정의·사용), `submissionBatchId?: number | null`(Task 5 타입·컴포넌트·테스트 동일), `PERIOD_PRESETS`·`applyPeriod`(Task 1 → Task 6 onClick 교체) 일치.

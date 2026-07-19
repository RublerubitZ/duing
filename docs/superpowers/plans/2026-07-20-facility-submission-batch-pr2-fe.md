# 학교 제출(Submission Batch) PR-2 프론트 구현 계획 — 제출 화면

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 "학교 제출" 페이지의 제출 대기 탭 — 시설 선택 → Summary 4카드 → 시간표/목록 이원 뷰 → 예약 선택 → Batch 생성 → CSV 자동 다운로드.

**Architecture:** `/admin/facility-bookings/submission` 단일 페이지(탭 셸: 제출 대기 | 제출 이력(준비 중)). candidates API 1개가 summary+bookings 를 공급, Summary 카드는 클라이언트 필터, 시간표는 세로=날짜·가로=시간(09~22 13칸) colSpan 병합(WeekTimetable 의 계획 로직 전치). 선택 상태는 시간표/목록이 공유하는 `Set<bookingId>`.

**Tech Stack:** Next.js 15 App Router + React 19 / TanStack Query / ky(@duing/api) / Tailwind / vitest + testing-library(훅 모듈 모킹).

**스펙:** `docs/superpowers/specs/2026-07-19-facility-submission-batch-design.md` §7 (BE 계약은 §5 — develop 머지됨 #682)

## Global Constraints

- 커밋: Conventional Commits 한국어(`feat(frontend): ...`), Co-Authored-By/🤖 라인 금지. **push·PR 생성 금지**
- `any`·`as` 금지(불가피하면 `unknown`+타입 가드), 타입 선언은 `type`, `interface` 금지
- 서버 상태는 TanStack Query 만, `@duing/api` 경유(`ky`/`fetch` 직접 금지), `useEffect` 데이터 패칭 금지(상태 조정용 클램프는 AdminFacilityBookingsPage 전례 허용), TanStack Query 내부(useQuery 자체) 모킹 금지 — **훅 모듈(vi.mock('@duing/hooks')) 모킹**이 관례
- `packages/*` 에 DOM API 직접 사용 금지(blob 다운로드 헬퍼는 apps/web/app/_lib 에)
- 훅 네이밍 `use{Domain}{Action}Query/Mutation`, 뮤테이션 `onSettled` 무효화 관례
- 로딩: 전체 영역 `LoadingGate`·버튼 `ButtonSpinner`(텍스트 로딩 금지), 에러 `role="alert"`+다시 시도, Empty 는 "필터 결과 없음 vs 기간 내 없음" 구분
- 시간표: **FullCalendar 등 신규 의존성 금지**, `table-fixed` 격자 불변, 시간축 09~22(13칸), 모바일 `overflow-x-auto`+날짜 열 sticky
- Tailwind 는 실존 팔레트 토큰만(ink/cream/paper/line/graysoft/sage/sage-mist/sage-soft/coral/warm/charcoal-*/ink-deep — WeekTimetable·AdminFacilityBookingsPage 에서 실사용 확인된 것). 동적 클래스 조립 금지(purge 안전)
- 상태 색 맵(§7): PENDING=회색 / selectable(미제출 APPROVED)=ink 강조·선택 시 `bg-ink text-cream` / 제출완료=sage / CONFIRMED=sage 진한 톤+「등록완료」 / CANCELLED=coral 소거 / CONFLICT=warm+「충돌」
- 선택 모델: **클릭(탭)=토글**(Ctrl/⌘ 클릭도 동일 토글 — 별도 분기 없음), 전체 선택/해제 버튼, Shift 범위선택 없음. selectable=false 블록·행은 선택 불가
- 블록 클릭 의미 분리(스펙 §7 모호점의 계획 확정): **selectable 블록 클릭=선택 토글**(상세는 hover Tooltip), **비-selectable 블록 클릭=우측 Sheet 상세**
- 테스트 파일 위치 `apps/web/test/admin/facility-submission/`, 상대 날짜만 사용
- 버튼·오버레이 클래스(`btn btn-primary` 등)는 코드 작성 전 기존 소비처(BookingActionDialog·MemberCsvDownloadPopover 등)를 열어 실존 클래스 체계와 대조 — 다르면 기존 관례가 정본
- 검증 명령은 `frontend/` cwd 에서: `pnpm --filter @duing/web test`, `pnpm typecheck` (`| tail` 로 exit code 가리지 말 것)

**브랜치:** `feat/facility-submission-fe` (develop 에서 분기)

---

### Task 1: 타입 + API 클라이언트 + 훅 + Blob 다운로드 헬퍼

**Files:**
- Create: `frontend/packages/types/src/facilitySubmission.ts`
- Modify: `frontend/packages/types/src/index.ts` (export 1줄)
- Modify: `frontend/packages/api/src/client.ts` (admin 인터페이스·구현에 `facilitySubmission` 섹션 추가)
- Modify: `frontend/packages/hooks/src/adminQueryKeys.ts` (키 2개)
- Create: `frontend/packages/hooks/src/facilitySubmissionAdmin.ts`
- Modify: `frontend/packages/hooks/src/index.ts` (export 1줄 — 기존 export 나열 방식 확인 후 동일하게)
- Modify: `frontend/apps/web/app/_lib/downloadFile.ts` (`downloadBlobFile` 추가, `downloadTextFile` 은 위임으로 정리)

**Interfaces:**
- Produces(이후 태스크 소비):
  - 타입 `SubmissionCandidateBooking`(16필드)·`SubmissionSummaryCounts`·`SubmissionCandidatesResponse`·`SubmissionCandidatesParams`·`CreateSubmissionBatchPayload`·`CreateSubmissionBatchResult`·`SubmissionBookingStatus`
  - `client.admin.facilitySubmission.{candidates, create, downloadCsv}` (이력·상세·취소는 PR-3 에서 추가 — YAGNI)
  - `useSubmissionCandidatesQuery(params: SubmissionCandidatesParams | null)` — null=시설 미선택 게이트(enabled)
  - `useCreateSubmissionBatchMutation()` / `useDownloadSubmissionCsvMutation()`
  - `downloadBlobFile(filename: string, blob: Blob): void`

- [ ] **Step 1: 타입 작성**

`facilitySubmission.ts`:

```ts
// 학교 제출(Submission Batch) — BE 스펙 §5.1~5.2 계약과 1:1 (REJECTED 는 응답에서 제외)
export type SubmissionBookingStatus = 'PENDING' | 'APPROVED' | 'CONFIRMED' | 'CONFLICT' | 'CANCELLED';

export type SubmissionSummaryCounts = {
  approvedCount: number;
  awaitingCount: number;
  submittedCount: number;
  confirmedCount: number;
};

export type SubmissionCandidateBooking = {
  bookingId: number;
  clubId: number;
  clubName: string | null;
  applicantName: string | null;
  contactPhone: string | null;
  reservationDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  attendeeCount: number | null;
  status: SubmissionBookingStatus;
  submitted: boolean;
  selectable: boolean;
  submissionNo: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
};

export type SubmissionCandidatesResponse = {
  summary: SubmissionSummaryCounts;
  bookings: SubmissionCandidateBooking[];
};

export type SubmissionCandidatesParams = {
  facilityId: number;
  startDate: string;
  endDate: string;
};

export type CreateSubmissionBatchPayload = {
  bookingIds: number[];
  memo?: string;
};

export type CreateSubmissionBatchResult = {
  batchId: number;
  submissionNo: string;
  csvFileName: string;
};
```

`index.ts` 에 `export * from './facilitySubmission';` 추가(알파벳 위치).

참고: 동아리 필터는 클라이언트 필터로 확정(단일 시설·31일 상한이라 소량, API `clubId` 파라미터를 쓰면 필터 적용 시 셀렉트 옵션이 함께 줄어드는 UX 문제) — params 에 clubId 를 두지 않는다.

- [ ] **Step 2: 클라이언트 추가**

`client.ts` admin 인터페이스(`facilityBookings` 섹션 아래):

```ts
    // === 학교 제출(Submission Batch) — BE §5 (이력·상세·취소는 PR-3) ===
    facilitySubmission: {
      // GET .../submission/candidates — 기간 내 전체 예약 + summary(REJECTED 제외)
      candidates(params: SubmissionCandidatesParams): Promise<SubmissionCandidatesResponse>;
      // POST .../submission — all-or-nothing, 409(기제출/미승인)
      create(payload: CreateSubmissionBatchPayload): Promise<CreateSubmissionBatchResult>;
      // GET .../submission/{batchId}/csv — BOM 포함 CSV(비 ApiResponse, Blob 그대로)
      downloadCsv(batchId: number): Promise<Blob>;
    };
```

구현(`facilityBookings` 구현 아래, import 에 신규 타입 추가):

```ts
      facilitySubmission: {
        candidates: (params) =>
          jsonOk<SubmissionCandidatesResponse>(
            http.get('admin/facility-bookings/submission/candidates', { searchParams: cleanParams(params) }),
          ),
        create: (payload) =>
          jsonOk<CreateSubmissionBatchResult>(
            http.post('admin/facility-bookings/submission', { json: payload }),
          ),
        downloadCsv: async (batchId) =>
          (await http.get(`admin/facility-bookings/submission/${batchId}/csv`)).blob(),
      },
```

- [ ] **Step 3: 쿼리키 + 훅 작성**

`adminQueryKeys.ts` (import 에 `SubmissionCandidatesParams` 추가):

```ts
  facilitySubmissionAll: ['admin', 'facility-submission'] as const,
  facilitySubmissionCandidates: (params: SubmissionCandidatesParams) =>
    [...adminQueryKeys.facilitySubmissionAll, 'candidates', params] as const,
```

`facilitySubmissionAdmin.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSubmissionBatchPayload, SubmissionCandidatesParams } from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

export function useSubmissionCandidatesQuery(params: SubmissionCandidatesParams | null) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      params !== null
        ? adminQueryKeys.facilitySubmissionCandidates(params)
        : ([...adminQueryKeys.facilitySubmissionAll, 'candidates-none'] as const),
    queryFn: () => {
      if (params === null) throw new Error('facilityId is required');
      return client.admin.facilitySubmission.candidates(params);
    },
    enabled: params !== null,
  });
}

function useSubmissionInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilitySubmissionAll });
  };
}

export function useCreateSubmissionBatchMutation() {
  const client = useApiClient();
  const invalidate = useSubmissionInvalidation();
  return useMutation({
    mutationFn: (payload: CreateSubmissionBatchPayload) => client.admin.facilitySubmission.create(payload),
    onSettled: invalidate,
  });
}

export function useDownloadSubmissionCsvMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (input: { batchId: number }) => client.admin.facilitySubmission.downloadCsv(input.batchId),
  });
}
```

`hooks/src/index.ts` 에 export 추가(기존 나열 방식 그대로).

- [ ] **Step 4: Blob 다운로드 헬퍼**

`downloadFile.ts` 전체를 다음으로 교체(기존 `downloadTextFile` 동작 불변 — 위임):

```ts
export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Firefox 는 click 직후 동기 revoke 시 다운로드가 깨질 수 있어 다음 틱으로 미룬다.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/csv;charset=utf-8',
): void {
  downloadBlobFile(filename, new Blob([content], { type: mimeType }));
}
```

- [ ] **Step 5: 타입체크 + 기존 스위트 회귀 확인**

Run: `cd frontend && pnpm typecheck && pnpm --filter @duing/web test`
Expected: 둘 다 성공(다운로드 헬퍼 소비처 기존 테스트 포함 무회귀)

- [ ] **Step 6: 커밋**

```bash
git add frontend/packages/types frontend/packages/api frontend/packages/hooks frontend/apps/web/app/_lib/downloadFile.ts
git commit -m "feat(frontend): 학교 제출 타입·API 클라이언트·훅 추가"
```

---

### Task 2: 시간표 렌더 계획 빌더 (순수 로직 + 유닛 테스트)

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_lib/submissionTimetable.ts`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-timetable-plan.test.ts`

**Interfaces:**
- Consumes: Task 1 `SubmissionCandidateBooking`
- Produces(Task 3 소비):
  - `SUBMISSION_HOURS: number[]` (9..21, 13칸 — 칸 i = [i+9시, i+10시) 슬롯)
  - `buildSubmissionRows(bookings) → SubmissionTimetableRow[]` — `{ dateIso: string; entries: SubmissionPlanEntry[] }`, entries 길이 13, `{ type: 'block'; booking; colSpan } | { type: 'empty' } | { type: 'covered' }`
  - `submissionBlockVisual(booking) → { container: string; nameClass: string; badge: string | null }` — 상태 색 맵 단일 출처

- [ ] **Step 1: 실패하는 유닛 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import {
  SUBMISSION_HOURS,
  buildSubmissionRows,
  submissionBlockVisual,
} from '../../../app/admin/facility-bookings/submission/_lib/submissionTimetable';

function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    clubId: 10,
    clubName: '합주부',
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

describe('buildSubmissionRows', () => {
  it('시간축은 09~21 시작시각 13칸이다', () => {
    expect(SUBMISSION_HOURS).toHaveLength(13);
    expect(SUBMISSION_HOURS[0]).toBe(9);
    expect(SUBMISSION_HOURS[12]).toBe(21);
  });

  it('18~21시 예약은 colSpan 3 블록이 되고 덮인 칸은 covered 로 표시된다', () => {
    const rows = buildSubmissionRows([makeBooking()]);

    expect(rows).toHaveLength(1);
    const entries = rows[0]!.entries;
    expect(entries).toHaveLength(13);
    const blockIndex = 18 - 9;
    expect(entries[blockIndex]).toMatchObject({ type: 'block', colSpan: 3 });
    expect(entries[blockIndex + 1]).toEqual({ type: 'covered' });
    expect(entries[blockIndex + 2]).toEqual({ type: 'covered' });
    expect(entries[blockIndex + 3]).toEqual({ type: 'empty' });
  });

  it('예약이 있는 날짜만 행이 되고 날짜 오름차순으로 정렬된다', () => {
    const rows = buildSubmissionRows([
      makeBooking({ bookingId: 2, reservationDate: '2026-08-03', startTime: '09:00', endTime: '10:00' }),
      makeBooking({ bookingId: 1, reservationDate: '2026-08-01' }),
    ]);

    expect(rows.map((row) => row.dateIso)).toEqual(['2026-08-01', '2026-08-03']);
  });

  it('같은 날 시간이 겹치는 뒤 블록은 빈 구간에 맞춰 축소 배치된다(대기 vs 승인 공존)', () => {
    const rows = buildSubmissionRows([
      makeBooking({ bookingId: 1, startTime: '10:00', endTime: '12:00' }),
      makeBooking({ bookingId: 2, status: 'PENDING', selectable: false, startTime: '11:00', endTime: '13:00' }),
    ]);

    const entries = rows[0]!.entries;
    expect(entries[1]).toMatchObject({ type: 'block', colSpan: 2 }); // 10~12
    // 11~13 중 11~12 는 선점됨 → 12~13 한 칸으로 축소
    expect(entries[3]).toMatchObject({ type: 'block', colSpan: 1 });
  });

  it('09시 이전·22시 이후 구간은 시간축으로 클램프된다', () => {
    const rows = buildSubmissionRows([
      makeBooking({ startTime: '08:00', endTime: '10:00' }),
    ]);

    expect(rows[0]!.entries[0]).toMatchObject({ type: 'block', colSpan: 1 }); // 09~10 만
  });
});

describe('submissionBlockVisual', () => {
  it('선택 가능(미제출 APPROVED)은 ink 강조·뱃지 없음', () => {
    const visual = submissionBlockVisual(makeBooking());
    expect(visual.container).toContain('border-ink');
    expect(visual.badge).toBeNull();
  });

  it('제출 완료는 sage 계열이고 CONFIRMED 는 「등록완료」 뱃지가 붙는다', () => {
    expect(submissionBlockVisual(makeBooking({ submitted: true, selectable: false })).container).toContain('sage');
    expect(submissionBlockVisual(makeBooking({ status: 'CONFIRMED', selectable: false })).badge).toBe('등록완료');
  });

  it('PENDING 은 회색, CANCELLED 는 coral 소거, CONFLICT 는 warm+「충돌」이다', () => {
    expect(submissionBlockVisual(makeBooking({ status: 'PENDING', selectable: false })).container).toContain('graysoft');
    expect(submissionBlockVisual(makeBooking({ status: 'CANCELLED', selectable: false })).container).toContain('coral');
    const conflict = submissionBlockVisual(makeBooking({ status: 'CONFLICT', selectable: false }));
    expect(conflict.container).toContain('warm');
    expect(conflict.badge).toBe('충돌');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-timetable-plan`
Expected: FAIL (모듈 미존재)

- [ ] **Step 3: 구현**

`submissionTimetable.ts`:

```ts
import type { SubmissionCandidateBooking } from '@duing/types';

// 09:00~22:00 — 칸 i = [9+i시, 10+i시). facilitybooking 도메인 슬롯 규칙과 동일 축.
export const SUBMISSION_HOURS = Array.from({ length: 13 }, (_, index) => 9 + index);

export type SubmissionPlanBlock = {
  type: 'block';
  booking: SubmissionCandidateBooking;
  colSpan: number;
};
export type SubmissionPlanEntry = SubmissionPlanBlock | { type: 'empty' } | { type: 'covered' };

export type SubmissionTimetableRow = {
  dateIso: string;
  entries: SubmissionPlanEntry[];
};

const hourIndexOf = (time: string) => Number(time.slice(0, 2)) - 9;

/**
 * 세로=날짜 · 가로=시간 시간표의 행 렌더 계획(스펙 §7) — WeekTimetable 의 rowSpan 병합 계획을 colSpan 으로 전치.
 * 예약이 있는 날짜만 행이 되고, 겹치는 뒤 블록(PENDING vs APPROVED 공존 가능)은 남은 빈 구간에 축소 배치한다
 * — 완전히 덮이면 시간표에선 생략되지만 목록 뷰가 전 건을 보여주므로 정보 손실은 없다.
 */
export function buildSubmissionRows(bookings: SubmissionCandidateBooking[]): SubmissionTimetableRow[] {
  const byDate = new Map<string, SubmissionCandidateBooking[]>();
  for (const booking of bookings) {
    const dayBookings = byDate.get(booking.reservationDate) ?? [];
    dayBookings.push(booking);
    byDate.set(booking.reservationDate, dayBookings);
  }
  return [...byDate.entries()]
    .sort(([leftIso], [rightIso]) => leftIso.localeCompare(rightIso))
    .map(([dateIso, dayBookings]) => ({ dateIso, entries: buildRowEntries(dayBookings) }));
}

function buildRowEntries(dayBookings: SubmissionCandidateBooking[]): SubmissionPlanEntry[] {
  const entries = new Array<SubmissionPlanEntry | undefined>(SUBMISSION_HOURS.length).fill(undefined);
  const ordered = [...dayBookings].sort(
    (left, right) => left.startTime.localeCompare(right.startTime) || left.bookingId - right.bookingId,
  );
  for (const booking of ordered) {
    const start = Math.max(0, hourIndexOf(booking.startTime));
    const end = Math.min(SUBMISSION_HOURS.length, hourIndexOf(booking.endTime));
    // 선점된 칸을 피해 첫 빈 칸부터 다음 점유 칸 직전까지 축소 배치.
    let placeStart = start;
    while (placeStart < end && entries[placeStart] !== undefined) placeStart += 1;
    if (placeStart >= end) continue;
    let placeEnd = placeStart;
    while (placeEnd < end && entries[placeEnd] === undefined) placeEnd += 1;
    entries[placeStart] = { type: 'block', booking, colSpan: placeEnd - placeStart };
    for (let index = placeStart + 1; index < placeEnd; index += 1) entries[index] = { type: 'covered' };
  }
  return SUBMISSION_HOURS.map((_, index) => entries[index] ?? { type: 'empty' });
}

type BlockVisual = {
  container: string;
  nameClass: string;
  badge: string | null;
};

/** 상태 색 맵의 단일 출처(스펙 §7) — 시간표 블록·목록 상태 배지가 공유한다. */
export function submissionBlockVisual(booking: SubmissionCandidateBooking): BlockVisual {
  if (booking.status === 'CANCELLED') {
    return { container: 'border-coral/40 bg-coral/10 opacity-70', nameClass: 'text-coral line-through', badge: null };
  }
  if (booking.status === 'CONFLICT') {
    return { container: 'border-warm/60 bg-warm/20', nameClass: 'text-[#8E6620]', badge: '충돌' };
  }
  if (booking.status === 'CONFIRMED') {
    return { container: 'border-sage bg-sage/30', nameClass: 'text-ink-deep', badge: '등록완료' };
  }
  if (booking.submitted) {
    return { container: 'border-sage-soft bg-sage-mist', nameClass: 'text-ink-deep', badge: null };
  }
  if (booking.selectable) {
    return { container: 'border-ink bg-paper hover:bg-sage-mist', nameClass: 'text-ink-deep', badge: null };
  }
  // PENDING(승인 대기) — 회색.
  return { container: 'border-line bg-graysoft/60', nameClass: 'text-charcoal-3', badge: null };
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-timetable-plan`
Expected: PASS (8/8)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 학교 제출 시간표 렌더 계획 빌더 구현"
```

---

### Task 3: SubmissionTimetable 컴포넌트 (+Tooltip·상세 Sheet)

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionTimetable.tsx`
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionDetailSheet.tsx`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-timetable.test.tsx`

**Interfaces:**
- Consumes: Task 2 `buildSubmissionRows`/`submissionBlockVisual`/`SUBMISSION_HOURS`, Task 1 타입, `@/components/ui/sheet`
- Produces(Task 5 소비):
  - `SubmissionTimetable({ bookings, facilityName, selection, onToggleSelect, onShowDetail })` — `selection: ReadonlySet<number>`, `onToggleSelect(bookingId: number)`, `onShowDetail(booking: SubmissionCandidateBooking)`
  - `SubmissionDetailSheet({ booking, facilityName, onClose })` — `booking: SubmissionCandidateBooking | null`(null=닫힘)

- [ ] **Step 1: 실패하는 컴포넌트 테스트 작성**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import { SubmissionTimetable } from '../../../app/admin/facility-bookings/submission/_components/SubmissionTimetable';

function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    clubId: 10,
    clubName: '합주부',
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

describe('SubmissionTimetable', () => {
  it('블록에 동아리명·시간·인원이 함께 표시된다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking()]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText('합주부')).toBeInTheDocument();
    expect(screen.getByText('18:00~21:00')).toBeInTheDocument();
    expect(screen.getByText('30명')).toBeInTheDocument();
  });

  it('인원이 없으면 사용목적을 대신 표시한다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking({ attendeeCount: null })]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText('정기 합주')).toBeInTheDocument();
  });

  it('선택 가능한 블록 클릭은 선택 토글을 호출하고 aria-pressed 로 상태를 알린다', () => {
    const onToggleSelect = vi.fn();
    render(
      <SubmissionTimetable
        bookings={[makeBooking()]}
        facilityName="커뮤니티룸(1)"
        selection={new Set([1])}
        onToggleSelect={onToggleSelect}
        onShowDetail={vi.fn()}
      />,
    );

    const block = screen.getByRole('button', { name: /합주부/ });
    expect(block).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(block);
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it('선택 불가 블록(제출 완료) 클릭은 상세 열람을 호출한다', () => {
    const onShowDetail = vi.fn();
    const submitted = makeBooking({ submitted: true, selectable: false, submissionNo: 'SUB-20260801-001' });
    render(
      <SubmissionTimetable
        bookings={[submitted]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={onShowDetail}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /합주부/ }));
    expect(onShowDetail).toHaveBeenCalledWith(submitted);
  });

  it('hover 툴팁 내용(신청자·연락처·승인자)이 렌더된다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking()]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText(/홍길동/)).toBeInTheDocument();
    expect(screen.getByText(/010-1234-5678/)).toBeInTheDocument();
    expect(screen.getByText(/관리자/)).toBeInTheDocument();
  });

  it('CONFIRMED 블록에는 등록완료 뱃지가 붙는다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking({ status: 'CONFIRMED', selectable: false })]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText('등록완료')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-timetable.test`
Expected: FAIL

- [ ] **Step 3: 구현**

`SubmissionTimetable.tsx`:

```tsx
'use client';

import type { SubmissionCandidateBooking } from '@duing/types';
import {
  SUBMISSION_HOURS,
  buildSubmissionRows,
  submissionBlockVisual,
} from '../_lib/submissionTimetable';

const pad2 = (value: number) => String(value).padStart(2, '0');

type Props = {
  bookings: SubmissionCandidateBooking[];
  facilityName: string;
  selection: ReadonlySet<number>;
  onToggleSelect: (bookingId: number) => void;
  onShowDetail: (booking: SubmissionCandidateBooking) => void;
};

/**
 * 학교 제출 시간표(스펙 §7) — 세로=날짜·가로=시간(09~22 13칸), 예약=colSpan 병합 블록.
 * selectable 블록 클릭=선택 토글(상세는 hover 툴팁), 그 외 블록 클릭=우측 Sheet 상세.
 * 모바일은 가로 스크롤 + 날짜 열 sticky.
 */
export function SubmissionTimetable({ bookings, facilityName, selection, onToggleSelect, onShowDetail }: Props) {
  const rows = buildSubmissionRows(bookings);

  if (rows.length === 0) {
    return <p className="text-sm text-charcoal-3">이 기간에 표시할 예약이 없어요.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-center">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-16 bg-cream" aria-hidden />
            {SUBMISSION_HOURS.map((hour) => (
              <th key={hour} className="p-1 font-mono text-[10px] font-medium text-charcoal-3">
                {pad2(hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dateIso}>
              <td className="sticky left-0 z-10 bg-cream pr-1.5 text-right align-middle">
                <span className="font-mono text-[11px] font-bold text-charcoal">
                  {row.dateIso.slice(5).replace('-', '/')}
                </span>
              </td>
              {row.entries.map((entry, columnIndex) => {
                if (entry.type === 'covered') return null;
                if (entry.type === 'empty') {
                  return (
                    <td key={columnIndex} className="p-[2px]">
                      <div aria-hidden className="h-12 rounded-[5px] border border-line/40" />
                    </td>
                  );
                }
                const { booking, colSpan } = entry;
                const visual = submissionBlockVisual(booking);
                const selected = selection.has(booking.bookingId);
                const subText =
                  booking.attendeeCount !== null ? `${booking.attendeeCount}명` : booking.purpose;
                return (
                  <td key={columnIndex} colSpan={colSpan} className="relative p-[2px]">
                    {/* group: hover 툴팁 트리거 — 라이브러리 없이 CSS 로만(경량 커스텀 툴팁, 스펙 §7). */}
                    <div className="group relative">
                      <button
                        type="button"
                        aria-pressed={booking.selectable ? selected : undefined}
                        aria-label={`${row.dateIso} ${booking.startTime}~${booking.endTime} ${booking.clubName ?? '동아리'}${selected ? ' · 선택됨' : ''}`}
                        onClick={
                          booking.selectable
                            ? () => onToggleSelect(booking.bookingId)
                            : () => onShowDetail(booking)
                        }
                        className={`flex h-12 w-full flex-col justify-center gap-0.5 overflow-hidden rounded-[5px] border px-1.5 py-1 text-left leading-tight motion-safe:transition-colors ${
                          selected ? 'border-sage bg-ink text-cream shadow-sm' : visual.container
                        }`}
                      >
                        <span className={`flex items-center gap-1 truncate text-[11px] font-bold ${selected ? 'text-cream' : visual.nameClass}`}>
                          <span className="truncate">{booking.clubName ?? '동아리'}</span>
                          {visual.badge !== null && (
                            <span className="shrink-0 rounded-sm border border-current px-0.5 text-[9px] font-medium">
                              {visual.badge}
                            </span>
                          )}
                        </span>
                        <span className={`truncate font-mono text-[10px] ${selected ? 'text-cream/80' : 'text-charcoal-3'}`}>
                          {booking.startTime}~{booking.endTime} · {subText}
                        </span>
                      </button>
                      {/* hover 툴팁 — jsdom 은 hover 를 못 내므로 내용 존재만 테스트(실브라우저 QA 로 위치 검증). */}
                      <div
                        role="presentation"
                        className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-56 rounded-md border border-line bg-paper p-2 text-left text-[11px] leading-relaxed text-charcoal shadow-md group-hover:block"
                      >
                        <p className="font-bold text-ink-deep">{booking.clubName ?? '동아리'}</p>
                        <p>{facilityName} · {booking.reservationDate} {booking.startTime}~{booking.endTime}</p>
                        <p>신청자 {booking.applicantName ?? '-'} · {booking.contactPhone ?? '-'}</p>
                        <p>목적 {booking.purpose}{booking.attendeeCount !== null ? ` · ${booking.attendeeCount}명` : ''}</p>
                        <p>승인 {booking.decidedByName ?? '-'}{booking.decidedAt !== null ? ` · ${booking.decidedAt.slice(0, 10)}` : ''}</p>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`SubmissionDetailSheet.tsx`:

```tsx
'use client';

import type { SubmissionCandidateBooking } from '@duing/types';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { submissionBlockVisual } from '../_lib/submissionTimetable';

const STATUS_LABELS: Record<SubmissionCandidateBooking['status'], string> = {
  PENDING: '승인 대기',
  APPROVED: '승인 완료',
  CONFIRMED: '학교 등록 완료',
  CONFLICT: '충돌',
  CANCELLED: '취소됨',
};

type Props = {
  booking: SubmissionCandidateBooking | null;
  facilityName: string;
  onClose: () => void;
};

/** 비-selectable 블록·목록 행의 상세 열람용 우측 Drawer(스펙 §7). */
export function SubmissionDetailSheet({ booking, facilityName, onClose }: Props) {
  return (
    <Sheet open={booking !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right">
        {booking !== null && (
          <>
            <SheetHeader>
              <SheetTitle>{booking.clubName ?? '동아리'} 예약 상세</SheetTitle>
              <SheetDescription>
                {facilityName} · {booking.reservationDate} {booking.startTime}~{booking.endTime}
              </SheetDescription>
            </SheetHeader>
            <dl className="mt-4 space-y-2 text-sm text-charcoal">
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">상태</dt>
                <dd className={submissionBlockVisual(booking).nameClass}>
                  {STATUS_LABELS[booking.status]}
                  {booking.submitted && booking.submissionNo !== null ? ` · ${booking.submissionNo}` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">신청자</dt><dd>{booking.applicantName ?? '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">연락처</dt><dd>{booking.contactPhone ?? '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">사용목적</dt><dd className="text-right">{booking.purpose}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">사용인원</dt><dd>{booking.attendeeCount !== null ? `${booking.attendeeCount}명` : '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">승인자</dt><dd>{booking.decidedByName ?? '-'}</dd></div>
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">승인일</dt>
                <dd>{booking.decidedAt !== null ? booking.decidedAt.slice(0, 10) : '-'}</dd>
              </div>
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-timetable.test`
Expected: PASS (6/6)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 학교 제출 시간표 뷰·예약 상세 Drawer 구현"
```

---

### Task 4: SubmissionListTable (체크박스 다중 선택)

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionListTable.tsx`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-list-table.test.tsx`

**Interfaces:**
- Consumes: Task 1 타입, Task 2 `submissionBlockVisual`(상태 배지 톤), Task 3 과 동일 선택 콜백
- Produces(Task 5 소비): `SubmissionListTable({ bookings, selection, onToggleSelect, onToggleAll, onShowDetail })` — `onToggleAll(nextSelected: boolean)`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import { SubmissionListTable } from '../../../app/admin/facility-bookings/submission/_components/SubmissionListTable';

function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    clubId: 10,
    clubName: '합주부',
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

describe('SubmissionListTable', () => {
  it('행 체크박스는 selectable 행만 활성이고 토글 콜백을 호출한다', () => {
    const onToggleSelect = vi.fn();
    render(
      <SubmissionListTable
        bookings={[makeBooking(), makeBooking({ bookingId: 2, status: 'PENDING', selectable: false })]}
        selection={new Set()}
        onToggleSelect={onToggleSelect}
        onToggleAll={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // [0]=전체 선택, [1]=selectable 행, [2]=비활성 행
    expect(checkboxes[2]).toBeDisabled();
    fireEvent.click(checkboxes[1]!);
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it('전체 선택 체크박스는 선택 가능 전 건 기준으로 checked·indeterminate 를 표시한다', () => {
    const { rerender } = render(
      <SubmissionListTable
        bookings={[makeBooking(), makeBooking({ bookingId: 2 })]}
        selection={new Set([1])}
        onToggleSelect={vi.fn()}
        onToggleAll={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );
    const headerCheckbox = () => screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    expect(headerCheckbox().indeterminate).toBe(true);

    rerender(
      <SubmissionListTable
        bookings={[makeBooking(), makeBooking({ bookingId: 2 })]}
        selection={new Set([1, 2])}
        onToggleSelect={vi.fn()}
        onToggleAll={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );
    expect(headerCheckbox().checked).toBe(true);
    expect(headerCheckbox().indeterminate).toBe(false);
  });

  it('전체 선택 클릭은 onToggleAll 을 다음 상태(boolean)와 함께 호출한다', () => {
    const onToggleAll = vi.fn();
    render(
      <SubmissionListTable
        bookings={[makeBooking()]}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleAll={onToggleAll}
        onShowDetail={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(onToggleAll).toHaveBeenCalledWith(true);
  });

  it('행에 시설 제출 업무에 필요한 컬럼이 표시되고 상세 버튼이 동작한다', () => {
    const onShowDetail = vi.fn();
    const booking = makeBooking({ submitted: true, selectable: false, submissionNo: 'SUB-20260801-001' });
    render(
      <SubmissionListTable
        bookings={[booking]}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleAll={vi.fn()}
        onShowDetail={onShowDetail}
      />,
    );

    expect(screen.getByText('합주부')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
    expect(screen.getByText('18:00~21:00')).toBeInTheDocument();
    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('SUB-20260801-001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '상세' }));
    expect(onShowDetail).toHaveBeenCalledWith(booking);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-list-table`
Expected: FAIL

- [ ] **Step 3: 구현**

```tsx
'use client';

import type { SubmissionCandidateBooking } from '@duing/types';
import { submissionBlockVisual } from '../_lib/submissionTimetable';

const STATUS_LABELS: Record<SubmissionCandidateBooking['status'], string> = {
  PENDING: '승인 대기',
  APPROVED: '승인 완료',
  CONFIRMED: '등록 완료',
  CONFLICT: '충돌',
  CANCELLED: '취소됨',
};

type Props = {
  bookings: SubmissionCandidateBooking[];
  selection: ReadonlySet<number>;
  onToggleSelect: (bookingId: number) => void;
  onToggleAll: (nextSelected: boolean) => void;
  onShowDetail: (booking: SubmissionCandidateBooking) => void;
};

/** 목록 보기(스펙 §7) — 시간표와 동일 데이터·동일 선택 상태. admin 첫 select-all/indeterminate 테이블. */
export function SubmissionListTable({ bookings, selection, onToggleSelect, onToggleAll, onShowDetail }: Props) {
  const selectableIds = bookings.filter((booking) => booking.selectable).map((booking) => booking.bookingId);
  const selectedCount = selectableIds.filter((bookingId) => selection.has(bookingId)).length;
  const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-charcoal-3">
            <th className="w-10 px-2 py-2">
              <input
                type="checkbox"
                aria-label="선택 가능한 예약 전체 선택"
                disabled={selectableIds.length === 0}
                checked={allSelected}
                ref={(element) => {
                  if (element !== null) element.indeterminate = selectedCount > 0 && !allSelected;
                }}
                onChange={() => onToggleAll(!allSelected)}
              />
            </th>
            <th className="px-2 py-2">예약일</th>
            <th className="px-2 py-2">시간</th>
            <th className="px-2 py-2">동아리</th>
            <th className="px-2 py-2">신청자</th>
            <th className="px-2 py-2">사용목적</th>
            <th className="px-2 py-2">인원</th>
            <th className="px-2 py-2">승인일</th>
            <th className="px-2 py-2">상태</th>
            <th className="w-14 px-2 py-2" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => {
            const visual = submissionBlockVisual(booking);
            return (
              <tr key={booking.bookingId} className="border-b border-line/60">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label={`${booking.clubName ?? '동아리'} ${booking.reservationDate} 선택`}
                    disabled={!booking.selectable}
                    checked={selection.has(booking.bookingId)}
                    onChange={() => onToggleSelect(booking.bookingId)}
                  />
                </td>
                <td className="px-2 py-2 font-mono text-xs">{booking.reservationDate}</td>
                <td className="px-2 py-2 font-mono text-xs">{booking.startTime}~{booking.endTime}</td>
                <td className="px-2 py-2 font-medium text-ink-deep">{booking.clubName ?? '-'}</td>
                <td className="px-2 py-2">{booking.applicantName ?? '-'}</td>
                <td className="max-w-40 truncate px-2 py-2">{booking.purpose}</td>
                <td className="px-2 py-2 tabular-nums">{booking.attendeeCount ?? '-'}</td>
                <td className="px-2 py-2 font-mono text-xs">
                  {booking.decidedAt !== null ? booking.decidedAt.slice(0, 10) : '-'}
                </td>
                <td className="px-2 py-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${visual.container}`}>
                    <span className={visual.nameClass}>{STATUS_LABELS[booking.status]}</span>
                  </span>
                  {booking.submitted && booking.submissionNo !== null && (
                    <span className="ml-1 font-mono text-[10px] text-charcoal-3">{booking.submissionNo}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShowDetail(booking)}>
                    상세
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-list-table`
Expected: PASS (4/4)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 학교 제출 목록 뷰·체크박스 다중 선택 구현"
```

---

### Task 5: Summary 카드 + 페이지 조립(탭 셸·필터·뷰 토글) + 메뉴 추가

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionSummaryCards.tsx`
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_pages/AdminSubmissionPage.tsx`
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/page.tsx` (Server Component — `admin/facility-bookings/page.tsx` 사이드 파일 패턴 복제)
- Modify: `frontend/apps/web/app/admin/_lib/adminSections.ts` (항목 1개)
- Test: `frontend/apps/web/test/admin/facility-submission/admin-submission-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 훅·타입, Task 3 `SubmissionTimetable`/`SubmissionDetailSheet`, Task 4 `SubmissionListTable`
- Produces(Task 6 소비): `AdminSubmissionPage` 내부의 선택 상태(`selection`)·`selectableIdSet`·액션 바(생성 버튼 자리) — Task 6 이 이 파일에 Dialog·생성 플로우를 잇는다

- [ ] **Step 1: 실패하는 페이지 테스트 작성**

훅 모듈 모킹 관례(`admin-bookings-page.test.tsx` 사이드 파일)를 따른다. Task 6 이 같은 파일에 플로우 테스트를 추가하므로 뮤테이션 훅도 미리 모킹해 둔다.

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidatesResponse } from '@duing/types';

const mockCandidatesQuery = vi.fn();
const mockUsageQuery = vi.fn();
const mockCreateMutation = vi.fn();
const mockCsvMutation = vi.fn();
const mockAddToast = vi.fn();

vi.mock('@duing/hooks', () => ({
  useSubmissionCandidatesQuery: (...args: unknown[]) => mockCandidatesQuery(...args),
  useFacilityUsageQuery: () => mockUsageQuery(),
  useCreateSubmissionBatchMutation: () => mockCreateMutation(),
  useDownloadSubmissionCsvMutation: () => mockCsvMutation(),
}));
vi.mock('../../../app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));
vi.mock('../../../app/_lib/downloadFile', () => ({
  downloadBlobFile: vi.fn(),
}));

import { AdminSubmissionPage } from '../../../app/admin/facility-bookings/submission/_pages/AdminSubmissionPage';

function makeResponse(): SubmissionCandidatesResponse {
  return {
    summary: { approvedCount: 2, awaitingCount: 1, submittedCount: 1, confirmedCount: 1 },
    bookings: [
      {
        bookingId: 1, clubId: 10, clubName: '합주부', applicantName: '홍길동', contactPhone: '010-1234-5678',
        reservationDate: '2026-08-01', startTime: '18:00', endTime: '21:00', purpose: '정기 합주',
        attendeeCount: 30, status: 'APPROVED', submitted: false, selectable: true,
        submissionNo: null, decidedByName: '관리자', decidedAt: '2026-07-20T10:00:00',
      },
      {
        bookingId: 2, clubId: 11, clubName: '농구부', applicantName: '김철수', contactPhone: null,
        reservationDate: '2026-08-02', startTime: '09:00', endTime: '10:00', purpose: '연습',
        attendeeCount: null, status: 'CONFIRMED', submitted: true, selectable: false,
        submissionNo: 'SUB-20260801-001', decidedByName: '관리자', decidedAt: '2026-07-20T10:00:00',
      },
    ],
  };
}

const querySuccess = (response: SubmissionCandidatesResponse) => ({
  data: response, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn(),
});
const queryIdle = { data: undefined, isLoading: false, isSuccess: false, isError: false, refetch: vi.fn() };

describe('AdminSubmissionPage', () => {
  beforeEach(() => {
    mockCandidatesQuery.mockReset();
    mockUsageQuery.mockReset();
    mockCreateMutation.mockReset();
    mockCsvMutation.mockReset();
    mockAddToast.mockReset();
    mockUsageQuery.mockReturnValue({ data: { facilities: [{ id: 100, roomName: '커뮤니티룸(1)' }] } });
    mockCandidatesQuery.mockReturnValue(queryIdle);
    mockCreateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockCsvMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('시설을 선택하기 전에는 안내가 보이고 후보 쿼리는 null 파라미터로 비활성이다', () => {
    render(<AdminSubmissionPage />);

    expect(screen.getByText(/시설을 선택/)).toBeInTheDocument();
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(null);
  });

  it('시설을 선택하면 기간(기본 이번 달)과 함께 후보를 조회하고 Summary 4카드를 보여준다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);

    fireEvent.change(screen.getByLabelText('시설 선택'), { target: { value: '100' } });

    const lastParams = mockCandidatesQuery.mock.calls.at(-1)?.[0] as { facilityId: number; startDate: string; endDate: string };
    expect(lastParams.facilityId).toBe(100);
    expect(lastParams.startDate.endsWith('-01')).toBe(true);
    expect(screen.getByText('승인 완료')).toBeInTheDocument();
    expect(screen.getByText('제출 대기')).toBeInTheDocument();
    expect(screen.getByText('학교 제출 완료')).toBeInTheDocument();
    expect(screen.getByText('학교 등록 완료')).toBeInTheDocument();
  });

  it('Summary 카드 클릭은 해당 분류로 목록을 필터링하고 재클릭 시 전체로 돌아온다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    fireEvent.change(screen.getByLabelText('시설 선택'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('tab', { name: '목록 보기' }));

    fireEvent.click(screen.getByRole('button', { name: /학교 등록 완료/ }));
    expect(screen.queryByText('합주부')).not.toBeInTheDocument();
    expect(screen.getByText('농구부')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /학교 등록 완료/ }));
    expect(screen.getByText('합주부')).toBeInTheDocument();
  });

  it('기간이 31일을 넘으면 조회하지 않고 안내를 보여준다', () => {
    render(<AdminSubmissionPage />);
    fireEvent.change(screen.getByLabelText('시설 선택'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-09-05' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/31일/);
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(null);
  });

  it('제출 이력 탭은 준비 중 안내를 보여준다', () => {
    render(<AdminSubmissionPage />);

    fireEvent.click(screen.getByRole('tab', { name: '제출 이력' }));
    expect(screen.getByText(/준비 중/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- admin-submission-page`
Expected: FAIL

- [ ] **Step 3: SubmissionSummaryCards 구현**

```tsx
'use client';

import type { SubmissionSummaryCounts } from '@duing/types';

export type SummaryFilter = 'ALL' | 'APPROVED' | 'AWAITING' | 'SUBMITTED' | 'CONFIRMED';

type Props = {
  counts: SubmissionSummaryCounts;
  activeFilter: SummaryFilter;
  onSelectFilter: (filter: SummaryFilter) => void;
};

/** Summary 4카드(스펙 §7) — 클릭=필터 토글(재클릭 시 전체). BookingSummaryCards 의 aria-pressed 패턴. */
export function SubmissionSummaryCards({ counts, activeFilter, onSelectFilter }: Props) {
  const cards: { filter: Exclude<SummaryFilter, 'ALL'>; label: string; value: number; sub: string }[] = [
    { filter: 'APPROVED', label: '승인 완료', value: counts.approvedCount, sub: '제출 여부 무관 APPROVED' },
    { filter: 'AWAITING', label: '제출 대기', value: counts.awaitingCount, sub: '승인 완료 · 미제출' },
    { filter: 'SUBMITTED', label: '학교 제출 완료', value: counts.submittedCount, sub: '활성 Batch 포함' },
    { filter: 'CONFIRMED', label: '학교 등록 완료', value: counts.confirmedCount, sub: '학교 시스템 등록됨' },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <li key={card.filter}>
          <button
            type="button"
            aria-pressed={activeFilter === card.filter}
            onClick={() => onSelectFilter(activeFilter === card.filter ? 'ALL' : card.filter)}
            className={`w-full rounded-xl border p-4 text-left motion-safe:transition-colors ${
              activeFilter === card.filter ? 'border-ink bg-ink/5' : 'border-line bg-paper hover:border-sage'
            }`}
          >
            <p className="text-sm text-charcoal-3">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink-deep">{card.value}</p>
            <p className="mt-0.5 text-xs text-charcoal-3">{card.sub}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: AdminSubmissionPage 조립**

```tsx
'use client';

import { useState } from 'react';
import {
  useCreateSubmissionBatchMutation,
  useDownloadSubmissionCsvMutation,
  useFacilityUsageQuery,
  useSubmissionCandidatesQuery,
} from '@duing/hooks';
import type { SubmissionCandidateBooking, SubmissionCandidatesParams } from '@duing/types';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { downloadBlobFile } from '@/app/_lib/downloadFile';
import { SubmissionDetailSheet } from '../_components/SubmissionDetailSheet';
import { SubmissionListTable } from '../_components/SubmissionListTable';
import { SubmissionSummaryCards, type SummaryFilter } from '../_components/SubmissionSummaryCards';
import { SubmissionTimetable } from '../_components/SubmissionTimetable';

const MAX_PERIOD_DAYS = 31;

type SubmissionTab = 'submit' | 'history';
type ViewMode = 'timetable' | 'list';

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** 기본 조회 기간 = 이번 달 1일~말일(≤31일이라 항상 유효). */
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
  if (filter === 'AWAITING') return booking.selectable;
  if (filter === 'SUBMITTED') return booking.submitted;
  if (filter === 'CONFIRMED') return booking.status === 'CONFIRMED';
  return true;
}

export function AdminSubmissionPage() {
  const defaultRange = currentMonthRange();
  const [activeTab, setActiveTab] = useState<SubmissionTab>('submit');
  const [facilityIdInput, setFacilityIdInput] = useState('');
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [clubIdInput, setClubIdInput] = useState('');
  const [view, setView] = useState<ViewMode>('timetable');
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('ALL');
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [detailBooking, setDetailBooking] = useState<SubmissionCandidateBooking | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { addToast } = useToast();
  const usageQuery = useFacilityUsageQuery();
  const facilityId = facilityIdInput === '' ? undefined : Number(facilityIdInput);
  const facilityName =
    (usageQuery.data?.facilities ?? []).find((facility) => facility.id === facilityId)?.roomName ?? '';

  const periodInvalid =
    endDate < startDate || periodDayCount(startDate, endDate) > MAX_PERIOD_DAYS;
  const candidatesParams: SubmissionCandidatesParams | null =
    facilityId !== undefined && !periodInvalid ? { facilityId, startDate, endDate } : null;
  const candidatesQuery = useSubmissionCandidatesQuery(candidatesParams);
  const createMutation = useCreateSubmissionBatchMutation();
  const csvMutation = useDownloadSubmissionCsvMutation();

  const allBookings = candidatesQuery.data?.bookings ?? [];
  const clubOptions = [...new Map(allBookings.map((booking) => [booking.clubId, booking.clubName])).entries()];
  const clubId = clubIdInput === '' ? undefined : Number(clubIdInput);
  // 동아리 필터는 클라이언트(단일 시설·31일 상한 소량) — 셀렉트 옵션이 필터에 따라 줄지 않도록 전체 응답에서 유도.
  const clubBookings = clubId === undefined ? allBookings : allBookings.filter((booking) => booking.clubId === clubId);
  const visibleBookings = clubBookings.filter((booking) => matchesFilter(booking, summaryFilter));
  const selectableIdSet = new Set(
    visibleBookings.filter((booking) => booking.selectable).map((booking) => booking.bookingId),
  );
  const selectedIds = [...selection].filter((bookingId) => selectableIdSet.has(bookingId));

  const resetSelection = () => setSelection(new Set());
  const toggleSelect = (bookingId: number) =>
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(bookingId)) next.delete(bookingId);
      else next.add(bookingId);
      return next;
    });
  const toggleAll = (nextSelected: boolean) =>
    setSelection(nextSelected ? new Set(selectableIdSet) : new Set());

  const handleCreateConfirm = async (memo: string) => {
    if (selectedIds.length === 0) return;
    try {
      const created = await createMutation.mutateAsync({
        bookingIds: selectedIds,
        memo: memo.trim() === '' ? undefined : memo.trim(),
      });
      setDialogOpen(false);
      resetSelection();
      addToast('학교 제출 Batch가 생성되었습니다.');
      try {
        const csvBlob = await csvMutation.mutateAsync({ batchId: created.batchId });
        downloadBlobFile(created.csvFileName, csvBlob);
      } catch {
        addToast('CSV 자동 다운로드에 실패했어요. 제출 이력에서 다시 받을 수 있어요.', { variant: 'error' });
      }
    } catch (error) {
      addToast(submissionErrorMessage(error), { variant: 'error' });
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-xl text-ink-deep">학교 제출</h1>
        <p className="mt-1 text-sm text-charcoal-3">승인 완료된 예약을 모아 학교 행정실 제출 Batch 를 만들고 CSV 로 내려받습니다.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="학교 제출 탭">
        {([['submit', '제출 대기'], ['history', '제출 이력']] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors ${
              activeTab === tab ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'history' && (
        <p className="text-sm text-charcoal-3">제출 이력은 준비 중이에요. 곧 이 탭에서 확인할 수 있어요.</p>
      )}

      {activeTab === 'submit' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="시설 선택"
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
              value={facilityIdInput}
              onChange={(event) => { setFacilityIdInput(event.target.value); resetSelection(); }}
            >
              <option value="">시설을 선택하세요</option>
              {(usageQuery.data?.facilities ?? []).map((facility) => (
                <option key={facility.id} value={String(facility.id)}>{facility.roomName}</option>
              ))}
            </select>
            <input
              type="date" aria-label="시작일" value={startDate}
              onChange={(event) => { setStartDate(event.target.value); resetSelection(); }}
              className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
            />
            <input
              type="date" aria-label="종료일" value={endDate}
              onChange={(event) => { setEndDate(event.target.value); resetSelection(); }}
              className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
            />
            <select
              aria-label="동아리 필터"
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
              value={clubIdInput}
              onChange={(event) => setClubIdInput(event.target.value)}
            >
              <option value="">전체 동아리</option>
              {clubOptions.map(([optionClubId, optionClubName]) => (
                <option key={optionClubId} value={String(optionClubId)}>{optionClubName ?? `동아리 ${optionClubId}`}</option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-2" role="tablist" aria-label="보기 전환">
              {([['timetable', '시간표 보기'], ['list', '목록 보기']] as const).map(([mode, label]) => (
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

          {facilityId === undefined && (
            <p className="py-10 text-center text-sm text-charcoal-3">학교 제출은 시설 단위로 진행돼요. 먼저 시설을 선택해주세요.</p>
          )}
          {facilityId !== undefined && periodInvalid && (
            <div role="alert" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal-2">
              조회 기간은 시작일부터 최대 31일까지, 역순 없이 선택할 수 있어요.
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

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => toggleAll(!(selectableIdSet.size > 0 && selectedIds.length === selectableIdSet.size))}
                >
                  {selectableIdSet.size > 0 && selectedIds.length === selectableIdSet.size ? '전체 해제' : '전체 선택'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={selectedIds.length === 0}
                  onClick={() => setDialogOpen(true)}
                >
                  선택 {selectedIds.length}건 · 제출 Batch 생성
                </button>
              </div>

              {candidatesQuery.isLoading && <LoadingGate className="min-h-0 py-8" label="제출 대상 불러오는 중" />}
              {!candidatesQuery.isLoading && candidatesQuery.isError && (
                <div role="alert" className="text-sm text-charcoal-2">
                  <p>제출 대상을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
                  <button type="button" className="btn btn-ghost mt-2" onClick={() => void candidatesQuery.refetch()}>
                    다시 시도
                  </button>
                </div>
              )}
              {!candidatesQuery.isLoading && candidatesQuery.isSuccess && visibleBookings.length === 0 && (
                <p className="text-sm text-charcoal-3">
                  {summaryFilter !== 'ALL' || clubId !== undefined
                    ? '필터 조건에 맞는 예약이 없어요.'
                    : '이 기간에 표시할 예약이 없어요.'}
                </p>
              )}
              {!candidatesQuery.isLoading && candidatesQuery.isSuccess && visibleBookings.length > 0 && (
                view === 'timetable' ? (
                  <SubmissionTimetable
                    bookings={visibleBookings}
                    facilityName={facilityName}
                    selection={selection}
                    onToggleSelect={toggleSelect}
                    onShowDetail={setDetailBooking}
                  />
                ) : (
                  <SubmissionListTable
                    bookings={visibleBookings}
                    selection={selection}
                    onToggleSelect={toggleSelect}
                    onToggleAll={toggleAll}
                    onShowDetail={setDetailBooking}
                  />
                )
              )}
            </>
          )}

          <SubmissionDetailSheet booking={detailBooking} facilityName={facilityName} onClose={() => setDetailBooking(null)} />
          {/* Task 6: BatchCreateDialog 를 여기(dialogOpen)와 handleCreateConfirm 에 연결한다. */}
        </>
      )}
    </section>
  );
}

/** 서버 메시지 우선 표출 — AdminUsersPage.forceLogoutErrorMessage 의 추출 방식을 열어 동일하게 맞춘다. */
function submissionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '학교 제출 Batch 생성에 실패했어요. 잠시 후 다시 시도해주세요.';
}
```

주의: Task 5 시점에는 `dialogOpen`·`handleCreateConfirm` 이 선언만 있고 Dialog 미연결(주석 표시) — Task 6 이 완성한다. 미사용 경고가 lint 를 깨면 Task 5 에서는 생성 버튼 `onClick` 을 그대로 두고 Dialog 자리 주석만 유지한다(빌드 게이트는 Task 6 이후 최종 확인).

`page.tsx` (사이드 파일 `admin/facility-bookings/page.tsx` 를 열어 export 형태·metadata 유무를 그대로 복제):

```tsx
import { AdminSubmissionPage } from './_pages/AdminSubmissionPage';

export default function Page() {
  return <AdminSubmissionPage />;
}
```

`adminSections.ts` — 시설 예약 관리 항목 바로 아래에 추가:

```ts
  {
    href: '/admin/facility-bookings/submission',
    title: '학교 제출',
    description: '승인 예약 학교 제출 Batch 생성·CSV 다운로드·이력 관리',
    group: '동아리',
  },
```

- [ ] **Step 5: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- admin-submission-page`
Expected: PASS (5/5)

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/admin frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 학교 제출 페이지 조립 — 탭·필터·Summary·뷰 전환"
```

---

### Task 6: Batch 생성 Dialog + CSV 자동 다운로드 플로우

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/BatchCreateDialog.tsx`
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/_pages/AdminSubmissionPage.tsx` (Dialog 연결)
- Test: `frontend/apps/web/test/admin/facility-submission/admin-submission-page.test.tsx` (플로우 테스트 추가)

**Interfaces:**
- Consumes: Task 5 의 `dialogOpen`/`handleCreateConfirm`/`selectedIds`, Task 1 뮤테이션 훅·`downloadBlobFile`
- Produces: `BatchCreateDialog({ open, selectedCount, pending, onClose, onConfirm })`

- [ ] **Step 1: 실패하는 플로우 테스트 추가** (기존 페이지 테스트 파일에)

```tsx
import { waitFor } from '@testing-library/react';
import { downloadBlobFile } from '../../../app/_lib/downloadFile';

  it('선택 후 생성 확인까지 진행하면 Batch 생성·토스트·CSV 자동 다운로드가 이어진다', async () => {
    const createMutateAsync = vi.fn().mockResolvedValue({
      batchId: 7, submissionNo: 'SUB-20260801-002', csvFileName: 'facility-submission-SUB-20260801-002.csv',
    });
    const csvBlob = new Blob(['csv'], { type: 'text/csv' });
    const csvMutateAsync = vi.fn().mockResolvedValue(csvBlob);
    mockCreateMutation.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false });
    mockCsvMutation.mockReturnValue({ mutateAsync: csvMutateAsync, isPending: false });
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    fireEvent.change(screen.getByLabelText('시설 선택'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('tab', { name: '목록 보기' }));

    // selectable 행(합주부) 선택 → 생성 버튼 → Dialog 확인
    fireEvent.click(screen.getByRole('checkbox', { name: /합주부/ }));
    fireEvent.click(screen.getByRole('button', { name: /제출 Batch 생성/ }));
    expect(screen.getByText(/총 1건의 예약을 하나의 학교 제출 Batch로 생성합니다/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '8월 1차' } });
    fireEvent.click(screen.getByRole('button', { name: '생성' }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({ bookingIds: [1], memo: '8월 1차' });
      expect(mockAddToast).toHaveBeenCalledWith('학교 제출 Batch가 생성되었습니다.');
      expect(csvMutateAsync).toHaveBeenCalledWith({ batchId: 7 });
      expect(downloadBlobFile).toHaveBeenCalledWith('facility-submission-SUB-20260801-002.csv', csvBlob);
    });
  });

  it('생성 실패(409) 시 에러 토스트를 띄우고 다이얼로그·선택을 유지한다', async () => {
    const createMutateAsync = vi.fn().mockRejectedValue(new Error('이미 제출된 예약이 포함되어 있습니다.'));
    mockCreateMutation.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false });
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    fireEvent.change(screen.getByLabelText('시설 선택'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('tab', { name: '목록 보기' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /합주부/ }));
    fireEvent.click(screen.getByRole('button', { name: /제출 Batch 생성/ }));
    fireEvent.click(screen.getByRole('button', { name: '생성' }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('이미 제출된 예약이 포함되어 있습니다.', { variant: 'error' });
    });
    expect(downloadBlobFile).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- admin-submission-page`
Expected: 신규 2건 FAIL (Dialog 미존재)

- [ ] **Step 3: BatchCreateDialog 구현 + 페이지 연결**

`BatchCreateDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  selectedCount: number;
  pending: boolean;
  onClose: () => void;
  onConfirm: (memo: string) => void;
};

/** Batch 생성 확인(스펙 §7) — 확인 문구 + 메모 입력. 생성 중에는 버튼 라벨 유지 + 스피너. */
export function BatchCreateDialog({ open, selectedCount, pending, onClose, onConfirm }: Props) {
  const [memo, setMemo] = useState('');

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !pending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>학교 제출 Batch 생성</DialogTitle>
          <DialogDescription>
            총 {selectedCount}건의 예약을 하나의 학교 제출 Batch로 생성합니다. 계속하시겠습니까?
          </DialogDescription>
        </DialogHeader>
        <label className="block text-sm text-charcoal-2">
          <span className="mb-1 block text-xs text-charcoal-3">메모</span>
          <textarea
            aria-label="메모"
            value={memo}
            maxLength={500}
            rows={3}
            placeholder="예: 8월 1차 제출 (선택)"
            onChange={(event) => setMemo(event.target.value)}
            className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
          />
        </label>
        <DialogFooter>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn-primary" disabled={pending || selectedCount === 0} onClick={() => onConfirm(memo)}>
            {pending && <ButtonSpinner />}
            생성
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

페이지 연결(`AdminSubmissionPage.tsx` 의 Task 6 주석 자리를 교체):

```tsx
          <BatchCreateDialog
            open={dialogOpen}
            selectedCount={selectedIds.length}
            pending={createMutation.isPending || csvMutation.isPending}
            onClose={() => setDialogOpen(false)}
            onConfirm={(memo) => void handleCreateConfirm(memo)}
          />
```

(import 추가: `import { BatchCreateDialog } from '../_components/BatchCreateDialog';`. Dialog/Spinner 의 실제 export 명·className 버튼 체계는 기존 소비처(예: BookingActionDialog, MemberCsvDownloadPopover)를 열어 대조 후 맞춘다 — 다르면 그 파일 관례가 정본.)

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- admin-submission-page`
Expected: PASS (7/7)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 제출 Batch 생성 다이얼로그·CSV 자동 다운로드 연결"
```

---

### Task 7: 전체 검증 + 실브라우저 QA

**Files:** 신규 없음 (회귀 수정만)

- [ ] **Step 1: 전체 게이트 실행**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm --filter @duing/web test && pnpm --filter @duing/web build`
Expected: 4개 전부 성공 — 출력에서 성공 문구를 직접 확인(`| tail` 금지). build 는 로컬 prod 빌드 env 오버라이드 관례가 있으면 그에 따름(frontend/AGENTS.md 확인).

- [ ] **Step 2: 실브라우저 QA (컨트롤러 체크포인트)**

dev 서버(:3000)를 띄워 `/admin/facility-bookings/submission` 에서 확인 — jsdom 이 못 잡는 항목:
1. 시간표 hover 툴팁 위치·잘림(overflow 컨테이너 경계), 날짜 열 sticky 동작
2. colSpan 병합 블록 시각(선택 토글 시 ink 반전), 모바일 뷰포트 가로 스크롤
3. 생성→CSV 파일 실다운로드(BOM 포함 Excel 열기)
4. Sheet 상세·Dialog 오버레이(`.duing` bg-cream 함정 — 고정 오버레이에 크림 띠 생기면 bg-transparent 처리)

QA 종료 후 dev 서버 프로세스 정리(부모→워커→포트 순 kill).

- [ ] **Step 3: 마무리 self-check**

1. 스펙 §7 항목 커버(시설 선택·Summary 4카드 클릭 필터·이원 뷰·블록 3정보·툴팁·Drawer·선택 모델·생성 플로우·Skeleton/로딩·Empty·반응형) — 이력·상세 화면은 PR-3 범위
2. `any`/`as`/인터페이스/직접 fetch/useEffect 패칭 없음
3. 커밋 메시지 규칙·attribution 없음
4. 절대 미래 날짜 없음

- [ ] **Step 4: 커밋 (수정 발생 시에만)**

```bash
git add -A && git commit -m "test(frontend): 학교 제출 화면 회귀 정리"
```

**완료 후:** push·PR 생성은 하지 않는다 — 컨트롤러가 최종 리뷰 뒤 사용자 지시로 진행한다.

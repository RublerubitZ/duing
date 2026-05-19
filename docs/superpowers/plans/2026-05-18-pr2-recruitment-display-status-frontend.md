# PR2 — 프론트엔드 displayStatus 적용 + 상시모집 작성 폼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR1(백엔드)에서 추가된 `displayStatus` / `endDate: null` 응답을 프론트 타입과 화면에 반영하고, 관리자 모집 작성 폼에 "상시모집" 체크박스를 추가한다.

**Architecture:** (1) `packages/types/src/recruitment.ts` 에 `displayStatus` 추가 + `endDate` nullable, (2) `packages/schemas/src/index.ts` 의 Zod 스키마를 상시모집 케이스에 맞춰 분기, (3) `RecruitmentForm` 에 상시모집 체크박스 → endDate 입력 disabled + 제출 페이로드 null, (4) 모든 `effectivelyOpen ? '모집 중' : '마감'` 분기를 `displayStatus` 기반 라벨로 교체.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, TanStack Query, Zod, Tailwind, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-18-recruitment-integration-and-always-open-design.md` §3 (프론트 부분).

**Prerequisite:** PR1 백엔드 머지 완료. (`displayStatus` 필드가 API 응답에 포함되어야 한다.)

**브랜치:** `feat/recruitment-display-status-frontend` (develop 에서 분기)

---

## File Structure

**Create:**
- `frontend/apps/web/app/_lib/recruitmentDisplay.ts` — displayStatus → 라벨/D-day 헬퍼
- `frontend/apps/web/test/manage/recruitment-form.test.tsx` — 폼 단위 테스트
- `frontend/apps/web/test/recruitmentDisplay.test.ts` — 헬퍼 단위 테스트

**Modify:**
- `frontend/packages/types/src/recruitment.ts`
- `frontend/packages/schemas/src/index.ts`
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/page.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/edit/page.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/page.tsx`
- `frontend/apps/web/app/calendar/page.tsx`
- `frontend/apps/web/app/clubs/[clubId]/page.tsx` (PR3 에서 통합 재작성될 예정이지만 표시 일관성 위해 여기서도 라벨만 교체)
- `frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx` (PR3 에서 삭제 예정이지만 그 사이 일관성 유지)

---

## Task 1: 타입 업데이트 — `RecruitmentDisplayStatus`, `endDate: string | null`

**Files:**
- Modify: `frontend/packages/types/src/recruitment.ts`

- [ ] **Step 1: 파일 전체 교체**

```ts
export type RecruitmentStatus = 'OPEN' | 'CLOSED';
export type ApplicationMode = 'SELF' | 'EXTERNAL';
export type TargetRole = 'MEMBER' | 'OFFICER';
export type RecruitmentDisplayStatus = 'UPCOMING' | 'OPEN' | 'ALWAYS_OPEN' | 'CLOSED';

export type RecruitmentSummary = {
  id: number;
  clubId: number;
  clubName: string;
  title: string;
  startDate: string; // ISO yyyy-MM-dd
  endDate: string | null; // null = 상시모집
  capacity: number;
  status: RecruitmentStatus;
  displayStatus: RecruitmentDisplayStatus;
  effectivelyOpen: boolean;
  applicationMode: ApplicationMode;
  externalFormUrl: string | null;
  useInterview: boolean;
  targetRole: TargetRole;
};

export type RecruitmentDetail = RecruitmentSummary & {
  content: string | null;
  questions: string[];
};

export type CreateRecruitmentPayload = {
  title: string;
  content?: string;
  startDate: string;
  endDate?: string | null;
  capacity: number;
  questions?: string[];
  applicationMode?: ApplicationMode;
  externalFormUrl?: string;
  useInterview?: boolean;
  targetRole?: TargetRole;
};

export type UpdateRecruitmentPayload = {
  title?: string;
  content?: string | null;
  startDate?: string;
  endDate?: string;
  capacity?: number;
  useInterview?: boolean;
  questions?: string[];
};
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @duing/types build` (또는 모노레포 루트에서) `pnpm -w typecheck`
Expected: SUCCESS

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/types/src/recruitment.ts
git commit -m "feat(frontend): RecruitmentDisplayStatus 타입 추가 + endDate nullable"
```

---

## Task 2: Zod 스키마 — 상시모집(`endDate` 없음) 허용

**Files:**
- Modify: `frontend/packages/schemas/src/index.ts`

- [ ] **Step 1: `createRecruitmentSchema` 수정**

`frontend/packages/schemas/src/index.ts:75-112` 의 `createRecruitmentSchema` 정의를 다음으로 교체:

```ts
export const createRecruitmentSchema = z
  .object({
    title: z
      .string()
      .min(1, '제목은 필수 입력값입니다.')
      .max(200, '제목은 200자 이하여야 합니다.'),
    content: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.'),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
      .nullable(),
    capacity: z.number().int().min(1, '모집 정원은 1명 이상이어야 합니다.'),
    applicationMode: z.enum(['SELF', 'EXTERNAL']).default('SELF'),
    externalFormUrl: z.string().optional(),
    useInterview: z.boolean().default(false),
    targetRole: z.enum(['MEMBER', 'OFFICER']).default('MEMBER'),
    questions: z.array(z.string().min(1, '질문 내용을 입력해주세요.')).optional(),
  })
  .refine((data) => data.endDate === null || data.endDate >= data.startDate, {
    message: '모집 종료일은 시작일보다 빠를 수 없습니다.',
    path: ['endDate'],
  })
  .refine(
    (data) =>
      data.applicationMode !== 'EXTERNAL' ||
      (typeof data.externalFormUrl === 'string' && data.externalFormUrl.trim().length > 0),
    {
      message: '외부 폼 URL은 필수 입력값입니다.',
      path: ['externalFormUrl'],
    },
  )
  .refine(
    (data) =>
      data.applicationMode !== 'SELF' ||
      (Array.isArray(data.questions) && data.questions.length > 0),
    {
      message: '자체 폼 모집은 질문을 최소 1개 이상 등록해야 합니다.',
      path: ['questions'],
    },
  );
```

`updateRecruitmentSchema` 는 endDate 변경을 허용하지만 null 로의 전환은 백엔드에서 거부됨. 스키마는 그대로 유지(`endDate` required), 단 PR1 백엔드 정책상 endDate 가 이미 null 인 모집은 수정 진입 자체에서 사전 가드(아래 Task 4 의 edit 페이지에서).

- [ ] **Step 2: 타입체크**

Run: `pnpm -w typecheck`
Expected: SUCCESS

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/schemas/src/index.ts
git commit -m "feat(frontend): createRecruitmentSchema에서 상시모집(endDate=null) 허용"
```

---

## Task 3: displayStatus 라벨/D-day 헬퍼 + 단위 테스트

**Files:**
- Create: `frontend/apps/web/app/_lib/recruitmentDisplay.ts`
- Create: `frontend/apps/web/test/recruitmentDisplay.test.ts`

- [ ] **Step 1: 테스트 먼저 작성**

`frontend/apps/web/test/recruitmentDisplay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  displayStatusLabel,
  recruitmentPeriodLabel,
  recruitmentDaysLeft,
} from '@/_lib/recruitmentDisplay';

describe('displayStatusLabel', () => {
  it.each([
    ['UPCOMING', '모집예정'],
    ['OPEN', '모집중'],
    ['ALWAYS_OPEN', '상시모집'],
    ['CLOSED', '모집마감'],
  ] as const)('%s → %s', (status, expected) => {
    expect(displayStatusLabel(status)).toBe(expected);
  });
});

describe('recruitmentPeriodLabel', () => {
  it('endDate 가 null 이면 "상시모집"을 반환한다', () => {
    expect(recruitmentPeriodLabel('2026-05-01', null)).toBe('상시모집');
  });
  it('endDate 가 있으면 "YYYY-MM-DD ~ YYYY-MM-DD" 형식', () => {
    expect(recruitmentPeriodLabel('2026-05-01', '2026-05-31')).toBe('2026-05-01 ~ 2026-05-31');
  });
});

describe('recruitmentDaysLeft', () => {
  const today = new Date('2026-05-18');
  it('endDate 가 null 이면 null 을 반환한다', () => {
    expect(recruitmentDaysLeft(null, today)).toBeNull();
  });
  it('endDate 가 미래면 양수', () => {
    expect(recruitmentDaysLeft('2026-05-27', today)).toBe(9);
  });
  it('endDate 가 오늘이면 0', () => {
    expect(recruitmentDaysLeft('2026-05-18', today)).toBe(0);
  });
  it('endDate 가 과거면 음수', () => {
    expect(recruitmentDaysLeft('2026-05-10', today)).toBe(-8);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web test -- --run recruitmentDisplay`
Expected: FAIL (모듈 미존재)

- [ ] **Step 3: 구현**

`frontend/apps/web/app/_lib/recruitmentDisplay.ts`:

```ts
import type { RecruitmentDisplayStatus } from '@duing/types';

export function displayStatusLabel(status: RecruitmentDisplayStatus): string {
  switch (status) {
    case 'UPCOMING':
      return '모집예정';
    case 'OPEN':
      return '모집중';
    case 'ALWAYS_OPEN':
      return '상시모집';
    case 'CLOSED':
      return '모집마감';
  }
}

export function recruitmentPeriodLabel(
  startDate: string,
  endDate: string | null,
): string {
  if (endDate === null) {
    return '상시모집';
  }
  return `${startDate} ~ ${endDate}`;
}

/**
 * endDate 까지 남은 일수.
 * - null 이면 null (상시모집)
 * - 오늘 기준 양수=남음, 0=오늘 마감, 음수=이미 지남
 */
export function recruitmentDaysLeft(
  endDate: string | null,
  today: Date = new Date(),
): number | null {
  if (endDate === null) {
    return null;
  }
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = endDate.split('-').map(Number);
  const endUtc = Date.UTC(y, m - 1, d);
  return Math.round((endUtc - todayUtc) / 86_400_000);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test -- --run recruitmentDisplay`
Expected: 9건 PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_lib/recruitmentDisplay.ts \
        frontend/apps/web/test/recruitmentDisplay.test.ts
git commit -m "feat(frontend): displayStatus 라벨·기간·D-day 헬퍼 추가"
```

---

## Task 4: `RecruitmentForm` — 상시모집 체크박스 추가

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx`

- [ ] **Step 1: 상태 추가 + 종료일 입력 분기**

기존 `useState` 블록(파일 `RecruitmentForm.tsx:56-73`) 의 `endDate` 초기화 라인 바로 다음에 `isAlwaysOpen` 상태 추가:

```tsx
const [endDate, setEndDate] = useState(initialData?.endDate ?? '');
// 새로 추가:
const [isAlwaysOpen, setIsAlwaysOpen] = useState(
  isEditMode ? initialData?.endDate === null : false,
);
```

기존 모집 기간 그리드(파일 `RecruitmentForm.tsx:175-201`) 를 다음으로 교체 (create 모드에서만 상시모집 체크박스 노출):

```tsx
{/* 모집 기간 */}
<div className="space-y-3">
  <div className="grid grid-cols-2 gap-4">
    <label className="block">
      <span className={fieldLabelClass}>
        시작일 <span className="text-rose-500">*</span>
      </span>
      <input
        type="date"
        required
        value={startDate}
        onChange={(event) => setStartDate(event.target.value)}
        className={fieldInputClass}
      />
    </label>
    <label className="block">
      <span className={fieldLabelClass}>
        종료일 {!isAlwaysOpen && <span className="text-rose-500">*</span>}
      </span>
      <input
        type="date"
        required={!isAlwaysOpen}
        disabled={isAlwaysOpen}
        value={isAlwaysOpen ? '' : endDate}
        onChange={(event) => setEndDate(event.target.value)}
        className={cn(fieldInputClass, isAlwaysOpen && 'bg-slate-100 text-slate-400')}
      />
    </label>
  </div>
  {!isEditMode && (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={isAlwaysOpen}
        onChange={(event) => {
          setIsAlwaysOpen(event.target.checked);
          if (event.target.checked) {
            setEndDate('');
          }
        }}
        className="h-4 w-4 rounded border-slate-300"
      />
      상시모집 (종료일 없음 — 직접 마감할 때까지 지원 접수)
    </label>
  )}
  {isEditMode && initialData?.endDate === null && (
    <p className="text-xs text-slate-500">
      이 모집은 상시모집입니다. 종료일은 변경할 수 없습니다.
    </p>
  )}
</div>
```

- [ ] **Step 2: `handleSubmit` — create 경로의 `endDate` 처리 수정**

기존 create 경로(파일 `RecruitmentForm.tsx:112-127`) 의 `safeParse({ ... endDate, ... })` 인자에서 `endDate` 부분을 다음으로 교체:

```tsx
const parsed = createRecruitmentSchema.safeParse({
  title,
  content: content || undefined,
  startDate,
  endDate: isAlwaysOpen ? null : endDate,
  capacity,
  applicationMode,
  externalFormUrl: externalFormUrl || undefined,
  useInterview,
  targetRole,
  questions: applicationMode === 'SELF' ? questions : undefined,
});
```

이후 `props.onSubmit({...})` 호출의 `endDate: parsed.data.endDate` 도 nullable 그대로 전달. `CreateFormValues` 타입의 `endDate` 를 `string | null` 로 변경:

```tsx
export type CreateFormValues = {
  title: string;
  content: string;
  startDate: string;
  endDate: string | null;
  capacity: number;
  applicationMode: 'SELF' | 'EXTERNAL';
  externalFormUrl: string;
  useInterview: boolean;
  targetRole: 'MEMBER' | 'OFFICER';
  questions: string[];
};
```

`props.onSubmit` 호출부도 `endDate: parsed.data.endDate` (nullable) 그대로 전달하도록 수정.

> **edit 경로:** `EditFormValues.endDate` 는 `string` 유지(상시모집의 종료일 변경 자체가 불가). `parsed.data.endDate` 가 null 이 들어올 수 없으므로 그대로.

- [ ] **Step 3: create 호출처(`recruitments/new/page.tsx`) 의 payload 매핑 확인**

`frontend/apps/web/app/manage/clubs/[clubId]/recruitments/new/page.tsx` 에서 `onSubmit` 콜백이 `CreateFormValues` 를 받아 `createRecruitmentMutation.mutateAsync({...})` 로 보낸다. 거기서 `endDate` 가 `string | null` 그대로 통과해야 한다. 명시적으로 다음과 같이 두는 게 안전:

```tsx
mutation.mutateAsync({
  ...
  endDate: values.endDate ?? undefined,  // API 가 optional 로 받음
  ...
});
```

> 백엔드는 `endDate` 미포함(=null) 으로 받아 상시모집으로 저장한다.

- [ ] **Step 4: 타입체크 + 빌드**

Run: `pnpm -w typecheck && pnpm --filter web build`
Expected: SUCCESS

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx \
        frontend/apps/web/app/manage/clubs/[clubId]/recruitments/new/page.tsx
git commit -m "feat(frontend): 관리자 모집 작성 폼에 상시모집 체크박스 추가"
```

---

## Task 5: `RecruitmentForm` 단위 테스트 (Vitest)

**Files:**
- Create: `frontend/apps/web/test/manage/recruitment-form.test.tsx`

- [ ] **Step 1: 테스트 작성**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecruitmentForm } from '@/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';

describe('RecruitmentForm — 상시모집 토글', () => {
  it('상시모집 체크박스를 켜면 종료일 입력이 disabled 되고 값이 비워진다', () => {
    render(<RecruitmentForm mode="create" onSubmit={vi.fn()} isPending={false} />);
    const endDateInput = screen.getByLabelText(/종료일/) as HTMLInputElement;
    const alwaysOpen = screen.getByLabelText(/상시모집/);

    fireEvent.change(endDateInput, { target: { value: '2026-12-31' } });
    expect(endDateInput.value).toBe('2026-12-31');

    fireEvent.click(alwaysOpen);
    expect(endDateInput).toBeDisabled();
    expect(endDateInput.value).toBe('');
  });

  it('상시모집 체크 후 자체폼+필수입력값을 채워 제출하면 endDate=null 로 전달된다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="create" onSubmit={onSubmit} isPending={false} />);

    fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
      target: { value: '상시모집 공고' },
    });
    fireEvent.change(screen.getByLabelText(/시작일/), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText(/상시모집/));

    // 자체폼 기본 + 질문 1개 추가가 어렵다면 EXTERNAL 로 전환
    fireEvent.click(screen.getByLabelText('외부 폼'));
    fireEvent.change(screen.getByPlaceholderText('https://forms.google.com/...'), {
      target: { value: 'https://forms.example.com/x' },
    });

    fireEvent.click(screen.getByRole('button', { name: /모집 작성/ }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ endDate: null });
  });
});
```

> 만약 import 경로 alias 가 다르면 `vitest.config.ts:resolve.alias['@']` 기준으로 맞춘다 (현재 `@ → app`).

- [ ] **Step 2: 실행 + 통과 확인**

Run: `pnpm --filter web test -- --run manage/recruitment-form`
Expected: 2건 PASS

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/test/manage/recruitment-form.test.tsx
git commit -m "test(frontend): RecruitmentForm 상시모집 토글 단위 테스트"
```

---

## Task 6: 관리자 모집 목록 페이지 — displayStatus 라벨 사용

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/page.tsx`

- [ ] **Step 1: import 추가 + 카드 라벨 교체**

파일 상단 import 영역에 추가:

```tsx
import { displayStatusLabel, recruitmentPeriodLabel } from '../../../../_lib/recruitmentDisplay';
```

기존 `RecruitmentCard` (파일 `recruitments/page.tsx:11-47`) 본문을 다음으로 교체:

```tsx
function RecruitmentCard({
  recruitment,
  clubId,
}: {
  recruitment: RecruitmentSummary;
  clubId: number;
}) {
  const applicationModeLabel =
    recruitment.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼';
  const targetRoleLabel = recruitment.targetRole === 'OFFICER' ? '운영진' : '부원';
  const active = recruitment.displayStatus === 'OPEN'
    || recruitment.displayStatus === 'ALWAYS_OPEN';

  return (
    <li>
      <Link
        href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}`)}
        className="block rounded-lg border border-slate-200 p-4 hover:border-slate-400 transition-colors"
      >
        <div className="flex items-baseline justify-between">
          <span className="font-medium text-slate-900">{recruitment.title}</span>
          <span className={active ? 'text-xs font-medium text-emerald-600' : 'text-xs text-slate-400'}>
            {displayStatusLabel(recruitment.displayStatus)}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)} · {applicationModeLabel} ·{' '}
          {targetRoleLabel} 모집 · 정원 {recruitment.capacity}
        </p>
      </Link>
    </li>
  );
}
```

진행중/마감 탭 분할(파일 `recruitments/page.tsx:63-65`) 도 displayStatus 기준으로 교체:

```tsx
const openRecruitments = recruitments?.filter(
  (recruitment) => recruitment.displayStatus !== 'CLOSED'
) ?? [];
const closedRecruitments = recruitments?.filter(
  (recruitment) => recruitment.displayStatus === 'CLOSED'
) ?? [];
```

> UPCOMING / ALWAYS_OPEN 도 "진행 중" 탭에 포함된다 — 관리자가 동아리 운영 화면에서 마감 외 모집을 한꺼번에 보는 것이 자연스럽다.

- [ ] **Step 2: 타입체크**

Run: `pnpm -w typecheck`
Expected: SUCCESS

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/[clubId]/recruitments/page.tsx
git commit -m "feat(frontend): 관리자 모집 목록에 displayStatus 라벨 적용"
```

---

## Task 7: 관리자 모집 상세 페이지 — displayStatus 라벨/배지

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/edit/page.tsx`

- [ ] **Step 1: 상세 페이지 헤더 배지 교체**

`recruitments/[recruitmentId]/page.tsx:29` (`const isClosed = !recruitment.effectivelyOpen;`) 를 다음으로 교체:

```tsx
const isClosed = recruitment.displayStatus === 'CLOSED';
const isAlwaysOpen = recruitment.displayStatus === 'ALWAYS_OPEN';
```

기존 헤더 배지(파일 `recruitments/[recruitmentId]/page.tsx:60-69`):

```tsx
<span
  className={
    recruitment.effectivelyOpen
      ? 'mt-1 shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700'
      : 'mt-1 shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500'
  }
>
  {recruitment.effectivelyOpen ? '모집 중' : '마감'}
</span>
```

→ 변경:

```tsx
<span
  className={
    isClosed
      ? 'mt-1 shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500'
      : 'mt-1 shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700'
  }
>
  {displayStatusLabel(recruitment.displayStatus)}
</span>
```

기간 표시(파일 `recruitments/[recruitmentId]/page.tsx:57-59`):

```tsx
<p className="mt-1 text-sm text-slate-500">
  {recruitment.startDate} ~ {recruitment.endDate}
</p>
```

→ 변경:

```tsx
<p className="mt-1 text-sm text-slate-500">
  {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
</p>
```

상단 import 에 `displayStatusLabel, recruitmentPeriodLabel` 추가.

- [ ] **Step 2: edit 가드 — 상시모집 모집의 endDate 입력 자체 차단은 폼에서 처리되지만, edit 페이지의 "마감된 모집은 수정 불가" 가드도 displayStatus 기반으로**

`recruitments/[recruitmentId]/edit/page.tsx:29`:

```tsx
if (!recruitment.effectivelyOpen) {
```

→ 변경:

```tsx
if (recruitment.displayStatus === 'CLOSED') {
```

- [ ] **Step 3: 타입체크**

Run: `pnpm -w typecheck`
Expected: SUCCESS

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx \
        frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/edit/page.tsx
git commit -m "feat(frontend): 관리자 모집 상세/수정에 displayStatus 적용"
```

---

## Task 8: 그 외 화면 — manage 홈/캘린더/학생 화면 라벨 통일

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/page.tsx`
- Modify: `frontend/apps/web/app/calendar/page.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/page.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx`

- [ ] **Step 1: manage 홈 — `effectivelyOpen` → `displayStatus !== 'CLOSED'`**

`manage/clubs/[clubId]/page.tsx:37`:

```tsx
const activeRecruitments = recruitments?.filter((recruitment) => recruitment.effectivelyOpen) ?? [];
```

→ 변경:

```tsx
const activeRecruitments = recruitments?.filter(
  (recruitment) => recruitment.displayStatus !== 'CLOSED'
) ?? [];
```

- [ ] **Step 2: 캘린더 — 라벨 교체**

`calendar/page.tsx:46`:

```tsx
{recruitment.effectivelyOpen ? '모집중' : '마감'} ·{' '}
```

→ 변경 (상단 import 추가 + 라벨 교체):

```tsx
{displayStatusLabel(recruitment.displayStatus)} ·{' '}
```

- [ ] **Step 3: 학생측 동아리 상세(임시 호환) — 필터 조건만 displayStatus 로**

`clubs/[clubId]/page.tsx:64`:

```tsx
.filter((r) => r.effectivelyOpen)
```

→ 변경:

```tsx
.filter((r) => r.displayStatus === 'OPEN' || r.displayStatus === 'ALWAYS_OPEN')
```

> 이 페이지는 PR3 에서 통째로 재작성되므로 라벨 교체는 최소화하고 필터만 정합성 유지.

- [ ] **Step 4: 학생측 모집 상세(임시 호환)**

`clubs/[clubId]/recruitments/[recruitmentId]/page.tsx`:

```tsx
const canApply = recruitment.effectivelyOpen;
...
{recruitment.effectivelyOpen ? '모집중' : '마감'} ·{' '}
```

→ 변경 (상단 import 추가):

```tsx
const canApply = recruitment.displayStatus === 'OPEN'
  || recruitment.displayStatus === 'ALWAYS_OPEN';
...
{displayStatusLabel(recruitment.displayStatus)} ·{' '}
```

- [ ] **Step 5: 타입체크 + 빌드 + 전체 테스트**

```bash
pnpm -w typecheck
pnpm --filter web build
pnpm --filter web test -- --run
```
Expected: 전 단계 PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/[clubId]/page.tsx \
        frontend/apps/web/app/calendar/page.tsx \
        frontend/apps/web/app/clubs/[clubId]/page.tsx \
        frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx
git commit -m "feat(frontend): 나머지 모집 표시 자리도 displayStatus 기반으로 통일"
```

---

## Task 9: PR 생성

- [ ] **Step 1: 푸시 + PR 생성**

```bash
git push -u origin feat/recruitment-display-status-frontend
gh pr create --base develop --title "feat(frontend): 모집 displayStatus 적용 + 상시모집 작성 폼" --body "$(cat <<'EOF'
## 🚀 작업 내용
- 백엔드(PR1)에서 추가된 `displayStatus`(UPCOMING/OPEN/ALWAYS_OPEN/CLOSED)를 타입과 모든 표시 자리에 반영했습니다.
- 관리자 모집 작성 폼에 "상시모집" 체크박스를 추가해 종료일 없이 모집을 만들 수 있게 했습니다.
- `endDate` 가 null 인 케이스에 대비해 라벨 헬퍼와 단위 테스트를 추가했습니다.

## 🤔 고민했던 내용
- `effectivelyOpen` 을 즉시 제거하는 대신 호환을 위해 응답에 남겨두고, 화면에서는 `displayStatus` 만 사용하도록 정리했습니다.
- 진행중 탭에 UPCOMING/ALWAYS_OPEN 도 포함시켰습니다. 관리자가 한 화면에서 살아있는 모집을 모두 볼 수 있는 게 자연스럽다고 판단했습니다.

## 💬 리뷰 중점사항
- 상시모집 체크 토글이 종료일 입력의 disabled + 값 초기화 동작과 일치하는지 봐주세요.
- 카드/배지 라벨이 일관되게 displayStatus 기반인지 확인 부탁드립니다.
EOF
)"
```

---

## Self-Review

- [x] **스펙 커버리지** — 스펙 §3 의 프론트 항목(타입/폼/관리자 화면/displayStatus 라벨) 모두 Task 1~8 에 매핑.
- [x] **플레이스홀더 검사** — TBD/TODO 없음, 모든 코드 블록 완성.
- [x] **타입 일관성** — `RecruitmentDisplayStatus` 값(`UPCOMING/OPEN/ALWAYS_OPEN/CLOSED`)이 헬퍼/스키마/페이지 전반에서 동일.
- [x] **DRY** — `displayStatusLabel` / `recruitmentPeriodLabel` 한 곳에서만 정의되고 호출처는 import.
- [x] **TDD** — 헬퍼 Task 3, 폼 Task 5 는 테스트 선행.

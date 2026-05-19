# Plan B — Club/Recruitment 메타데이터 프론트 타입 + 관리자 폼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan A 가 노출한 8개 필드를 프론트 타입/Zod 스키마/관리자 폼(ClubInfoForm, RecruitmentForm)에 반영한다.

**Architecture:** (1) `packages/types` 에 필드 추가, (2) `packages/schemas` 의 Zod 스키마 확장(검증 포함), (3) `ClubInfoForm` 에 7개 입력(input 6개 + 요일 체크박스 그룹) 추가, (4) `RecruitmentForm` 에 면접일 input 2개 + `showApplicantCount` 체크박스 추가.

**Tech Stack:** Next.js 15, React 19, TypeScript, TanStack Query, Zod, Tailwind, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-19-club-scalar-metadata-and-interview-fields-design.md` §6 (타입/스키마/관리자 화면).

**Prerequisite:** Plan A 머지. ClubDetail/RecruitmentDetail 응답에 새 필드가 포함되어야 한다.

**Branch:** `feat/club-metadata-frontend-admin`

---

## File Structure

**Create:**
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ActiveDaysToggle.tsx`
- `frontend/apps/web/test/manage/club-info-form.test.tsx`
- `frontend/apps/web/test/manage/recruitment-form-interview.test.tsx`

> **`packages/api/src/client.ts` 수정 불필요** — 현재 `clubs.detail`/`clubs.update`/`recruitments.detail` 메서드 시그니처가 `ClubDetail`/`UpdateClubPayload`/`RecruitmentDetail` 타입을 그대로 import 해서 사용 중이므로, 타입 패키지 갱신만으로 자동 반영된다.

**Modify:**
- `frontend/packages/types/src/club.ts`
- `frontend/packages/types/src/recruitment.ts`
- `frontend/packages/schemas/src/index.ts`
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/new/page.tsx` (payload 매핑)

---

## Task 1: 타입 확장 — Club / Recruitment

**Files:**
- Modify: `frontend/packages/types/src/club.ts`
- Modify: `frontend/packages/types/src/recruitment.ts`

- [ ] **Step 1: `ClubDayOfWeek` + Club 필드 추가**

`club.ts` 파일 상단에 추가:

```ts
export type ClubDayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
```

> 백엔드 `java.time.DayOfWeek` 의 enum name 그대로(MONDAY/TUESDAY/...).

`ClubDetail` 에 7개 필드 추가 (기존 필드 마지막인 `photos` 다음):

```ts
foundedYear: number | null;
cohortNumber: number | null;
location: string | null;
contactEmail: string | null;
activityFrequency: number | null;
activeDays: ClubDayOfWeek[];
membershipFee: string | null;
```

`UpdateClubPayload` 에 7개 필드 optional 추가 (기존 필드 다음):

```ts
foundedYear?: number | null;
cohortNumber?: number | null;
location?: string | null;
contactEmail?: string | null;
activityFrequency?: number | null;
activeDays?: ClubDayOfWeek[];
membershipFee?: string | null;
```

- [ ] **Step 2: `recruitment.ts` Recruitment 필드 추가**

`RecruitmentDetail` 에 4개 필드 추가 (기존 마지막 필드 다음):

```ts
interviewStartDate: string | null;
interviewEndDate: string | null;
showApplicantCount: boolean;
applicantCount: number | null;
```

`CreateRecruitmentPayload` 와 `UpdateRecruitmentPayload` 에 3개 optional 추가:

```ts
interviewStartDate?: string | null;
interviewEndDate?: string | null;
showApplicantCount?: boolean;
```

- [ ] **Step 3: 타입체크**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck 2>&1 | tail -20
```
Expected: SUCCESS.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/packages/types/src/club.ts frontend/packages/types/src/recruitment.ts
git commit -m "feat(frontend): Club/Recruitment 메타데이터 타입 확장"
```

---

## Task 2: Zod 스키마 확장

**Files:**
- Modify: `frontend/packages/schemas/src/index.ts`

- [ ] **Step 1: `updateClubSchema` 에 7개 필드 추가**

먼저 파일을 읽어 `updateClubSchema` 위치 확인. `.object({...})` 의 마지막 필드 다음에 7개 추가:

```ts
foundedYear: z
  .number()
  .int()
  .min(1900, '창설년도는 1900 이상이어야 합니다.')
  .max(2100, '창설년도가 너무 큽니다.')
  .nullable()
  .optional(),
cohortNumber: z
  .number()
  .int()
  .min(1, '기수는 1 이상이어야 합니다.')
  .nullable()
  .optional(),
location: z
  .string()
  .max(200, '위치는 200자 이하여야 합니다.')
  .nullable()
  .optional(),
contactEmail: z
  .string()
  .email('이메일 형식이 올바르지 않습니다.')
  .max(200, '이메일은 200자 이하여야 합니다.')
  .nullable()
  .or(z.literal(''))
  .optional(),
activityFrequency: z
  .number()
  .int()
  .min(1, '활동 빈도는 1 이상이어야 합니다.')
  .nullable()
  .optional(),
activeDays: z
  .array(z.enum(['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']))
  .optional(),
membershipFee: z
  .string()
  .max(100, '회비 표기는 100자 이하여야 합니다.')
  .nullable()
  .optional(),
```

> `contactEmail` 의 `.or(z.literal(''))` 은 빈 문자열도 허용 — 폼에서 입력 안 한 케이스. 폼 빌더에서 빈 문자열을 null 로 정규화하면 이 처리는 단순화 가능. 본 plan 에서는 둘 다 허용.

- [ ] **Step 2: `createRecruitmentSchema` 및 `updateRecruitmentSchema` 에 3개 필드 추가**

각 schema 의 `.object({...})` 마지막 필드 다음에 3개 추가:

```ts
interviewStartDate: z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
  .nullable()
  .optional(),
interviewEndDate: z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
  .nullable()
  .optional(),
showApplicantCount: z.boolean().optional(),
```

그리고 두 schema 의 `.refine(...)` 체인 끝에 면접 일정 검증 추가:

```ts
.refine((data) => {
  if (!data.interviewStartDate || !data.interviewEndDate) return true;
  return data.interviewEndDate >= data.interviewStartDate;
}, {
  message: '면접 종료일은 시작일보다 빠를 수 없습니다.',
  path: ['interviewEndDate'],
})
```

- [ ] **Step 3: 타입체크 + 기존 테스트 회귀**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck 2>&1 | tail -20
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run 2>&1 | tail -20
```

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/packages/schemas/src/index.ts
git commit -m "feat(frontend): updateClub/Recruitment 스키마에 메타 필드 + 검증 추가"
```

---

## Task 3: `ActiveDaysToggle` 컴포넌트

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ActiveDaysToggle.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import type { ClubDayOfWeek } from '@duing/types';

import { cn } from '../../../../../_lib/cn';

const DAYS: { value: ClubDayOfWeek; label: string }[] = [
  { value: 'MONDAY',    label: '월' },
  { value: 'TUESDAY',   label: '화' },
  { value: 'WEDNESDAY', label: '수' },
  { value: 'THURSDAY',  label: '목' },
  { value: 'FRIDAY',    label: '금' },
  { value: 'SATURDAY',  label: '토' },
  { value: 'SUNDAY',    label: '일' },
];

type Props = {
  value: ClubDayOfWeek[];
  onChange: (next: ClubDayOfWeek[]) => void;
  disabled?: boolean;
};

export function ActiveDaysToggle({ value, onChange, disabled = false }: Props) {
  function toggle(day: ClubDayOfWeek) {
    if (value.includes(day)) {
      onChange(value.filter((existing) => existing !== day));
    } else {
      onChange([...value, day]);
    }
  }

  return (
    <div className="flex gap-1.5">
      {DAYS.map((day) => {
        const selected = value.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-label={day.label}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => toggle(day.value)}
            className={cn(
              'h-9 w-9 rounded-full border text-sm font-semibold transition',
              selected
                ? 'bg-ink text-white border-ink'
                : 'bg-paper text-charcoal-2 border-line hover:border-charcoal-3',
            )}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}
```

> `cn` 위치: `apps/web/app/_lib/cn.ts`. 경로는 컴포넌트 위치(`info/_components/`) 기준 `'../../../../../_lib/cn'`.

- [ ] **Step 2: 타입체크**

Run from `frontend/`: `pnpm -w typecheck`
Expected: SUCCESS.

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ActiveDaysToggle.tsx
git commit -m "feat(frontend): ActiveDaysToggle 컴포넌트 추가"
```

---

## Task 4: `ClubInfoForm` 에 7개 필드 통합

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`

- [ ] **Step 1: 상단 import 추가**

```tsx
import type { ClubDayOfWeek } from '@duing/types';
import { ActiveDaysToggle } from './ActiveDaysToggle';
```

- [ ] **Step 2: state 추가**

기존 `useState` 블록의 `faqs` 다음에 7개 state 추가:

```tsx
const [foundedYear, setFoundedYear] = useState<string>(
  detail.foundedYear !== null ? String(detail.foundedYear) : ''
);
const [cohortNumber, setCohortNumber] = useState<string>(
  detail.cohortNumber !== null ? String(detail.cohortNumber) : ''
);
const [location, setLocation] = useState(detail.location ?? '');
const [contactEmail, setContactEmail] = useState(detail.contactEmail ?? '');
const [activityFrequency, setActivityFrequency] = useState<string>(
  detail.activityFrequency !== null ? String(detail.activityFrequency) : ''
);
const [activeDays, setActiveDays] = useState<ClubDayOfWeek[]>(detail.activeDays ?? []);
const [membershipFee, setMembershipFee] = useState(detail.membershipFee ?? '');
```

> 정수 필드는 `string` state 로 보관 (input type=number 의 빈 값 표현이 자연스러움). 제출 시 변환.

- [ ] **Step 3: `buildPayload()` 확장**

`buildPayload()` 함수의 기존 끝(마지막 if 다음) 에 다음 추가:

```tsx
const newFoundedYear = foundedYear.trim() === '' ? null : Number(foundedYear);
if (newFoundedYear !== detail.foundedYear) {
  payload.foundedYear = newFoundedYear;
}
const newCohortNumber = cohortNumber.trim() === '' ? null : Number(cohortNumber);
if (newCohortNumber !== detail.cohortNumber) {
  payload.cohortNumber = newCohortNumber;
}
if (location !== (detail.location ?? '')) {
  payload.location = location || null;
}
if (contactEmail !== (detail.contactEmail ?? '')) {
  payload.contactEmail = contactEmail || null;
}
const newActivityFrequency = activityFrequency.trim() === '' ? null : Number(activityFrequency);
if (newActivityFrequency !== detail.activityFrequency) {
  payload.activityFrequency = newActivityFrequency;
}
if (JSON.stringify(activeDays) !== JSON.stringify(detail.activeDays)) {
  payload.activeDays = activeDays;
}
if (membershipFee !== (detail.membershipFee ?? '')) {
  payload.membershipFee = membershipFee || null;
}
```

- [ ] **Step 4: 새 입력 7개를 폼 JSX 에 추가**

기존 폼의 적당한 자리(예: SNS/FAQ 위 또는 description 다음) 에 새 섹션을 추가. 정확한 자리는 파일을 읽고 결정. 예시 마크업:

```tsx
<fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
  <legend className="px-2 text-sm font-medium text-slate-700">상세 정보</legend>

  <div className="grid grid-cols-2 gap-4">
    <label className="block">
      <span className="block text-sm text-slate-700">창설년도</span>
      <input
        type="number"
        min={1900}
        max={2100}
        value={foundedYear}
        onChange={(event) => setFoundedYear(event.target.value)}
        disabled={readOnly}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="예: 2018"
      />
    </label>
    <label className="block">
      <span className="block text-sm text-slate-700">현재 기수</span>
      <input
        type="number"
        min={1}
        value={cohortNumber}
        onChange={(event) => setCohortNumber(event.target.value)}
        disabled={readOnly}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="예: 10"
      />
    </label>
  </div>

  <label className="block">
    <span className="block text-sm text-slate-700">위치</span>
    <input
      type="text"
      value={location}
      onChange={(event) => setLocation(event.target.value)}
      disabled={readOnly}
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      placeholder="예: 학생회관 405호"
    />
  </label>

  <label className="block">
    <span className="block text-sm text-slate-700">컨택 이메일</span>
    <input
      type="email"
      value={contactEmail}
      onChange={(event) => setContactEmail(event.target.value)}
      disabled={readOnly}
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      placeholder="예: club@daegu.ac.kr"
    />
  </label>

  <div>
    <span className="block text-sm text-slate-700">활동 요일 / 빈도</span>
    <div className="mt-2 flex items-center gap-4">
      <ActiveDaysToggle value={activeDays} onChange={setActiveDays} disabled={readOnly} />
      <label className="flex items-center gap-2 text-sm">
        주
        <input
          type="number"
          min={1}
          value={activityFrequency}
          onChange={(event) => setActivityFrequency(event.target.value)}
          disabled={readOnly}
          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        회
      </label>
    </div>
  </div>

  <label className="block">
    <span className="block text-sm text-slate-700">회비</span>
    <input
      type="text"
      value={membershipFee}
      onChange={(event) => setMembershipFee(event.target.value)}
      disabled={readOnly}
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      placeholder="예: 학기당 30,000원"
    />
  </label>
</fieldset>
```

- [ ] **Step 5: 타입체크 + 빌드**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -20
```

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx
git commit -m "feat(frontend): ClubInfoForm에 메타 필드 7개 입력 추가"
```

---

## Task 5: `RecruitmentForm` 에 면접 일정 + 지원자 공개 토글 추가

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/new/page.tsx`

- [ ] **Step 1: `CreateFormValues` / `EditFormValues` 타입 확장**

기존 `CreateFormValues` 에 추가:

```ts
interviewStartDate: string | null;
interviewEndDate: string | null;
showApplicantCount: boolean;
```

기존 `EditFormValues` 에도 동일 3개 필드 추가.

- [ ] **Step 2: state 추가**

기존 `useState` 블록의 `useInterview` 다음에 추가:

```tsx
const [interviewStartDate, setInterviewStartDate] = useState(initialData?.interviewStartDate ?? '');
const [interviewEndDate, setInterviewEndDate] = useState(initialData?.interviewEndDate ?? '');
const [showApplicantCount, setShowApplicantCount] = useState(initialData?.showApplicantCount ?? false);
```

- [ ] **Step 3: 면접 진행 체크박스 아래에 면접 일정 입력 + 지원자 공개 추가**

기존 `면접 진행` 체크박스의 `<label>` 블록 다음에 추가:

```tsx
{useInterview && (
  <div className="grid grid-cols-2 gap-4 rounded-md bg-slate-50 p-4">
    <label className="block">
      <span className="block text-sm text-slate-700">면접 시작일</span>
      <input
        type="date"
        value={interviewStartDate}
        onChange={(event) => setInterviewStartDate(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
    <label className="block">
      <span className="block text-sm text-slate-700">면접 종료일</span>
      <input
        type="date"
        value={interviewEndDate}
        onChange={(event) => setInterviewEndDate(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  </div>
)}

<label className="flex items-center gap-3">
  <input
    type="checkbox"
    checked={showApplicantCount}
    onChange={(event) => setShowApplicantCount(event.target.checked)}
    className="h-4 w-4 rounded border-slate-300"
  />
  <span className="text-sm text-slate-700">현재 지원자 수를 학생에게 공개</span>
</label>
```

- [ ] **Step 4: `handleSubmit` 의 `safeParse` 인자에 3개 필드 추가**

`createRecruitmentSchema.safeParse({...})` 의 객체와 `props.onSubmit({...})` 의 객체 둘 다 끝에 추가:

```ts
interviewStartDate: useInterview && interviewStartDate ? interviewStartDate : null,
interviewEndDate: useInterview && interviewEndDate ? interviewEndDate : null,
showApplicantCount,
```

> `useInterview` 가 false 면 면접 일정은 null 로 전송(저장 의도 분명히).

edit 경로도 동일 패턴으로 추가 (`updateRecruitmentSchema.safeParse({...})` 와 `props.onSubmit({...})` 각각).

- [ ] **Step 5: `new/page.tsx` 의 payload 매핑**

기존 `createRecruitment.mutateAsync({...})` 호출에 3개 필드 추가:

```ts
interviewStartDate: values.interviewStartDate ?? undefined,
interviewEndDate: values.interviewEndDate ?? undefined,
showApplicantCount: values.showApplicantCount,
```

> edit 페이지(`[recruitmentId]/edit/page.tsx`) 도 같은 패턴으로 매핑. 파일을 읽고 동일하게 처리.

- [ ] **Step 6: 타입체크 + 빌드**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -20
```

- [ ] **Step 7: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx \
        frontend/apps/web/app/manage/clubs/[clubId]/recruitments/new/page.tsx \
        frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/edit/page.tsx
git commit -m "feat(frontend): RecruitmentForm에 면접 일정 입력 + 지원자 공개 토글 추가"
```

---

## Task 6: `ClubInfoForm` 단위 테스트

**Files:**
- Create: `frontend/apps/web/test/manage/club-info-form.test.tsx`

- [ ] **Step 1: 테스트 작성**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActiveDaysToggle } from '../../app/manage/clubs/[clubId]/info/_components/ActiveDaysToggle';
import type { ClubDayOfWeek } from '@duing/types';

describe('ActiveDaysToggle', () => {
  it('요일 클릭 시 선택/해제가 토글된다', () => {
    let value: ClubDayOfWeek[] = [];
    const onChange = vi.fn((next: ClubDayOfWeek[]) => { value = next; });

    const { rerender } = render(<ActiveDaysToggle value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '수' }));
    expect(onChange).toHaveBeenLastCalledWith(['WEDNESDAY']);

    rerender(<ActiveDaysToggle value={['WEDNESDAY']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '수' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('disabled=true 면 클릭이 무시된다', () => {
    const onChange = vi.fn();
    render(<ActiveDaysToggle value={[]} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button', { name: '월' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

> ClubInfoForm 전체 폼 테스트는 React Query / mutation mocking 이 무거워 별도 다루지 않는다. ActiveDaysToggle 만 커버.

- [ ] **Step 2: 테스트 실행**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run club-info-form 2>&1 | tail -20
```
Expected: 2 PASS

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/test/manage/club-info-form.test.tsx
git commit -m "test(frontend): ActiveDaysToggle 단위 테스트"
```

---

## Task 7: `RecruitmentForm` 면접일/지원자공개 단위 테스트

**Files:**
- Create: `frontend/apps/web/test/manage/recruitment-form-interview.test.tsx`

- [ ] **Step 1: 테스트 작성**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecruitmentForm } from '../../app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';

describe('RecruitmentForm — 면접 일정', () => {
  it('면접 진행 체크 시 면접 시작/종료일 입력이 노출된다', () => {
    render(<RecruitmentForm mode="create" onSubmit={vi.fn()} isPending={false} />);
    expect(screen.queryByLabelText('면접 시작일')).toBeNull();

    fireEvent.click(screen.getByLabelText(/면접 진행/));
    expect(screen.getByLabelText('면접 시작일')).toBeInTheDocument();
    expect(screen.getByLabelText('면접 종료일')).toBeInTheDocument();
  });

  it('지원자 수 공개 체크박스가 기본 false 이고 토글된다', () => {
    render(<RecruitmentForm mode="create" onSubmit={vi.fn()} isPending={false} />);
    const checkbox = screen.getByLabelText(/현재 지원자 수를 학생에게 공개/) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});
```

- [ ] **Step 2: 실행**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run recruitment-form-interview 2>&1 | tail -20
```
Expected: 2 PASS. 전체 테스트도 회귀 없는지 확인:
`pnpm test -- --run 2>&1 | tail -20`

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/test/manage/recruitment-form-interview.test.tsx
git commit -m "test(frontend): RecruitmentForm 면접 일정/지원자 공개 단위 테스트"
```

---

## Task 8: PR 생성

- [ ] **Step 1: 빌드/타입체크 최종**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -20
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run 2>&1 | tail -20
```

Expected: 모두 SUCCESS.

- [ ] **Step 2: PR**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git push -u origin feat/club-metadata-frontend-admin
gh pr create --base develop --title "feat(frontend): Club/Recruitment 메타 필드 타입·관리자 폼 확장" --body "$(cat <<'EOF'
## 🚀 작업 내용
- 백엔드(이전 PR)에서 추가된 Club/Recruitment 메타 필드를 타입과 Zod 스키마에 반영했습니다.
- ClubInfoForm 에 창설년도/기수/위치/이메일/활동/회비 입력을 추가했고, 활동 요일 토글 컴포넌트(`ActiveDaysToggle`)를 분리했습니다.
- RecruitmentForm 에 면접 일정 입력(면접 진행 체크 시 노출) + 지원자 수 공개 체크박스를 추가했습니다.

## 🤔 고민했던 내용
- `contactEmail` 의 빈 문자열을 그대로 허용하도록 Zod 스키마를 구성했습니다. 폼에서 빈 값을 null 로 정규화하는 것보다 명시적입니다.
- 면접 일정 input 은 `useInterview=true` 일 때만 노출해 잘못된 데이터 입력을 줄였습니다. false 로 토글하면 제출 시 면접 일정은 null 로 보내집니다.

## 💬 리뷰 중점사항
- ActiveDaysToggle 의 키보드 접근성 (스페이스/엔터로 토글 가능한지) — 표준 `<button>` 이라 OS 기본 처리에 맡겼습니다.
- 면접 일정 검증(start ≤ end) 이 폼 단에서 Zod refine 으로, 백엔드에서 도메인 검증으로 이중 처리됩니다. 의도된 중복입니다.
EOF
)"
```

---

## Self-Review

- [x] **스펙 커버리지** — §6 의 타입/스키마/ClubInfoForm/RecruitmentForm 모두 Task 1~5. 학생측 표시는 본 plan 범위 외 (Plan C).
- [x] **플레이스홀더 검사** — 모든 코드 블록 완성.
- [x] **타입 일관성** — `ClubDayOfWeek` 가 types/schemas/component 동일. `interviewStartDate`/`interviewEndDate`/`showApplicantCount` 가 타입/스키마/폼 전반 동일.
- [x] **DRY** — `ActiveDaysToggle` 분리.
- [x] **TDD** — ActiveDaysToggle, RecruitmentForm 면접 토글 각각 단위 테스트.
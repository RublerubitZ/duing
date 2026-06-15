# 지원자 관리 대시보드 — Frontend Implementation Plan (F1~F2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-07-applicant-management-dashboard-design.md`

**선행 머지 필요:** Backend PR B1, B2, B3, B4 모두 develop 머지 완료. (백엔드 plan: `2026-06-07-applicant-dashboard-backend.md`)

**Goal:** 운영진 지원자 관리 대시보드의 프론트 2개 PR (F1~F2) 을 순차 구현한다. (1) 목록 페이지에 필터·검색·myScore·terminal disabled UI (F1), (2) 상세 모달 → `/[applicationId]` 라우트 + 평가 패널 + 상태 타임라인 + prev/next 이동 (F2).

**Architecture:** 기존 라우트 위치 유지하면서 목록 페이지 보강 + 신규 상세 페이지 추가. URL 쿼리스트링과 필터 상태 동기화. 평가는 별도 mutation 으로 본인/타인 분리 표시. prev/next 는 backend neighbors 엔드포인트 호출.

**Tech Stack:** TypeScript / Next.js 15 / React 19 / TanStack Query / Vitest + RTL / pnpm workspaces / shadcn 패턴.

**브랜치 전략:** 2개 PR 순차 (`develop` 분기 → `develop` PR). F1 머지 후 F2.

---

# PR F1 — 목록 필터·검색·myScore·terminal disabled

**브랜치:** `feat/applicants-list-filter-search`

**Goal:** 운영진 목록 페이지에 필터 바, 통합 검색창, URL 동기화, 응답 컬럼 확장 (학과/학번/학년/면접일정/내 점수), terminal 상태 행 disabled UI 적용.

## File Structure — F1

| Action | Path | 역할 |
|---|---|---|
| Modify | `frontend/packages/types/src/application.ts` | `Applicant` 확장, `ApplicationEvaluation` / `ApplicationStatusHistoryItem` 추가 |
| Modify | `frontend/packages/api/src/client.ts` | `getApplicants` 시그니처, `getApplicantNeighbors` / `upsertMyApplicationEvaluation` / `deleteMyApplicationEvaluation` 추가 |
| Modify | `frontend/packages/hooks/src/applications.ts` | `useApplicantsQuery` filters 인자, 신규 hook 4개 |
| Modify | `frontend/packages/hooks/src/applicationQueryKeys.ts` | filter 직렬화 key |
| Create | `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantsFilterBar.tsx` | 필터 컴포넌트 |
| Create | `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantsSearchInput.tsx` | debounced search |
| Modify | `.../applicants/_components/ApplicantTable.tsx` | 컬럼 추가, terminal disabled, myScore 뱃지, useInterview 분기 |
| Modify | `.../applicants/_components/BulkActionBar.tsx` | useInterview=false 시 INTERVIEW_PENDING 옵션 제외 |
| Modify | `.../applicants/page.tsx` | URL 동기화, FilterBar 통합, useInterview 분기 |
| Create | `frontend/apps/web/test/manage/applicants/applicants-filter-bar.test.tsx` | FilterBar 단위 |
| Create | `frontend/apps/web/test/manage/applicants/applicant-table-extension.test.tsx` | myScore + terminal disabled + 면접 컬럼 분기 |

## Task F1-0: 브랜치

- [ ] **Step 1**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/applicants-list-filter-search
```

## Task F1-1: 타입 확장

**Files:**
- Modify: `frontend/packages/types/src/application.ts`

- [ ] **Step 1: `Applicant` 확장 + 신규 타입 추가**

`frontend/packages/types/src/application.ts` 의 `Applicant` 타입 교체 + 새 타입 추가:

```ts
import type { ClubCategory } from './club';
// 기존 import 유지...

export type College =
  | 'ENGINEERING'
  | 'NATURAL_SCIENCE'
  | 'HUMANITIES'
  | 'SOCIAL_SCIENCE'
  | 'ARTS'
  | 'EDUCATION'
  | 'MEDICAL'
  | 'OTHER'; // 백엔드 College enum 과 동기. 실제 값은 enum 파일 참조.

export type Grade = 'FIRST' | 'SECOND' | 'THIRD' | 'FOURTH' | 'GRADUATE';
// (백엔드 Grade enum 정확한 값은 enum 파일 참조 — 동기 필요)

// 기존 Applicant 가 있던 자리에 교체:
export type Applicant = {
  applicationId: number;
  userId: number;
  userName: string;
  studentId: string;
  email: string;
  college: College;
  major: string;
  grade: Grade;
  answers: string[];
  status: ApplicationStatus;
  submittedAt: string;
  interviewAt: string | null;
  myScore: number | null;
};

export type ApplicationEvaluation = {
  evaluatorId: number;
  evaluatorName: string;
  score: number;          // 1-5
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStatusHistoryItem = {
  previousStatus: ApplicationStatus;
  newStatus: ApplicationStatus;
  changedById: number;
  changedByName: string;
  changedAt: string;
};

// 기존 ApplicantDetail 교체:
export type ApplicantDetail = {
  applicationId: number;
  recruitmentId: number;
  recruitmentTitle: string;
  clubId: number;
  clubName: string;
  applicant: {
    userId: number;
    name: string;
    studentId: string;
    email: string;
    college: College;
    major: string;
    grade: Grade;
  };
  answers: { question: string; answer: string }[];
  status: ApplicationStatus;
  interviewAt: string | null;
  interviewLocation: string | null;
  submittedAt: string;
  statusHistory: ApplicationStatusHistoryItem[];
  myEvaluation: ApplicationEvaluation | null;
  otherEvaluations: ApplicationEvaluation[];
};

// 신규 — F2 에서도 사용:
export type ApplicantNeighbors = {
  prevApplicationId: number | null;
  nextApplicationId: number | null;
};

export type ApplicantsFilters = {
  status?: ApplicationStatus;
  college?: College;
  q?: string;
  submittedFrom?: string;   // YYYY-MM-DD
  submittedTo?: string;
};

export type UpsertApplicationEvaluationPayload = {
  score: number;
  memo: string | null;
};
```

- [ ] **Step 2: 타입체크**

```bash
cd frontend && pnpm typecheck
```

Expected: PASS (혹은 일부 타입 의존성 보강 필요).

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/types/src/application.ts
git commit -m "feat(types): Applicant 확장 + ApplicationEvaluation/StatusHistory 타입 추가"
```

## Task F1-2: API 클라이언트 확장

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: 시그니처 변경 + 신규 메서드**

`client.ts` 의 leader 섹션에서 기존 `applicants` 메서드를 다음으로 교체:

```ts
applicants(
  recruitmentId: number,
  filters?: ApplicantsFilters,
): Promise<Applicant[]> {
  const search = new URLSearchParams();
  if (filters?.status) search.set('status', filters.status);
  if (filters?.college) search.set('college', filters.college);
  if (filters?.q) search.set('q', filters.q);
  if (filters?.submittedFrom) search.set('submittedFrom', filters.submittedFrom);
  if (filters?.submittedTo) search.set('submittedTo', filters.submittedTo);
  const qs = search.toString();
  const path = `leader/recruitments/${recruitmentId}/applications${qs ? `?${qs}` : ''}`;
  return jsonOk<Applicant[]>(http.get(path));
}
```

같은 leader 섹션에 추가:

```ts
applicantNeighbors(
  recruitmentId: number,
  applicationId: number,
  filters?: ApplicantsFilters,
): Promise<ApplicantNeighbors> {
  const search = new URLSearchParams();
  if (filters?.status) search.set('status', filters.status);
  if (filters?.college) search.set('college', filters.college);
  if (filters?.q) search.set('q', filters.q);
  if (filters?.submittedFrom) search.set('submittedFrom', filters.submittedFrom);
  if (filters?.submittedTo) search.set('submittedTo', filters.submittedTo);
  const qs = search.toString();
  const path = `leader/recruitments/${recruitmentId}/applications/${applicationId}/neighbors${qs ? `?${qs}` : ''}`;
  return jsonOk<ApplicantNeighbors>(http.get(path));
},

upsertMyApplicationEvaluation(
  applicationId: number,
  payload: UpsertApplicationEvaluationPayload,
): Promise<void> {
  return http.put(`leader/applications/${applicationId}/evaluations/me`, { json: payload }).then(() => undefined);
},

deleteMyApplicationEvaluation(applicationId: number): Promise<void> {
  return http.delete(`leader/applications/${applicationId}/evaluations/me`).then(() => undefined);
},
```

상단 import 에 신규 타입 추가:

```ts
import type {
  Applicant,
  ApplicantDetail,
  ApplicantsFilters,
  ApplicantNeighbors,
  UpsertApplicationEvaluationPayload,
  // 기존 ...
} from '@duing/types';
```

- [ ] **Step 2: 타입체크 + 커밋**

```bash
pnpm typecheck
git add frontend/packages/api/src/client.ts
git commit -m "feat(api): applicants 필터 파라미터 + neighbors / 평가 CRUD 메서드 추가"
```

## Task F1-3: 훅 확장

**Files:**
- Modify: `frontend/packages/hooks/src/applications.ts`
- Modify: `frontend/packages/hooks/src/applicationQueryKeys.ts`

- [ ] **Step 1: query key 확장**

`applicationQueryKeys.ts` 의 applicants key 함수 변경:

```ts
export const applicationQueryKeys = {
  // 기존 ...
  applicants: (recruitmentId: number, filters?: ApplicantsFilters) =>
    ['applicants', recruitmentId, filters ?? {}] as const,
  applicantDetail: (applicationId: number) =>
    ['applicantDetail', applicationId] as const,
  applicantNeighbors: (recruitmentId: number, applicationId: number, filters?: ApplicantsFilters) =>
    ['applicantNeighbors', recruitmentId, applicationId, filters ?? {}] as const,
};
```

- [ ] **Step 2: 훅 확장 + 신규 훅**

`applications.ts` 에서:

```ts
export function useApplicantsQuery(
  recruitmentId: number,
  filters?: ApplicantsFilters,
) {
  const api = useApi();
  return useQuery({
    queryKey: applicationQueryKeys.applicants(recruitmentId, filters),
    queryFn: () => api.leader.applicants(recruitmentId, filters),
    enabled: Number.isFinite(recruitmentId),
  });
}

export function useApplicantNeighborsQuery(
  recruitmentId: number,
  applicationId: number,
  filters?: ApplicantsFilters,
) {
  const api = useApi();
  return useQuery({
    queryKey: applicationQueryKeys.applicantNeighbors(recruitmentId, applicationId, filters),
    queryFn: () => api.leader.applicantNeighbors(recruitmentId, applicationId, filters),
    enabled: Number.isFinite(recruitmentId) && Number.isFinite(applicationId),
  });
}

export function useUpsertMyApplicationEvaluationMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, payload }: {
      applicationId: number;
      payload: UpsertApplicationEvaluationPayload;
    }) => api.leader.upsertMyApplicationEvaluation(applicationId, payload),
    onSuccess: (_, { applicationId }) => {
      queryClient.invalidateQueries({ queryKey: applicationQueryKeys.applicantDetail(applicationId) });
      queryClient.invalidateQueries({ queryKey: ['applicants'] });   // myScore 갱신
    },
  });
}

export function useDeleteMyApplicationEvaluationMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: number) => api.leader.deleteMyApplicationEvaluation(applicationId),
    onSuccess: (_, applicationId) => {
      queryClient.invalidateQueries({ queryKey: applicationQueryKeys.applicantDetail(applicationId) });
      queryClient.invalidateQueries({ queryKey: ['applicants'] });
    },
  });
}
```

- [ ] **Step 3: index.ts export 추가**

```ts
export {
  useApplicantsQuery,
  useApplicantNeighborsQuery,
  useUpsertMyApplicationEvaluationMutation,
  useDeleteMyApplicationEvaluationMutation,
  // 기존 ...
} from './applications';
```

- [ ] **Step 4: 타입체크 + 커밋**

```bash
pnpm typecheck
git add frontend/packages/hooks/src/
git commit -m "feat(hooks): useApplicantsQuery 필터 인자 + neighbors/평가 mutation 훅 추가"
```

## Task F1-4: ApplicantsSearchInput (debounced)

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantsSearchInput.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import { useEffect, useState } from 'react';

type Props = {
  defaultValue: string;
  onCommit: (value: string) => void;
  debounceMs?: number;
};

export function ApplicantsSearchInput({ defaultValue, onCommit, debounceMs = 300 }: Props) {
  const [input, setInput] = useState(defaultValue);

  useEffect(() => {
    setInput(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (input === defaultValue) return;
    const timer = setTimeout(() => onCommit(input.trim()), debounceMs);
    return () => clearTimeout(timer);
  }, [input, defaultValue, onCommit, debounceMs]);

  return (
    <input
      type="search"
      placeholder="이름·학번·학과로 검색"
      value={input}
      onChange={(event) => setInput(event.target.value)}
      className="rounded border border-neutral-300 px-3 py-2 text-sm w-64"
      aria-label="지원자 검색"
    />
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/_components/ApplicantsSearchInput.tsx
git commit -m "feat(applicants): ApplicantsSearchInput 컴포넌트 추가"
```

## Task F1-5: ApplicantsFilterBar

**Files:**
- Create: `.../applicants/_components/ApplicantsFilterBar.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import type { ApplicantsFilters, ApplicationStatus, College } from '@duing/types';
import { APPLICATION_STATUS_LABEL } from '../../../../../../_constants/application-status';
import { ApplicantsSearchInput } from './ApplicantsSearchInput';

const COLLEGE_OPTIONS: { label: string; value: College }[] = [
  { label: '공과대학', value: 'ENGINEERING' },
  { label: '자연과학대학', value: 'NATURAL_SCIENCE' },
  { label: '인문대학', value: 'HUMANITIES' },
  { label: '사회과학대학', value: 'SOCIAL_SCIENCE' },
  { label: '예술대학', value: 'ARTS' },
  { label: '사범대학', value: 'EDUCATION' },
  { label: '의과대학', value: 'MEDICAL' },
  { label: '기타', value: 'OTHER' },
];

type Props = {
  filters: ApplicantsFilters;
  onChange: (next: ApplicantsFilters) => void;
  useInterview: boolean;
};

export function ApplicantsFilterBar({ filters, onChange, useInterview }: Props) {
  const update = (patch: Partial<ApplicantsFilters>) =>
    onChange({ ...filters, ...patch });

  const reset = () => onChange({});

  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3 bg-white">
      <Field label="상태">
        <select
          value={filters.status ?? ''}
          onChange={(event) =>
            update({ status: event.target.value === '' ? undefined : (event.target.value as ApplicationStatus) })
          }
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
        >
          <option value="">전체</option>
          <option value="SUBMITTED">{APPLICATION_STATUS_LABEL.SUBMITTED}</option>
          <option value="UNDER_REVIEW">{APPLICATION_STATUS_LABEL.UNDER_REVIEW}</option>
          {useInterview && (
            <option value="INTERVIEW_PENDING">{APPLICATION_STATUS_LABEL.INTERVIEW_PENDING}</option>
          )}
          <option value="ACCEPTED">{APPLICATION_STATUS_LABEL.ACCEPTED}</option>
          <option value="REJECTED">{APPLICATION_STATUS_LABEL.REJECTED}</option>
        </select>
      </Field>

      <Field label="단과대">
        <select
          value={filters.college ?? ''}
          onChange={(event) =>
            update({ college: event.target.value === '' ? undefined : (event.target.value as College) })
          }
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
        >
          <option value="">전체</option>
          {COLLEGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="기간">
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={filters.submittedFrom ?? ''}
            onChange={(event) => update({ submittedFrom: event.target.value || undefined })}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            aria-label="시작일"
          />
          <span className="text-neutral-500">~</span>
          <input
            type="date"
            value={filters.submittedTo ?? ''}
            onChange={(event) => update({ submittedTo: event.target.value || undefined })}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            aria-label="종료일"
          />
        </div>
      </Field>

      <Field label="검색">
        <ApplicantsSearchInput
          defaultValue={filters.q ?? ''}
          onCommit={(value) => update({ q: value === '' ? undefined : value })}
        />
      </Field>

      <button
        type="button"
        onClick={reset}
        className="ml-auto rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        필터 초기화
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-600">
      {label}
      {children}
    </label>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/_components/ApplicantsFilterBar.tsx
git commit -m "feat(applicants): ApplicantsFilterBar 컴포넌트 추가"
```

## Task F1-6: ApplicantTable 확장 (컬럼 + disabled + 면접 분기 + 행 클릭)

**Files:**
- Modify: `.../applicants/_components/ApplicantTable.tsx`

- [ ] **Step 1: 컬럼 + 행 동작 변경**

기존 ApplicantTable 의 props 에 `useInterview: boolean`, `clubId: number`, `recruitmentId: number` 추가. column 정의에 학과 / 학년 / 면접일정(conditional) / 내 점수 추가.

핵심 변경 부분:

```tsx
import { useRouter } from 'next/navigation';
// ...

type Props = {
  applicants: Applicant[];
  selectedIds: number[];
  onSelect: (next: number[]) => void;
  useInterview: boolean;
  clubId: number;
  recruitmentId: number;
};

export function ApplicantTable({
  applicants, selectedIds, onSelect, useInterview, clubId, recruitmentId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggleRow = (applicationId: number, status: ApplicationStatus) => {
    if (isTerminal(status)) return;
    onSelect(
      selectedIds.includes(applicationId)
        ? selectedIds.filter((id) => id !== applicationId)
        : [...selectedIds, applicationId],
    );
  };

  const navigateToDetail = (applicationId: number) => {
    const qs = searchParams.toString();
    const href = `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${applicationId}${qs ? `?${qs}` : ''}`;
    router.push(href);
  };

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-xs text-neutral-600">
          <th className="w-10 px-2 py-2"></th>
          <th className="px-2 py-2">이름</th>
          <th className="px-2 py-2">학과</th>
          <th className="px-2 py-2">학번</th>
          <th className="px-2 py-2">학년</th>
          <th className="px-2 py-2">지원일시</th>
          <th className="px-2 py-2">상태</th>
          {useInterview && <th className="px-2 py-2">면접일정</th>}
          <th className="px-2 py-2">내 점수</th>
        </tr>
      </thead>
      <tbody>
        {applicants.map((applicant) => {
          const terminal = isTerminal(applicant.status);
          return (
            <tr
              key={applicant.applicationId}
              onClick={() => navigateToDetail(applicant.applicationId)}
              className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50"
            >
              <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(applicant.applicationId)}
                  disabled={terminal}
                  onChange={() => toggleRow(applicant.applicationId, applicant.status)}
                  title={terminal ? '최종 상태인 지원자는 선택할 수 없습니다.' : undefined}
                  aria-label={`${applicant.userName} 선택`}
                />
              </td>
              <td className="px-2 py-2">{applicant.userName}</td>
              <td className="px-2 py-2">
                {COLLEGE_LABEL[applicant.college]} · {applicant.major}
              </td>
              <td className="px-2 py-2">{applicant.studentId}</td>
              <td className="px-2 py-2">{GRADE_LABEL[applicant.grade]}</td>
              <td className="px-2 py-2">{formatDateTime(applicant.submittedAt)}</td>
              <td className="px-2 py-2">{APPLICATION_STATUS_LABEL[applicant.status]}</td>
              {useInterview && (
                <td className="px-2 py-2">
                  {applicant.interviewAt ? formatDateTime(applicant.interviewAt) : '—'}
                </td>
              )}
              <td className="px-2 py-2">
                <MyScoreBadge score={applicant.myScore} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function isTerminal(status: ApplicationStatus): boolean {
  return status === 'ACCEPTED' || status === 'REJECTED';
}

function MyScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-neutral-400">—</span>;
  const color =
    score >= 4 ? 'bg-emerald-100 text-emerald-700'
    : score === 3 ? 'bg-neutral-100 text-neutral-700'
    : 'bg-rose-100 text-rose-700';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${color}`}>
      {score} / 5
    </span>
  );
}
```

`COLLEGE_LABEL` / `GRADE_LABEL` 은 `_constants/` 에 매핑 객체로 추가. 위치는 기존 `_constants/application-status.ts` 패턴 따름.

- [ ] **Step 2: 컴파일 + 커밋**

```bash
pnpm typecheck
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/_components/ApplicantTable.tsx \
        frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/_constants/
git commit -m "feat(applicants): 목록 테이블에 학과·학년·면접일정·내 점수 컬럼 + terminal disabled 추가"
```

## Task F1-7: BulkActionBar 분기

**Files:**
- Modify: `.../applicants/_components/BulkActionBar.tsx`

- [ ] **Step 1: useInterview prop 추가 + INTERVIEW_PENDING 분기**

```tsx
type Props = {
  selectedCount: number;
  onBulkAction: (target: ApplicationStatus) => void;
  useInterview: boolean;
};

export function BulkActionBar({ selectedCount, onBulkAction, useInterview }: Props) {
  if (selectedCount === 0) return null;
  return (
    <div className="sticky bottom-0 flex items-center gap-2 border-t border-neutral-200 bg-white p-3">
      <span className="text-sm text-neutral-700">{selectedCount}명 선택</span>
      <div className="ml-auto flex gap-2">
        <button onClick={() => onBulkAction('UNDER_REVIEW')} className="...">서류검토</button>
        {useInterview && (
          <button onClick={() => onBulkAction('INTERVIEW_PENDING')} className="...">면접대기</button>
        )}
        <button onClick={() => onBulkAction('ACCEPTED')} className="...">합격</button>
        <button onClick={() => onBulkAction('REJECTED')} className="...">불합격</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/_components/BulkActionBar.tsx
git commit -m "feat(applicants): BulkActionBar 가 useInterview=false 시 면접대기 옵션 숨김"
```

## Task F1-8: page.tsx — URL 동기화 + 컴포넌트 통합

**Files:**
- Modify: `.../applicants/page.tsx`

- [ ] **Step 1: 페이지 전체 재작성**

```tsx
'use client';

import { use, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@duing/api';
import type { ApplicantsFilters, ApplicationStatus, BulkUpdateApplicationStatusResult, College } from '@duing/types';
import {
  useRecruitmentDetailQuery,
  useApplicantsQuery,
  useBulkUpdateApplicationStatusMutation,
} from '@duing/hooks';
import { toRoute } from '../../../../../../_lib/route';
import { ApplicantTable } from './_components/ApplicantTable';
import { ApplicantsFilterBar } from './_components/ApplicantsFilterBar';
import { BulkActionBar } from './_components/BulkActionBar';
import { BulkConfirmDialog } from './_components/BulkConfirmDialog';

type Params = { params: Promise<{ clubId: string; recruitmentId: string }> };

export default function ApplicantsPage({ params }: Params) {
  const { clubId, recruitmentId } = use(params);
  const clubIdNum = Number(clubId);
  const recruitmentIdNum = Number(recruitmentId);

  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo<ApplicantsFilters>(() => ({
    status: (searchParams.get('status') as ApplicationStatus | null) ?? undefined,
    college: (searchParams.get('college') as College | null) ?? undefined,
    q: searchParams.get('q') ?? undefined,
    submittedFrom: searchParams.get('submittedFrom') ?? undefined,
    submittedTo: searchParams.get('submittedTo') ?? undefined,
  }), [searchParams]);

  const updateFilters = useCallback((next: ApplicantsFilters) => {
    const params = new URLSearchParams();
    if (next.status) params.set('status', next.status);
    if (next.college) params.set('college', next.college);
    if (next.q) params.set('q', next.q);
    if (next.submittedFrom) params.set('submittedFrom', next.submittedFrom);
    if (next.submittedTo) params.set('submittedTo', next.submittedTo);
    router.replace(`?${params.toString()}`);
  }, [router]);

  const { data: recruitment } = useRecruitmentDetailQuery(recruitmentIdNum);
  const { data: applicants = [], isLoading } = useApplicantsQuery(recruitmentIdNum, filters);
  const bulkMutation = useBulkUpdateApplicationStatusMutation();

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkTarget, setBulkTarget] = useState<ApplicationStatus | null>(null);

  const useInterview = recruitment?.useInterview ?? true;

  const handleBulkConfirm = async () => {
    if (!bulkTarget) return;
    try {
      const result: BulkUpdateApplicationStatusResult = await bulkMutation.mutateAsync({
        applicationIds: selectedIds,
        status: bulkTarget,
      });
      // 토스트 표시 — 기존 패턴 유지
      // ...
      setSelectedIds([]);
      setBulkTarget(null);
    } catch (error) {
      // 기존 에러 처리
    }
  };

  return (
    <main className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          {recruitment?.title ?? '...'} · 지원자 {applicants.length}명
        </h1>
        <Link href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/stats`)}>통계</Link>
      </header>

      <ApplicantsFilterBar filters={filters} onChange={updateFilters} useInterview={useInterview} />

      {isLoading ? (
        <p>로딩중...</p>
      ) : applicants.length === 0 ? (
        <p className="py-8 text-center text-neutral-500">
          {Object.values(filters).some(Boolean) ? '검색 결과 없음' : '지원자가 아직 없습니다'}
        </p>
      ) : (
        <ApplicantTable
          applicants={applicants}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          useInterview={useInterview}
          clubId={clubIdNum}
          recruitmentId={recruitmentIdNum}
        />
      )}

      <BulkActionBar
        selectedCount={selectedIds.length}
        onBulkAction={setBulkTarget}
        useInterview={useInterview}
      />
      {bulkTarget && (
        <BulkConfirmDialog
          target={bulkTarget}
          count={selectedIds.length}
          onConfirm={handleBulkConfirm}
          onClose={() => setBulkTarget(null)}
        />
      )}
    </main>
  );
}
```

(기존 ApplicantDetailModal import 제거. 행 클릭은 ApplicantTable 내부에서 router.push 처리.)

- [ ] **Step 2: 빌드 + 커밋**

```bash
pnpm build
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/page.tsx
git commit -m "feat(applicants): 목록 페이지에 필터 바·URL 동기화 통합 (모달 제거 예정)"
```

## Task F1-9: 테스트

**Files:**
- Create: `frontend/apps/web/test/manage/applicants/applicants-filter-bar.test.tsx`
- Create: `frontend/apps/web/test/manage/applicants/applicant-table-extension.test.tsx`

- [ ] **Step 1: FilterBar 테스트**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicantsFilterBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantsFilterBar';

describe('ApplicantsFilterBar', () => {
  it('상태 드롭다운 변경 시 onChange 가 status 와 함께 호출된다', async () => {
    const onChange = vi.fn();
    render(<ApplicantsFilterBar filters={{}} onChange={onChange} useInterview />);

    await userEvent.selectOptions(screen.getByLabelText('상태'), 'UNDER_REVIEW');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'UNDER_REVIEW' }));
  });

  it('useInterview=false 면 INTERVIEW_PENDING 옵션이 없다', () => {
    render(<ApplicantsFilterBar filters={{}} onChange={() => {}} useInterview={false} />);
    expect(screen.queryByRole('option', { name: /면접대기/ })).not.toBeInTheDocument();
  });

  it('필터 초기화 버튼은 빈 객체로 onChange 호출', async () => {
    const onChange = vi.fn();
    render(<ApplicantsFilterBar filters={{ status: 'UNDER_REVIEW' }} onChange={onChange} useInterview />);

    await userEvent.click(screen.getByText('필터 초기화'));

    expect(onChange).toHaveBeenCalledWith({});
  });

  it('검색창 입력은 debounce 후 onChange 에 반영', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ApplicantsFilterBar filters={{}} onChange={onChange} useInterview />);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText('지원자 검색'), '홍길동');

    await vi.advanceTimersByTimeAsync(350);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: '홍길동' }));

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: ApplicantTable 테스트**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApplicantTable } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantTable';

const baseApplicant = {
  applicationId: 1, userId: 1, userName: '홍길동', studentId: '20200001', email: 'h@ex.com',
  college: 'ENGINEERING' as const, major: '컴퓨터공학', grade: 'THIRD' as const,
  answers: [], status: 'SUBMITTED' as const,
  submittedAt: '2026-05-01T10:00:00', interviewAt: null, myScore: null,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('ApplicantTable 확장', () => {
  it('myScore null → "—", 숫자 → 뱃지', () => {
    render(
      <ApplicantTable
        applicants={[
          baseApplicant,
          { ...baseApplicant, applicationId: 2, userName: '김민수', myScore: 4 },
        ]}
        selectedIds={[]}
        onSelect={() => {}}
        useInterview
        clubId={1}
        recruitmentId={1}
      />,
    );

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
  });

  it('ACCEPTED 행 체크박스 disabled + tooltip', () => {
    render(
      <ApplicantTable
        applicants={[{ ...baseApplicant, status: 'ACCEPTED' }]}
        selectedIds={[]} onSelect={() => {}}
        useInterview clubId={1} recruitmentId={1}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAttribute('title', expect.stringContaining('최종 상태'));
  });

  it('useInterview=false 면 면접일정 컬럼이 렌더되지 않는다', () => {
    render(
      <ApplicantTable
        applicants={[baseApplicant]}
        selectedIds={[]} onSelect={() => {}}
        useInterview={false} clubId={1} recruitmentId={1}
      />,
    );
    expect(screen.queryByText('면접일정')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 실행 + 커밋**

```bash
pnpm test
git add frontend/apps/web/test/manage/applicants/
git commit -m "test(applicants): FilterBar/Table 확장 단위 테스트 추가"
```

## Task F1-10: PR

- [ ] **Step 1**

```bash
git push -u origin feat/applicants-list-filter-search
gh pr create --base develop --title "feat(applicants): 운영진 목록 페이지 필터·검색·내 점수 (Spec F1)" --body "$(cat <<'EOF'
## 🚀 작업 내용
- 목록 페이지에 상태/단과대/기간/통합검색 필터 바 추가. URL 쿼리스트링과 양방향 동기화.
- ApplicantTable 에 학과·학년·면접일정·내 점수 컬럼 추가. 면접일정은 `useInterview=false` 면 컬럼 자체 숨김.
- terminal 상태(ACCEPTED/REJECTED) 행 체크박스 disabled + tooltip.
- BulkActionBar 가 `useInterview=false` 면 면접대기 옵션 제외.
- 행 클릭 시 search params 보존하며 `/applicants/[applicationId]` 로 이동 (F2 에서 라우트 추가).
- 신규 hook: `useApplicantsQuery(recruitmentId, filters)`, `useApplicantNeighborsQuery`, `useUpsert/DeleteMyApplicationEvaluationMutation`.

## 🤔 고민했던 내용
- 필터 상태는 React state 가 아닌 URL search params 가 단일 진실 — 새로고침·뒤로가기·딥링크 모두 안전.
- 검색 입력은 컴포넌트 내부 state + 300ms debounce 로 onChange 호출 빈도 줄임.
- College 라벨 매핑은 _constants 로 분리 — 향후 다국어/Enum 확장에 대비.

## 💬 리뷰 중점사항
- ApplicantTable 의 onClick 행 동작이 체크박스 클릭과 충돌하지 않는지 (stopPropagation 검증).
- useInterview 분기가 필터/Bulk/테이블 컬럼 세 곳에 모두 적용되는지.
- TanStack Query key 에 filters 가 포함되어 캐시 hit/miss 가 의도대로 동작하는지.

⚠️ ApplicantDetailModal 은 본 PR 에서 사용처만 제거하고 파일은 그대로 둔다. F2 에서 라우트 추가 후 파일 삭제.
EOF
)"
```

---

# PR F2 — 상세 페이지화 + 평가 + 타임라인 + prev/next

**브랜치:** `feat/applicant-detail-page`

**Goal:** `/applicants/[applicationId]` 라우트 추가. 평가 (`MyEvaluationCard` / `OtherEvaluationsList`), 상태 타임라인, prev/next 이동, 면접 일정 입력을 한 화면에 통합. 기존 `ApplicantDetailModal.tsx` 삭제.

## File Structure — F2

| Action | Path | 역할 |
|---|---|---|
| Create | `.../applicants/[applicationId]/page.tsx` | Server Component 라우트 |
| Create | `.../applicants/[applicationId]/_components/ApplicantDetailPage.tsx` | 클라이언트 조립 |
| Create | `.../applicants/[applicationId]/_components/ApplicantProfilePanel.tsx` | 프로필 |
| Create | `.../applicants/[applicationId]/_components/ApplicantAnswersPanel.tsx` | 응답 |
| Create | `.../applicants/[applicationId]/_components/EvaluationPanel.tsx` | 컨테이너 |
| Create | `.../applicants/[applicationId]/_components/MyEvaluationCard.tsx` | 내 평가 폼 |
| Create | `.../applicants/[applicationId]/_components/OtherEvaluationsList.tsx` | 타인 평가 리스트 |
| Create | `.../applicants/[applicationId]/_components/StatusTimeline.tsx` | newest-first 타임라인 |
| Create | `.../applicants/[applicationId]/_components/StatusActionBar.tsx` | 상태 전이 + InterviewModal |
| Create | `.../applicants/[applicationId]/_components/ApplicantNavBar.tsx` | prev/next + 목록 복귀 |
| Move | `.../applicants/_components/InterviewModal.tsx` → `.../[applicationId]/_components/InterviewModal.tsx` | 위치 이동 |
| Delete | `.../applicants/_components/ApplicantDetailModal.tsx` | 삭제 |
| Modify | `frontend/apps/web/app/me/applications/[applicationId]/page.tsx` | 영향 없음 확인 (privacy) |
| Create | `frontend/apps/web/test/manage/applicants/detail/...test.tsx` | 6 테스트 파일 |

## Task F2-0: 브랜치

- [ ] **Step 1**

```bash
git checkout develop && git pull origin develop
git checkout -b feat/applicant-detail-page
```

## Task F2-1: 라우트 page.tsx + 컨테이너 조립

**Files:**
- Create: `.../[applicationId]/page.tsx`
- Create: `.../[applicationId]/_components/ApplicantDetailPage.tsx`

- [ ] **Step 1: page.tsx (Server)**

```tsx
import { ApplicantDetailPage } from './_components/ApplicantDetailPage';

type Params = {
  params: Promise<{ clubId: string; recruitmentId: string; applicationId: string }>;
};

export default async function Page({ params }: Params) {
  const { clubId, recruitmentId, applicationId } = await params;
  return (
    <ApplicantDetailPage
      clubId={Number(clubId)}
      recruitmentId={Number(recruitmentId)}
      applicationId={Number(applicationId)}
    />
  );
}
```

- [ ] **Step 2: ApplicantDetailPage 조립**

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useApplicantDetailQuery, useRecruitmentDetailQuery } from '@duing/hooks';
import { ApplicantNavBar } from './ApplicantNavBar';
import { ApplicantProfilePanel } from './ApplicantProfilePanel';
import { ApplicantAnswersPanel } from './ApplicantAnswersPanel';
import { EvaluationPanel } from './EvaluationPanel';
import { StatusTimeline } from './StatusTimeline';
import { StatusActionBar } from './StatusActionBar';
import type { ApplicantsFilters, ApplicationStatus, College } from '@duing/types';

type Props = {
  clubId: number;
  recruitmentId: number;
  applicationId: number;
};

export function ApplicantDetailPage({ clubId, recruitmentId, applicationId }: Props) {
  const searchParams = useSearchParams();

  const filters: ApplicantsFilters = {
    status: (searchParams.get('status') as ApplicationStatus | null) ?? undefined,
    college: (searchParams.get('college') as College | null) ?? undefined,
    q: searchParams.get('q') ?? undefined,
    submittedFrom: searchParams.get('submittedFrom') ?? undefined,
    submittedTo: searchParams.get('submittedTo') ?? undefined,
  };

  const { data: recruitment } = useRecruitmentDetailQuery(recruitmentId);
  const { data: detail, isLoading } = useApplicantDetailQuery(applicationId);

  if (isLoading || !detail) {
    return <p className="p-4">로딩중...</p>;
  }

  const useInterview = recruitment?.useInterview ?? true;

  return (
    <main className="flex flex-col gap-4 p-4 max-w-6xl mx-auto">
      <ApplicantNavBar
        clubId={clubId}
        recruitmentId={recruitmentId}
        applicationId={applicationId}
        filters={filters}
        currentStatus={detail.status}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ApplicantProfilePanel detail={detail} />
          <ApplicantAnswersPanel answers={detail.answers} />
          <StatusTimeline history={detail.statusHistory} submittedAt={detail.submittedAt} />
        </div>
        <div className="flex flex-col gap-4">
          <EvaluationPanel
            applicationId={applicationId}
            myEvaluation={detail.myEvaluation}
            otherEvaluations={detail.otherEvaluations}
          />
          <StatusActionBar
            applicationId={applicationId}
            currentStatus={detail.status}
            useInterview={useInterview}
          />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/\[applicationId\]/
git commit -m "feat(applicants): 상세 라우트 페이지 + 컨테이너 추가"
```

## Task F2-2: ProfilePanel / AnswersPanel

**Files:** 2 컴포넌트

- [ ] **Step 1: ApplicantProfilePanel**

```tsx
'use client';

import type { ApplicantDetail } from '@duing/types';
import { COLLEGE_LABEL, GRADE_LABEL } from '../../../_constants/applicant-labels';
import { formatDateTime } from '../../../_lib/format';

export function ApplicantProfilePanel({ detail }: { detail: ApplicantDetail }) {
  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-2 text-base font-semibold">지원자 정보</h2>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-neutral-500">이름</dt><dd>{detail.applicant.name}</dd>
        <dt className="text-neutral-500">학번</dt><dd>{detail.applicant.studentId}</dd>
        <dt className="text-neutral-500">학과</dt>
        <dd>{COLLEGE_LABEL[detail.applicant.college]} · {detail.applicant.major}</dd>
        <dt className="text-neutral-500">학년</dt><dd>{GRADE_LABEL[detail.applicant.grade]}</dd>
        <dt className="text-neutral-500">이메일</dt><dd>{detail.applicant.email}</dd>
        <dt className="text-neutral-500">지원일시</dt><dd>{formatDateTime(detail.submittedAt)}</dd>
        {detail.interviewAt && (
          <>
            <dt className="text-neutral-500">면접일정</dt>
            <dd>
              {formatDateTime(detail.interviewAt)}
              {detail.interviewLocation && ` · ${detail.interviewLocation}`}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
```

- [ ] **Step 2: ApplicantAnswersPanel**

```tsx
'use client';

import type { ApplicantDetail } from '@duing/types';

export function ApplicantAnswersPanel({ answers }: { answers: ApplicantDetail['answers'] }) {
  if (answers.length === 0) {
    return (
      <section className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        응답이 없습니다.
      </section>
    );
  }
  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold">응답</h2>
      <div className="flex flex-col gap-4">
        {answers.map((pair, index) => (
          <div key={index}>
            <p className="text-sm font-medium text-neutral-700">Q{index + 1}. {pair.question}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">{pair.answer || '—'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/\[applicationId\]/_components/ApplicantProfilePanel.tsx \
        frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/\[applicationId\]/_components/ApplicantAnswersPanel.tsx
git commit -m "feat(applicants): 상세 ProfilePanel / AnswersPanel 추가"
```

## Task F2-3: EvaluationPanel + MyEvaluationCard + OtherEvaluationsList

**Files:** 3 컴포넌트

- [ ] **Step 1: OtherEvaluationsList (read-only)**

```tsx
'use client';

import type { ApplicationEvaluation } from '@duing/types';
import { formatDateTime } from '../../../_lib/format';

export function OtherEvaluationsList({ evaluations }: { evaluations: ApplicationEvaluation[] }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-neutral-700">다른 운영진 평가</h3>
      {evaluations.length === 0 ? (
        <p className="text-sm text-neutral-400">다른 운영진의 평가가 아직 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {evaluations.map((eval_) => (
            <li key={eval_.evaluatorId} className="rounded border border-neutral-200 bg-white p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{eval_.evaluatorName}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                  {eval_.score} / 5
                </span>
                <span className="ml-auto text-xs text-neutral-500">
                  {formatDateTime(eval_.updatedAt)}
                </span>
              </div>
              {eval_.memo && (
                <p className="mt-2 whitespace-pre-wrap text-neutral-700">{eval_.memo}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: MyEvaluationCard (editable form)**

```tsx
'use client';

import { useState } from 'react';
import {
  useDeleteMyApplicationEvaluationMutation,
  useUpsertMyApplicationEvaluationMutation,
} from '@duing/hooks';
import type { ApplicationEvaluation } from '@duing/types';

type Props = {
  applicationId: number;
  myEvaluation: ApplicationEvaluation | null;
};

export function MyEvaluationCard({ applicationId, myEvaluation }: Props) {
  const [isEditing, setEditing] = useState(myEvaluation === null);
  const [score, setScore] = useState<number>(myEvaluation?.score ?? 3);
  const [memo, setMemo] = useState(myEvaluation?.memo ?? '');

  const upsert = useUpsertMyApplicationEvaluationMutation();
  const remove = useDeleteMyApplicationEvaluationMutation();

  const handleSave = async () => {
    await upsert.mutateAsync({ applicationId, payload: { score, memo: memo.trim() || null } });
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm('내 평가를 삭제할까요?')) return;
    await remove.mutateAsync(applicationId);
    setScore(3);
    setMemo('');
    setEditing(true);
  };

  if (!isEditing && myEvaluation) {
    return (
      <section className="rounded border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">내 평가</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs">{myEvaluation.score} / 5</span>
          <button onClick={() => setEditing(true)} className="ml-auto text-xs text-blue-600 hover:underline">수정</button>
          <button onClick={handleDelete} className="text-xs text-rose-600 hover:underline">삭제</button>
        </div>
        {myEvaluation.memo && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{myEvaluation.memo}</p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded border border-blue-200 bg-blue-50 p-4">
      <h3 className="mb-2 text-sm font-semibold">내 평가</h3>
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-600">점수</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex items-center gap-1 text-sm">
            <input
              type="radio"
              name="score"
              value={n}
              checked={score === n}
              onChange={() => setScore(n)}
            />
            {n}
          </label>
        ))}
      </div>
      <textarea
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="강점, 약점, 협업 경험, 추가 검증 필요 사항 등"
        className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        rows={4}
        maxLength={2000}
      />
      <p className="mt-1 text-xs text-neutral-500">
        메모는 평가 근거 작성에 사용됩니다. 지원자에게는 공개되지 않습니다.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleSave}
          disabled={upsert.isPending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          저장
        </button>
        {myEvaluation && (
          <button onClick={() => setEditing(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm">
            취소
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: EvaluationPanel (조립)**

```tsx
'use client';

import type { ApplicationEvaluation } from '@duing/types';
import { MyEvaluationCard } from './MyEvaluationCard';
import { OtherEvaluationsList } from './OtherEvaluationsList';

type Props = {
  applicationId: number;
  myEvaluation: ApplicationEvaluation | null;
  otherEvaluations: ApplicationEvaluation[];
};

export function EvaluationPanel({ applicationId, myEvaluation, otherEvaluations }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <MyEvaluationCard applicationId={applicationId} myEvaluation={myEvaluation} />
      <OtherEvaluationsList evaluations={otherEvaluations} />
    </div>
  );
}
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/\[applicationId\]/_components/EvaluationPanel.tsx \
        frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/\[applicationId\]/_components/MyEvaluationCard.tsx \
        frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/\[applicationId\]/_components/OtherEvaluationsList.tsx
git commit -m "feat(applicants): 평가 패널 (내 평가 폼 + 타인 평가 리스트) 추가"
```

## Task F2-4: StatusTimeline (newest-first)

**Files:**
- Create: `.../[applicationId]/_components/StatusTimeline.tsx`

- [ ] **Step 1: 컴포넌트**

```tsx
'use client';

import type { ApplicationStatusHistoryItem } from '@duing/types';
import { APPLICATION_STATUS_LABEL } from '../../../_constants/application-status';
import { formatDateTime } from '../../../_lib/format';

type Props = {
  history: ApplicationStatusHistoryItem[];
  submittedAt: string;   // application.createdAt — SUBMITTED 진입 시각
};

export function StatusTimeline({ history, submittedAt }: Props) {
  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold">상태 변경 이력</h2>
      <ol className="flex flex-col gap-3">
        {history.map((item, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-500" aria-hidden />
            <div className="flex-1">
              <p className="text-sm">
                <strong>{APPLICATION_STATUS_LABEL[item.newStatus]}</strong>
                <span className="text-neutral-500"> ← {APPLICATION_STATUS_LABEL[item.previousStatus]}</span>
              </p>
              <p className="text-xs text-neutral-500">
                {item.changedByName} · {formatDateTime(item.changedAt)}
              </p>
            </div>
          </li>
        ))}
        {/* SUBMITTED 시작점 */}
        <li className="flex items-start gap-3">
          <span className="mt-1 inline-block h-2 w-2 rounded-full bg-neutral-300" aria-hidden />
          <div className="flex-1">
            <p className="text-sm text-neutral-600">{APPLICATION_STATUS_LABEL.SUBMITTED}</p>
            <p className="text-xs text-neutral-500">{formatDateTime(submittedAt)}</p>
          </div>
        </li>
      </ol>
    </section>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/\[applicationId\]/_components/StatusTimeline.tsx
git commit -m "feat(applicants): 상태 타임라인 (newest-first) 추가"
```

## Task F2-5: StatusActionBar + InterviewModal 이전

**Files:**
- Move: 기존 InterviewModal 을 `[applicationId]/_components/` 로 이동
- Create: `StatusActionBar.tsx`

- [ ] **Step 1: 기존 InterviewModal 파일 이동**

```bash
git mv frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/_components/InterviewModal.tsx \
       frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/\[applicationId\]/_components/InterviewModal.tsx
```

내부 import 경로 보정.

- [ ] **Step 2: StatusActionBar 작성**

```tsx
'use client';

import { useState } from 'react';
import { useUpdateApplicationStatusMutation } from '@duing/hooks';
import type { ApplicationStatus } from '@duing/types';
import { allowedTransitionsFrom } from '../../_components/applicationStatusTransitions';
import { APPLICATION_STATUS_LABEL } from '../../../_constants/application-status';
import { InterviewModal } from './InterviewModal';

type Props = {
  applicationId: number;
  currentStatus: ApplicationStatus;
  useInterview: boolean;
};

export function StatusActionBar({ applicationId, currentStatus, useInterview }: Props) {
  const [showInterview, setShowInterview] = useState(false);
  const update = useUpdateApplicationStatusMutation();

  const transitions = allowedTransitionsFrom(currentStatus, useInterview);

  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold">상태 변경</h2>
      <div className="flex flex-wrap gap-2">
        {transitions.map((target) => (
          <button
            key={target}
            onClick={() => update.mutate({ applicationId, status: target })}
            disabled={update.isPending}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {APPLICATION_STATUS_LABEL[target]} 로
          </button>
        ))}
      </div>
      {currentStatus === 'INTERVIEW_PENDING' && (
        <button
          onClick={() => setShowInterview(true)}
          className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          면접 일정 입력
        </button>
      )}
      {showInterview && (
        <InterviewModal
          applicationId={applicationId}
          onClose={() => setShowInterview(false)}
        />
      )}
    </section>
  );
}
```

`applicationStatusTransitions.ts` 의 `allowedTransitionsFrom` 시그니처에 `useInterview` 파라미터가 없으면 추가하고 분기 로직 보강:

```ts
export function allowedTransitionsFrom(
  status: ApplicationStatus,
  useInterview: boolean,
): ApplicationStatus[] {
  switch (status) {
    case 'SUBMITTED': return ['UNDER_REVIEW'];
    case 'UNDER_REVIEW':
      return useInterview
        ? ['INTERVIEW_PENDING', 'REJECTED']
        : ['ACCEPTED', 'REJECTED'];
    case 'INTERVIEW_PENDING': return ['ACCEPTED', 'REJECTED'];
    case 'ACCEPTED':
    case 'REJECTED': return [];
  }
}
```

- [ ] **Step 3: 컴파일 + 커밋**

```bash
pnpm typecheck
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/
git commit -m "feat(applicants): StatusActionBar + InterviewModal 상세 페이지 이전"
```

## Task F2-6: ApplicantNavBar (prev/next)

**Files:**
- Create: `.../[applicationId]/_components/ApplicantNavBar.tsx`

- [ ] **Step 1: 컴포넌트**

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApplicantNeighborsQuery } from '@duing/hooks';
import type { ApplicantsFilters, ApplicationStatus } from '@duing/types';
import { APPLICATION_STATUS_LABEL } from '../../../_constants/application-status';

type Props = {
  clubId: number;
  recruitmentId: number;
  applicationId: number;
  filters: ApplicantsFilters;
  currentStatus: ApplicationStatus;
};

export function ApplicantNavBar({ clubId, recruitmentId, applicationId, filters, currentStatus }: Props) {
  const router = useRouter();
  const { data: neighbors } = useApplicantNeighborsQuery(recruitmentId, applicationId, filters);

  const listHref = buildListHref(clubId, recruitmentId, filters);

  const buildDetailHref = (id: number | null | undefined) => {
    if (!id) return undefined;
    const qs = filtersToQuery(filters);
    return `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${id}${qs ? `?${qs}` : ''}`;
  };

  const prevHref = buildDetailHref(neighbors?.prevApplicationId);
  const nextHref = buildDetailHref(neighbors?.nextApplicationId);

  return (
    <nav className="flex items-center gap-2 rounded border border-neutral-200 bg-white p-3">
      <Link href={listHref} className="text-sm text-neutral-600 hover:underline">← 목록</Link>
      <button
        type="button"
        disabled={!prevHref}
        onClick={() => prevHref && router.push(prevHref)}
        className="ml-3 rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40"
      >
        ‹ 이전
      </button>
      <button
        type="button"
        disabled={!nextHref}
        onClick={() => nextHref && router.push(nextHref)}
        className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40"
      >
        다음 ›
      </button>
      <span className="ml-auto rounded-full bg-neutral-100 px-3 py-1 text-xs">
        {APPLICATION_STATUS_LABEL[currentStatus]}
      </span>
    </nav>
  );
}

function buildListHref(clubId: number, recruitmentId: number, filters: ApplicantsFilters): string {
  const qs = filtersToQuery(filters);
  return `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants${qs ? `?${qs}` : ''}`;
}

function filtersToQuery(filters: ApplicantsFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.college) params.set('college', filters.college);
  if (filters.q) params.set('q', filters.q);
  if (filters.submittedFrom) params.set('submittedFrom', filters.submittedFrom);
  if (filters.submittedTo) params.set('submittedTo', filters.submittedTo);
  return params.toString();
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/\[applicationId\]/_components/ApplicantNavBar.tsx
git commit -m "feat(applicants): prev/next neighbor 이동 NavBar 추가"
```

## Task F2-7: ApplicantDetailModal 삭제

**Files:**
- Delete: `.../applicants/_components/ApplicantDetailModal.tsx`

- [ ] **Step 1: 파일 삭제 + 잔여 import 확인**

```bash
git rm frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/_components/ApplicantDetailModal.tsx
grep -rn "ApplicantDetailModal" frontend/apps/web/ || echo "no usage"
```

Expected: `no usage`.

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```

Expected: SUCCESS.

- [ ] **Step 3: 커밋**

```bash
git commit -m "chore(applicants): ApplicantDetailModal 제거 (상세 페이지로 대체)"
```

## Task F2-8: 테스트

**Files:**
- Create: 6 테스트 파일 `frontend/apps/web/test/manage/applicants/detail/...`

- [ ] **Step 1: MyEvaluationCard 테스트**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MyEvaluationCard } from '@/app/manage/.../[applicationId]/_components/MyEvaluationCard';

const mockUpsert = vi.fn();
const mockDelete = vi.fn();
vi.mock('@duing/hooks', () => ({
  useUpsertMyApplicationEvaluationMutation: () => ({ mutateAsync: mockUpsert, isPending: false }),
  useDeleteMyApplicationEvaluationMutation: () => ({ mutateAsync: mockDelete }),
}));

function wrap(ui: React.ReactNode) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('MyEvaluationCard', () => {
  it('빈 상태에서 폼 노출 + 저장 시 mutation 호출', async () => {
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={null} />);
    expect(screen.getByText('내 평가')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/강점, 약점/)).toBeInTheDocument();

    await userEvent.click(screen.getByText('저장'));
    expect(mockUpsert).toHaveBeenCalledWith({
      applicationId: 1,
      payload: { score: 3, memo: null },
    });
  });

  it('기존 평가 있을 때 카드 표시 + 수정 버튼', async () => {
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={{
      evaluatorId: 1, evaluatorName: '나', score: 4, memo: '기존 메모',
      createdAt: '', updatedAt: '',
    }} />);

    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('기존 메모')).toBeInTheDocument();

    await userEvent.click(screen.getByText('수정'));
    expect(screen.getByPlaceholderText(/강점, 약점/)).toBeInTheDocument();
  });

  it('삭제 confirm 통과 시 mutation 호출 + 빈 상태로 복귀', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDelete.mockResolvedValue(undefined);
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={{
      evaluatorId: 1, evaluatorName: '나', score: 5, memo: null,
      createdAt: '', updatedAt: '',
    }} />);

    await userEvent.click(screen.getByText('삭제'));
    expect(mockDelete).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: OtherEvaluationsList 테스트**

```tsx
describe('OtherEvaluationsList', () => {
  it('빈 상태 메시지 표시', () => {
    render(<OtherEvaluationsList evaluations={[]} />);
    expect(screen.getByText(/다른 운영진의 평가가 아직 없어요/)).toBeInTheDocument();
  });

  it('다건 평가 리스트 렌더', () => {
    render(<OtherEvaluationsList evaluations={[
      { evaluatorId: 2, evaluatorName: '김민지', score: 4, memo: '강점 있음', createdAt: '', updatedAt: '2026-06-01T10:00' },
    ]} />);
    expect(screen.getByText('김민지')).toBeInTheDocument();
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('강점 있음')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: StatusActionBar 테스트**

```tsx
describe('StatusActionBar', () => {
  it('UNDER_REVIEW + useInterview=true 면 INTERVIEW_PENDING / REJECTED 버튼 노출', () => {
    render(<StatusActionBar applicationId={1} currentStatus="UNDER_REVIEW" useInterview />);
    expect(screen.getByRole('button', { name: /면접대기/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /합격/ })).not.toBeInTheDocument();
  });

  it('UNDER_REVIEW + useInterview=false 면 ACCEPTED / REJECTED 직행', () => {
    render(<StatusActionBar applicationId={1} currentStatus="UNDER_REVIEW" useInterview={false} />);
    expect(screen.queryByRole('button', { name: /면접대기/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /합격/ })).toBeInTheDocument();
  });

  it('INTERVIEW_PENDING 상태에서 "면접 일정 입력" 버튼 노출', () => {
    render(<StatusActionBar applicationId={1} currentStatus="INTERVIEW_PENDING" useInterview />);
    expect(screen.getByText('면접 일정 입력')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: StatusTimeline 테스트**

```tsx
describe('StatusTimeline', () => {
  it('newest-first 정렬: 인덱스 0 의 newStatus 가 가장 최근', () => {
    render(<StatusTimeline
      history={[
        { previousStatus: 'UNDER_REVIEW', newStatus: 'INTERVIEW_PENDING', changedById: 1, changedByName: '김민지', changedAt: '2026-06-05T14:23:00' },
        { previousStatus: 'SUBMITTED', newStatus: 'UNDER_REVIEW', changedById: 2, changedByName: '박지호', changedAt: '2026-06-03T10:11:00' },
      ]}
      submittedAt="2026-06-01T09:05:00"
    />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('면접대기');
    expect(items[items.length - 1]).toHaveTextContent('제출');  // SUBMITTED 시작점
  });

  it('history 가 비어있어도 SUBMITTED 시작점 도트만 표시', () => {
    render(<StatusTimeline history={[]} submittedAt="2026-06-01T09:05:00" />);
    expect(screen.getByText(/제출/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: ApplicantNavBar 테스트**

```tsx
const mockNeighbors = vi.fn();
vi.mock('@duing/hooks', () => ({
  useApplicantNeighborsQuery: () => ({ data: mockNeighbors() }),
}));

describe('ApplicantNavBar', () => {
  it('prevApplicationId null 이면 이전 버튼 disabled', () => {
    mockNeighbors.mockReturnValue({ prevApplicationId: null, nextApplicationId: 2 });
    render(<ApplicantNavBar clubId={1} recruitmentId={1} applicationId={1} filters={{}} currentStatus="SUBMITTED" />);
    expect(screen.getByText('‹ 이전')).toBeDisabled();
    expect(screen.getByText('다음 ›')).not.toBeDisabled();
  });

  it('필터를 가진 채로 prev/next href 가 search params 를 유지', () => {
    mockNeighbors.mockReturnValue({ prevApplicationId: 5, nextApplicationId: null });
    render(<ApplicantNavBar
      clubId={1} recruitmentId={2} applicationId={3}
      filters={{ status: 'UNDER_REVIEW', q: '홍길동' }}
      currentStatus="UNDER_REVIEW"
    />);

    const list = screen.getByText('← 목록').closest('a');
    expect(list).toHaveAttribute('href', expect.stringContaining('status=UNDER_REVIEW'));
    expect(list).toHaveAttribute('href', expect.stringContaining('q='));
  });
});
```

- [ ] **Step 6: 통합 — 상세 페이지 다음 지원자 이동**

```tsx
describe('ApplicantDetailPage 통합', () => {
  // Mock 전체 hooks, router push 검증.
  // 1. detail 로드 → ProfilePanel·AnswersPanel·EvaluationPanel 모두 렌더
  // 2. "다음 ›" 클릭 시 router.push 호출에 search params 포함
});
```

- [ ] **Step 7: 실행 + 커밋**

```bash
pnpm test
git add frontend/apps/web/test/manage/applicants/detail/
git commit -m "test(applicants): 상세 페이지 컴포넌트 단위 테스트 추가"
```

## Task F2-9: 빌드 + 수동 회귀

- [ ] **Step 1: 빌드 + lint + typecheck**

```bash
cd frontend
pnpm typecheck && pnpm lint && pnpm build
```

Expected: ALL PASS.

- [ ] **Step 2: dev 서버 띄워 수동 확인**

```bash
pnpm dev
```

- 목록 → 상세 진입 시 필터 search params 유지
- 평가 작성 → 저장 후 카드 표시 + 목록의 내 점수 갱신
- 다음 지원자 이동 시 URL 변경 + 동일 필터 유지
- 면접 미사용 모집에서 INTERVIEW_PENDING 관련 UI 미노출

수동 확인 후 변경 없으면 다음 단계.

## Task F2-10: PR

- [ ] **Step 1**

```bash
git push -u origin feat/applicant-detail-page
gh pr create --base develop --title "feat(applicants): 운영진 지원자 상세 페이지 + 평가 + 타임라인 (Spec F2)" --body "$(cat <<'EOF'
## 🚀 작업 내용
- 상세 라우트 `/applicants/[applicationId]/page.tsx` 추가. 기존 ApplicantDetailModal 제거.
- `ApplicantProfilePanel` / `ApplicantAnswersPanel` / `EvaluationPanel` (Mine + Others 분리) / `StatusTimeline` (newest-first) / `StatusActionBar` / `ApplicantNavBar`.
- InterviewModal 을 상세 페이지 하위로 이동, INTERVIEW_PENDING 상태에서만 트리거.
- prev/next 이동은 backend neighbors 엔드포인트 호출 (캐시 의존 X).
- 모든 페이지 이동·링크가 현재 필터 search params 를 보존.

## 🤔 고민했던 내용
- 모달이 아닌 페이지로 가는 이유: 딥링크·새로고침·뒤로가기·prev/next 모두 자연스럽게 처리.
- 내 평가 / 타인 평가는 backend 응답에서 이미 분리되어 옴 (`myEvaluation` / `otherEvaluations`) — 프론트는 분기 로직 불필요.
- 평가 저장 mutation 의 invalidateQueries 가 detail 뿐 아니라 applicants 목록도 무효화 → 목록의 내 점수가 즉시 갱신.

## 💬 리뷰 중점사항
- ApplicantNavBar 의 prev/next 의미가 spec 과 일치 (prev=더 최근).
- privacy 보장: ApplicantDetail 의 evaluations 가 운영진 응답에서만 들어옴. `me/applications/...` 라우트는 변경 없음.
- StatusActionBar 의 transition 분기가 useInterview=true/false 양쪽 모두 spec 매트릭스대로.
EOF
)"
```

---

## Self-Review 체크리스트 (이 plan 실행 시)

1. F1 머지 후: 행 클릭 시 라우트가 아직 없음(F2 전). 임시로 404 처리. F2 직후 머지 권장.
2. F2 머지 전: F1 의 page.tsx 에서 `ApplicantDetailModal` import 가 모두 제거되어 있는지 확인.
3. F2 머지 후: dev 서버에서 면접 미사용 모집 / 사용 모집 두 케이스 모두 수동 확인.
4. Backend B1~B4 가 모두 머지된 상태에서 시작해야 응답 필드들이 실제로 채워짐.

# 지원자 관리 목록 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지원자 관리 **목록 화면**을 운영 콘솔의 duing 디자인 언어로 통일하고, 데스크탑·태블릿·모바일 각각에 맞는 밀도와 선택·필터 UX를 제공한다.

**Architecture:** `ApplicantTable.tsx` 한 파일이 데스크탑 표와 모바일 카드를 모두 들고 있다. 책임별로 쪼갠다 — 상태 색·선택·카운트 계산은 `_lib/` 순수 모듈로, 표(`ApplicantTable`)와 카드 리스트(`ApplicantCardList`)를 분리, 필터는 칩(`StatusFilterChips`)·시트(`ApplicantsFilterSheet`)·조립부(`ApplicantsFilterBar`)로. 페이지는 조립·선택 상태·라우팅만 맡는다.

**Tech Stack:** Next.js 15 App Router / React 19 / TanStack Query / Tailwind (duing 토큰) / Radix Sheet / vitest + @testing-library/react

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-09-applicants-list-redesign-design.md` — 충돌 시 설계 문서 우선.
- **백엔드·DB·상태 전이·API contract 변경 금지.** 신규 API 금지.
- **범위 밖**: 메일 발송, CSV, 파이프라인/칸반, 지원자 상세 화면 리디자인.
- `any` / `as` 금지, 타입 선언은 `type`, 변수명 축약(`e`·`data`·`res`) 금지.
- 반응형: **≤1023px 카드 / 1024~1279px 표(단과대·학번 숨김) / ≥1280px 표(전 열)**. `lg:`=1024, `xl:`=1280.
- 상태 라벨은 `APPLICATION_STATUS_LABEL`(지원 완료 / 보류 / 면접 대상 / 합격 / 불합격)만 쓴다.
- 색 토큰: `card` / `bg-cream` / `bg-cream/60` / `border-line` / `border-sage` / `text-ink` / `text-ink-deep` / `text-charcoal-2` / `text-charcoal-3` / `bg-paper` / `bg-graysoft`.
- 모바일 체크박스 정책(PR #939) 유지: 선택 가능 → 44×44 라벨 + 전파 차단, 최종 상태 → 인터랙티브 라벨 없음 + `disabled:pointer-events-none`.
- CLOSED 모집(`finalizeOnly`)에서 되돌리는 액션을 감추는 기존 로직 유지.
- 테스트 cwd 는 `frontend/apps/web`, 명령은 `pnpm exec vitest run <경로>`. **각 셸 명령은 독립된 `cd` 로 쓴다** — 한 블록에서 상대 `cd` 를 이어 쓰면 두 번째가 실패한다.
- 커밋은 Conventional Commits + 한국어. Claude 공동저자 라인 금지.

### 태스크 경계 원칙 — 브랜치는 항상 동작해야 한다

컴포넌트의 props 를 바꾸는 태스크는 **같은 태스크 안에서 `page.tsx` 호출부까지 고친다.** 중간에
"테스트는 통과하지만 화면이 빈" 상태를 만들지 않는다. 그래서 아래 태스크들의 Files 에는 `page.tsx` 가
거의 항상 포함된다.

### 계획 리뷰에서 반영한 함정 (각 태스크 본문에 내려와 있다)

1. 최종 상태 술어는 새로 만들지 않는다 — `_constants/application-status.ts` 의 `isTerminalApplicationStatus` 를 쓴다.
2. 칩의 접근 이름은 `aria-label` 로 직접 준다 — JSX 인라인 `<span>` 은 accname 에 공백을 안 넣어 "전체5명" 이 된다.
3. `필터 초기화` 는 **한 벌만** 렌더한다 — 두 벌이면 jsdom 이 둘 다 잡아 `getByRole` 이 터진다.
4. 표 컨테이너의 `overflow-x-auto` 는 남긴다(최후 방어선).
5. 데스크탑 지원일 열은 `formatDateTimeKst` + 헤더 `지원일시` 유지.
6. 이름은 `next/link` 로 감싼다(표·카드 모두). `href` 는 페이지가 만들어 props 로 내린다.
7. 필터 변경 시 선택은 정리하되 **검색어 변경은 건드리지 않는다**.
8. `stats/summary` 는 쓰지 않는다 — 카운트는 목록에서 파생한다.
9. `useApplicantsQuery` 에 `placeholderData: keepPreviousData` + 갱신 중 딤 신호.
10. `BulkActionBar` 내부 컨테이너도 `max-w-6xl` 로 동기화.
11. `page.tsx` 의 헤더·배너·알림·빈 상태·푸터도 콘솔 토큰으로 재도색.
12. 상태 배지 팔레트는 현행 유지(`.pill-*` 로 옮기지 않는다).

---

### Task 1: 공용 계산 모듈

UI 변화 없음. 표·카드가 갈라질 때 복제될 것들을 먼저 순수 모듈로 내린다.

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantStatus.ts`
- Create: `.../applicants/_lib/applicantSelection.ts`
- Create: `.../applicants/_lib/applicantCounts.ts`
- Modify: `.../applicants/_components/ApplicantTable.tsx` (자체 `STATUS_BADGE_CLASS`·`isTerminalStatus` 정의를 import 로 교체)
- Test: `frontend/apps/web/test/manage/applicants/applicant-list-lib.test.ts`

**Interfaces:**
- Produces:
  - `applicantStatus.ts` — `STATUS_BADGE_CLASS: Record<ApplicationStatus, string>`, `STATUS_STRIPE_CLASS: Record<ApplicationStatus, string>`
  - `applicantSelection.ts` — `selectableIds(applicants: Applicant[]): number[]`, `type SelectAllState = 'none' | 'partial' | 'all'`, `selectAllState(selected: ReadonlySet<number>, selectable: readonly number[]): SelectAllState`, `toggleSelectAll(selectable: readonly number[], state: SelectAllState): number[]`
  - `applicantCounts.ts` — `type StatusCounts = Record<ApplicationStatus, number> & { total: number }`, `countByStatus(applicants: Applicant[]): StatusCounts`
- 최종 상태 술어는 새로 만들지 않는다. `import { isTerminalApplicationStatus } from '../../../../../../../_constants/application-status'` (`_lib/` 와 `_components/` 모두 `../` 7개로 같은 깊이 — 검증됨).

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/manage/applicants/applicant-list-lib.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Applicant } from '@duing/types';
import {
  selectableIds,
  selectAllState,
  toggleSelectAll,
} from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantSelection';
import { countByStatus } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantCounts';

function makeApplicant(applicationId: number, status: Applicant['status']): Applicant {
  return {
    applicationId,
    userId: applicationId,
    userName: `지원자${applicationId}`,
    studentId: `2020000${applicationId}`,
    college: 'IT_ENGINEERING',
    major: '컴퓨터공학과',
    grade: 'JUNIOR',
    answers: [],
    status,
    submittedAt: '2026-05-01T10:00:00',
    interviewStartAt: null,
    myScore: null,
  };
}

const applicants = [
  makeApplicant(1, 'SUBMITTED'),
  makeApplicant(2, 'ACCEPTED'),
  makeApplicant(3, 'ON_HOLD'),
  makeApplicant(4, 'REJECTED'),
  makeApplicant(5, 'INTERVIEW_PENDING'),
];

describe('지원자 선택 계산', () => {
  it('최종 상태(합격·불합격)는 선택 대상에서 빠진다', () => {
    expect(selectableIds(applicants)).toEqual([1, 3, 5]);
  });

  it('선택 가능 인원이 0명이면 none', () => {
    expect(selectAllState(new Set([1, 2]), [])).toBe('none');
  });

  it('아무도 선택하지 않으면 none', () => {
    expect(selectAllState(new Set(), [1, 3, 5])).toBe('none');
  });

  it('일부만 선택하면 partial', () => {
    expect(selectAllState(new Set([1]), [1, 3, 5])).toBe('partial');
  });

  it('선택 가능 전원을 선택하면 all — 최종 상태가 섞여 있어도 all 이 된다', () => {
    expect(selectAllState(new Set([1, 3, 5]), [1, 3, 5])).toBe('all');
  });

  it('전체 선택 토글 — all 이면 비우고 그 외에는 선택 가능 전원을 채운다', () => {
    expect(toggleSelectAll([1, 3, 5], 'all')).toEqual([]);
    expect(toggleSelectAll([1, 3, 5], 'none')).toEqual([1, 3, 5]);
    expect(toggleSelectAll([1, 3, 5], 'partial')).toEqual([1, 3, 5]);
  });
});

describe('상태별 카운트', () => {
  it('목록에서 상태별로 세고 전체도 함께 낸다', () => {
    const counts = countByStatus(applicants);
    expect(counts.total).toBe(5);
    expect(counts.SUBMITTED).toBe(1);
    expect(counts.ON_HOLD).toBe(1);
    expect(counts.INTERVIEW_PENDING).toBe(1);
    expect(counts.ACCEPTED).toBe(1);
    expect(counts.REJECTED).toBe(1);
  });

  it('빈 목록은 전부 0 이다', () => {
    const counts = countByStatus([]);
    expect(counts.total).toBe(0);
    expect(counts.SUBMITTED).toBe(0);
    expect(counts.REJECTED).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicant-list-lib.test.ts`
Expected: FAIL — `Failed to resolve import ... _lib/applicantSelection`

- [ ] **Step 3: 세 모듈 구현**

`_lib/applicantStatus.ts`:

```ts
import type { ApplicationStatus } from '@duing/types';

/** 상태 배지 색 — 표·카드가 공유하는 단일 출처. 화면마다 같은 상태가 다른 색이면 안 된다. */
export const STATUS_BADGE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'bg-sky-100 text-sky-700',
  ON_HOLD: 'bg-amber-100 text-amber-700',
  INTERVIEW_PENDING: 'bg-purple-100 text-purple-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
};

/**
 * 모바일 카드 왼쪽 4px 띠 — 배지와 같은 색 계열이며 새 색 어휘를 만들지 않는다.
 * 배지를 대체하지 않는 보조 신호라 접근성 트리에서는 제외한다(색 단독 전달 금지).
 */
export const STATUS_STRIPE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'border-l-sky-400',
  ON_HOLD: 'border-l-amber-400',
  INTERVIEW_PENDING: 'border-l-purple-400',
  ACCEPTED: 'border-l-emerald-500',
  REJECTED: 'border-l-rose-400',
};
```

`_lib/applicantSelection.ts`:

```ts
import type { Applicant } from '@duing/types';
import { isTerminalApplicationStatus } from '../../../../../../../_constants/application-status';

/** 선택 가능한 지원자 = 최종 상태가 아닌 지원자. 목록 순서를 유지한다. */
export function selectableIds(applicants: Applicant[]): number[] {
  return applicants
    .filter((applicant) => !isTerminalApplicationStatus(applicant.status))
    .map((applicant) => applicant.applicationId);
}

export type SelectAllState = 'none' | 'partial' | 'all';

/**
 * 분모는 언제나 selectable 이다. 회원 관리처럼 전체 행을 분모로 삼으면 최종 상태가 한 건만 있어도
 * all 이 영원히 성립하지 않아 "전체 해제" 로 넘어가지 못한다.
 */
export function selectAllState(
  selected: ReadonlySet<number>,
  selectable: readonly number[],
): SelectAllState {
  if (selectable.length === 0) return 'none';
  const selectedCount = selectable.filter((id) => selected.has(id)).length;
  if (selectedCount === 0) return 'none';
  return selectedCount === selectable.length ? 'all' : 'partial';
}

export function toggleSelectAll(
  selectable: readonly number[],
  state: SelectAllState,
): number[] {
  return state === 'all' ? [] : [...selectable];
}
```

`_lib/applicantCounts.ts`:

```ts
import type { Applicant, ApplicationStatus } from '@duing/types';

export type StatusCounts = Record<ApplicationStatus, number> & { total: number };

const EMPTY_COUNTS: StatusCounts = {
  total: 0,
  SUBMITTED: 0,
  ON_HOLD: 0,
  INTERVIEW_PENDING: 0,
  ACCEPTED: 0,
  REJECTED: 0,
};

/**
 * 상태별 인원을 목록에서 직접 센다. stats/summary 는 필터를 받지 않아 단과대·기간·검색어가 걸리면
 * 칩 숫자와 눈앞 목록이 어긋난다 — 칩이 "현황 + 필터" 이려면 둘이 같아야 한다.
 * 그래서 목록은 status 없이 받아오고(다른 필터는 서버가 적용), 여기서 세고, 상태 필터는 클라이언트에서 건다.
 */
export function countByStatus(applicants: Applicant[]): StatusCounts {
  return applicants.reduce<StatusCounts>(
    (counts, applicant) => ({
      ...counts,
      total: counts.total + 1,
      [applicant.status]: counts[applicant.status] + 1,
    }),
    { ...EMPTY_COUNTS },
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicant-list-lib.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: `ApplicantTable.tsx` 를 공용 모듈로 교체**

파일 상단의 `STATUS_BADGE_CLASS` 상수와 `isTerminalStatus` 함수 정의를 지우고 아래 import 로 바꾼다. 호출부의 `isTerminalStatus(...)` 는 `isTerminalApplicationStatus(...)` 로 이름만 바뀐다. 다른 코드는 그대로 둔다.

```tsx
import { isTerminalApplicationStatus } from '../../../../../../../_constants/application-status';
import { STATUS_BADGE_CLASS } from '../_lib/applicantStatus';
```

- [ ] **Step 6: 회귀 없음 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants`
Expected: PASS — 리팩터링이라 기존 테스트 전부 초록

- [ ] **Step 7: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/darter && git add -A frontend && git commit -m "refactor(frontend): 지원자 상태 색·선택·카운트 공용 모듈 분리"
```

---

### Task 2: 모바일 2줄 dense list (+ 페이지 배선)

**Files:**
- Create: `.../applicants/_components/ApplicantCardList.tsx`
- Modify: `.../applicants/_components/ApplicantTable.tsx` (모바일 블록 제거, 표는 `hidden lg:block`)
- Modify: `.../applicants/page.tsx` (카드 리스트 배선 — 이 태스크 안에서 화면이 비지 않게)
- Delete: `frontend/apps/web/test/manage/applicants/applicant-card-touch.test.tsx`
- Test: `frontend/apps/web/test/manage/applicants/applicant-card-list.test.tsx`

**Interfaces:**
- Consumes: Task 1 의 `STATUS_BADGE_CLASS` / `STATUS_STRIPE_CLASS`, `isTerminalApplicationStatus`
- Produces:
  ```ts
  type ApplicantCardListProps = {
    applicants: Applicant[];
    selectedSet: ReadonlySet<number>;
    onToggleSelect: (applicationId: number) => void;
    onOpenDetail: (applicationId: number) => void;
    /** 이름 링크의 href. 라우팅 규칙은 페이지가 소유한다(현재 쿼리스트링 유지). */
    detailHref: (applicationId: number) => string;
  };
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/manage/applicants/applicant-card-list.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Applicant } from '@duing/types';
import { ApplicantCardList } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantCardList';

const baseApplicant: Applicant = {
  applicationId: 1,
  userId: 1,
  userName: '홍길동',
  studentId: '20200001',
  college: 'IT_ENGINEERING',
  major: '컴퓨터공학과',
  grade: 'JUNIOR',
  answers: [],
  status: 'SUBMITTED',
  submittedAt: '2026-05-01T10:00:00',
  interviewStartAt: '2026-05-10T14:00:00',
  myScore: null,
};

function renderList(applicants: Applicant[], selected: number[] = []) {
  const onToggleSelect = vi.fn();
  const onOpenDetail = vi.fn();
  render(
    <ApplicantCardList
      applicants={applicants}
      selectedSet={new Set(selected)}
      onToggleSelect={onToggleSelect}
      onOpenDetail={onOpenDetail}
      detailHref={(applicationId) => `/manage/clubs/1/recruitments/1/applicants/${applicationId}`}
    />,
  );
  return { onToggleSelect, onOpenDetail };
}

describe('모바일 지원자 카드 리스트', () => {
  it('1행에 이름·학년·상태, 2행에 학과·학번·지원일을 보여준다', () => {
    renderList([baseApplicant]);
    expect(screen.getByRole('link', { name: '홍길동' })).toBeInTheDocument();
    expect(screen.getByText('3학년')).toBeInTheDocument();
    expect(screen.getByText('지원 완료')).toBeInTheDocument();
    expect(screen.getByText('컴퓨터공학과')).toBeInTheDocument();
    expect(screen.getByText('20200001')).toBeInTheDocument();
    expect(screen.getByText('05.01')).toBeInTheDocument();
  });

  it('단과대·면접 일정·평가 점수는 목록에 넣지 않는다', () => {
    renderList([{ ...baseApplicant, myScore: 4 }]);
    expect(screen.queryByText(/공과대학/)).not.toBeInTheDocument();
    expect(screen.queryByText(/05\.10/)).not.toBeInTheDocument();
    expect(screen.queryByText('4 / 5')).not.toBeInTheDocument();
  });

  it('내 평가가 있으면 표식과 접근성 라벨이 붙는다', () => {
    renderList([{ ...baseApplicant, myScore: 4 }]);
    expect(screen.getByLabelText('내 평가 작성됨')).toBeInTheDocument();
  });

  it('내 평가가 없으면 표식이 없다', () => {
    renderList([baseApplicant]);
    expect(screen.queryByLabelText('내 평가 작성됨')).not.toBeInTheDocument();
  });

  it('이름 링크가 상세 경로를 가리켜 키보드로 도달할 수 있다', () => {
    renderList([baseApplicant]);
    expect(screen.getByRole('link', { name: '홍길동' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/1/applicants/1',
    );
  });

  it('이름 링크 클릭은 카드 onClick 을 이중 발화시키지 않는다', () => {
    const { onOpenDetail } = renderList([baseApplicant]);
    fireEvent.click(screen.getByRole('link', { name: '홍길동' }));
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('상태 띠는 상태별 색이고 4px 이다', () => {
    renderList([baseApplicant]);
    const card = screen.getByText('컴퓨터공학과').closest('[data-applicant-card]');
    expect(card?.className).toContain('border-l-sky-400');
    expect(card?.className).toContain('border-l-4');
  });

  it('체크박스 히트 영역은 44px 이고 테두리만큼 왼쪽으로 보정된다', () => {
    renderList([baseApplicant]);
    const label = screen.getByRole('checkbox', { name: '홍길동 선택' }).closest('label');
    expect(label).toHaveClass('h-11', 'w-11', '-my-3', '-ml-4');
  });

  it('체크박스를 누르면 선택만 되고 상세로 가지 않는다', () => {
    const { onToggleSelect, onOpenDetail } = renderList([baseApplicant]);
    fireEvent.click(screen.getByRole('checkbox', { name: '홍길동 선택' }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('히트 영역(라벨) 을 눌러도 선택만 된다', () => {
    const { onToggleSelect, onOpenDetail } = renderList([baseApplicant]);
    const label = screen.getByRole('checkbox', { name: '홍길동 선택' }).closest('label');
    fireEvent.click(label as HTMLLabelElement);
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('카드 본문을 누르면 상세로 간다', () => {
    const { onToggleSelect, onOpenDetail } = renderList([baseApplicant]);
    fireEvent.click(screen.getByText('컴퓨터공학과'));
    expect(onOpenDetail).toHaveBeenCalledWith(1);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('최종 상태 카드는 체크박스가 비활성이고 히트 영역이 탭을 삼키지 않는다', () => {
    const { onToggleSelect, onOpenDetail } = renderList([{ ...baseApplicant, status: 'ACCEPTED' }]);
    const checkbox = screen.getByRole('checkbox', { name: '홍길동 선택' });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveClass('disabled:pointer-events-none');
    fireEvent.click(checkbox.closest('label') as HTMLLabelElement);
    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicant-card-list.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 컴포넌트 구현**

`_components/ApplicantCardList.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { formatDateKst } from '@duing/hooks';
import type { Applicant } from '@duing/types';
import { GRADE_DISPLAY_NAME } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import {
  APPLICATION_STATUS_LABEL,
  isTerminalApplicationStatus,
} from '../../../../../../../_constants/application-status';
import { STATUS_BADGE_CLASS, STATUS_STRIPE_CLASS } from '../_lib/applicantStatus';

/**
 * 목록 전용 축약 — `2026.05.01` → `05.01`. 좁은 2행에서 연도는 모집 기간이 이미 말해준다.
 * 포맷터가 원문을 그대로 돌려준 경우(잘못된 입력)는 자르지 않는다.
 */
function toMonthDay(iso: string): string {
  const formatted = formatDateKst(iso);
  return /^\d{4}\.\d{2}\.\d{2}$/.test(formatted) ? formatted.slice(5) : formatted;
}

type Props = {
  applicants: Applicant[];
  selectedSet: ReadonlySet<number>;
  onToggleSelect: (applicationId: number) => void;
  onOpenDetail: (applicationId: number) => void;
  detailHref: (applicationId: number) => string;
};

/**
 * 모바일·태블릿(≤1023px) 지원자 목록 — 2줄 dense list.
 * 단과대·면접 일정·평가 점수는 여기서 생략하고 표와 상세에서 본다(설계 §4).
 */
export function ApplicantCardList({
  applicants,
  selectedSet,
  onToggleSelect,
  onOpenDetail,
  detailHref,
}: Props) {
  return (
    <div className="mt-4 space-y-2 lg:hidden">
      {applicants.map((applicant) => {
        const isTerminal = isTerminalApplicationStatus(applicant.status);
        const isSelected = selectedSet.has(applicant.applicationId);
        return (
          <div
            key={applicant.applicationId}
            data-applicant-card
            onClick={() => onOpenDetail(applicant.applicationId)}
            className={cn(
              'card cursor-pointer border-l-4 p-3 transition',
              STATUS_STRIPE_CLASS[applicant.status],
              // 선택 표시는 배경만 바꾼다 — border-sage 를 주면 왼쪽 상태 띠 색을 덮어쓴다.
              isSelected && 'bg-cream/60',
            )}
          >
            <div className="flex items-start gap-0.5">
              {/*
               * 선택 영역과 카드 이동 영역을 분리한다(PR #939). 음수 마진은 카드 padding(12) 에
               * 왼쪽 테두리(4) 를 더한 값이라 44px 이 카드 바깥 모서리부터 시작한다.
               * 최종 상태 카드는 전파를 끊지 않고, 비활성 체크박스도 pointer-events 를 꺼
               * 탭이 카드까지 내려가 상세로 진입한다.
               * 주의: 라벨 클릭은 input 으로 포워딩됐다 되돌아와 onClick 이 2회 실행된다 —
               * 부수효과 있는 로직을 얹지 말 것(토글은 onChange 가 1회만 받는다).
               */}
              <label
                onClick={isTerminal ? undefined : (event) => event.stopPropagation()}
                className="-my-3 -ml-4 grid h-11 w-11 shrink-0 place-items-center"
              >
                <input
                  type="checkbox"
                  aria-label={`${applicant.userName} 선택`}
                  checked={isSelected}
                  disabled={isTerminal}
                  onChange={() => onToggleSelect(applicant.applicationId)}
                  title={isTerminal ? '최종 상태인 지원자는 선택할 수 없습니다.' : undefined}
                  className="h-4 w-4 rounded border-line text-ink focus:ring-sage disabled:pointer-events-none disabled:opacity-50"
                />
              </label>

              <div className="min-w-0 flex-1">
                {/* 1행 — 이름·학년·상태. 이름 링크가 키보드·스크린리더의 유일한 상세 진입로다. */}
                <div className="flex items-center gap-1.5">
                  <Link
                    href={detailHref(applicant.applicationId)}
                    onClick={(event) => event.stopPropagation()}
                    className="min-w-0 truncate text-[14px] font-semibold leading-5 text-ink-deep hover:underline"
                  >
                    {applicant.userName}
                  </Link>
                  <span className="shrink-0 text-[12px] leading-5 text-charcoal-3">
                    {GRADE_DISPLAY_NAME[applicant.grade]}
                  </span>
                  <span
                    className={cn(
                      'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
                      STATUS_BADGE_CLASS[applicant.status],
                    )}
                  >
                    {APPLICATION_STATUS_LABEL[applicant.status]}
                  </span>
                </div>

                {/* 2행 — 학과·학번·평가 여부·지원일 */}
                <div className="mt-0.5 flex items-center gap-1.5 text-[12px] leading-4 text-charcoal-3">
                  <span className="min-w-0 truncate">{applicant.major}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0 tabular-nums">{applicant.studentId}</span>
                  {/*
                   * 평가 표식과 지원일을 오른쪽 한 덩어리로 묶는다. 표식을 왼쪽 텍스트 사이에 두면
                   * 구분자 `·` 와 섞여 무엇의 표식인지 읽히지 않는다.
                   * 색은 text-ink — sage(#9DB6A0)는 흰 배경 대비 2.1:1 로 부족하다.
                   */}
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {applicant.myScore !== null && (
                      <span
                        role="img"
                        aria-label="내 평가 작성됨"
                        className="text-[9px] leading-4 text-ink"
                      >
                        ●
                      </span>
                    )}
                    <span className="tabular-nums">{toMonthDay(applicant.submittedAt)}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicant-card-list.test.tsx`
Expected: PASS (12 tests)

- [ ] **Step 5: `ApplicantTable.tsx` 에서 모바일 블록 제거**

`{/* 모바일: 카드 리스트 */}` 로 시작하는 `md:hidden` 블록 전체를 지우고, 감싸던 프래그먼트(`<>…</>`)를 없애 표 컨테이너만 반환하게 한다. 표 컨테이너 클래스의 `hidden md:block` 을 `hidden lg:block` 으로 바꾼다.

- [ ] **Step 6: 페이지에 카드 리스트 배선 (화면이 비지 않게)**

`page.tsx` 에서 `ApplicantTable` 을 렌더하는 자리 바로 위에 `ApplicantCardList` 를 추가한다. 이 시점의 페이지는 아직 `selectedIds` 배열과 `setSelectedIds` 를 쓰므로 아래 어댑터를 넘긴다(Task 6 에서 정리된다). 상세 경로 문자열은 한 곳에서 만들어 `onOpenDetail` 과 `detailHref` 가 공유한다.

```tsx
import { ApplicantCardList } from './_components/ApplicantCardList';
...
  const detailHref = useCallback(
    (applicationId: number) => {
      const currentQs = searchParams.toString();
      const base = `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${applicationId}`;
      return toRoute(currentQs ? `${base}?${currentQs}` : base);
    },
    [searchParams, clubId, recruitmentId],
  );
  const openDetail = useCallback(
    (applicationId: number) => router.push(detailHref(applicationId)),
    [router, detailHref],
  );
  const toggleOne = useCallback((applicationId: number) => {
    setSelectedIds((current) =>
      current.includes(applicationId)
        ? current.filter((id) => id !== applicationId)
        : [...current, applicationId],
    );
  }, []);
...
<ApplicantCardList
  applicants={applicants}
  selectedSet={selectedSet}
  onToggleSelect={toggleOne}
  onOpenDetail={openDetail}
  detailHref={detailHref}
/>
```

> 선택 토글이 최종 상태를 따로 막지 않아도 된다 — 카드가 최종 상태 체크박스를 `disabled` 로 렌더하므로 호출 자체가 오지 않는다.

- [ ] **Step 7: 옛 터치 테스트 삭제**

`test/manage/applicants/applicant-card-touch.test.tsx` 를 지운다. 이 파일의 가드(44px 히트 영역 클래스 박제, 오터치 분리, 최종 상태 동작)는 Step 1 의 `applicant-card-list.test.tsx` 가 전부 흡수했고, 옛 파일은 `-ml-3` 과 배열형 `onSelect` 를 전제해 더 유지할 수 없다.

```bash
cd /Users/ksy/orca/workspaces/Duing/darter && git rm frontend/apps/web/test/manage/applicants/applicant-card-touch.test.tsx
```

- [ ] **Step 8: 전체 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants`
Expected: PASS

- [ ] **Step 9: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/darter && git add -A frontend && git commit -m "feat(frontend): 지원자 목록 모바일 2줄 dense list — 상태 띠·평가 표식·이름 링크"
```

---

### Task 3: 데스크탑 표 리디자인 (+ 페이지 배선)

**Files:**
- Modify: `.../applicants/_components/ApplicantTable.tsx` (전면 교체)
- Modify: `.../applicants/page.tsx` (새 props 로 호출부 교체 — 같은 태스크에서 반드시 함께)
- Modify: `frontend/apps/web/test/manage/applicants/applicant-table-extension.test.tsx`
- Test: `frontend/apps/web/test/manage/applicants/applicant-table.test.tsx`

**Interfaces:**
- Consumes: Task 1 의 `STATUS_BADGE_CLASS`, `selectableIds`, `selectAllState`, `toggleSelectAll`, `isTerminalApplicationStatus`
- Produces:
  ```ts
  type ApplicantTableProps = {
    applicants: Applicant[];
    selectedSet: ReadonlySet<number>;
    onToggleSelect: (applicationId: number) => void;
    onToggleAll: () => void;
    onOpenDetail: (applicationId: number) => void;
    detailHref: (applicationId: number) => string;
    useInterview: boolean;
  };
  ```
  `clubId` / `recruitmentId` / `selectedIds` / `onSelect` props 는 사라진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/manage/applicants/applicant-table.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Applicant } from '@duing/types';
import { ApplicantTable } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantTable';

const baseApplicant: Applicant = {
  applicationId: 1,
  userId: 1,
  userName: '홍길동',
  studentId: '20200001',
  college: 'IT_ENGINEERING',
  major: '컴퓨터공학과',
  grade: 'JUNIOR',
  answers: [],
  status: 'SUBMITTED',
  submittedAt: '2026-05-01T10:00:00',
  interviewStartAt: null,
  myScore: 4,
};

function renderTable(applicants: Applicant[], selected: number[] = []) {
  const onToggleSelect = vi.fn();
  const onToggleAll = vi.fn();
  const onOpenDetail = vi.fn();
  render(
    <ApplicantTable
      applicants={applicants}
      selectedSet={new Set(selected)}
      onToggleSelect={onToggleSelect}
      onToggleAll={onToggleAll}
      onOpenDetail={onOpenDetail}
      detailHref={(applicationId) => `/manage/clubs/1/recruitments/1/applicants/${applicationId}`}
      useInterview={false}
    />,
  );
  return { onToggleSelect, onToggleAll, onOpenDetail };
}

describe('데스크탑 지원자 표', () => {
  it('내 평가는 표에서 점수로 유지한다', () => {
    renderTable([baseApplicant]);
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
  });

  it('지원일 열은 날짜+시각을 유지한다', () => {
    renderTable([baseApplicant]);
    expect(screen.getByText('2026.05.01 10:00')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '지원일시' })).toBeInTheDocument();
  });

  it('단과대·학번 열은 1024~1279px 에서 숨기는 클래스를 갖는다', () => {
    renderTable([baseApplicant]);
    expect(screen.getByText('IT·공과대학').closest('td')?.className).toContain('xl:table-cell');
    expect(screen.getByText('20200001').closest('td')?.className).toContain('xl:table-cell');
  });

  it('이름은 상세 링크라 키보드로 도달할 수 있다', () => {
    renderTable([baseApplicant]);
    expect(screen.getByRole('link', { name: '홍길동' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/1/applicants/1',
    );
  });

  it('헤더 전체 선택을 누르면 onToggleAll 이 불린다', () => {
    const { onToggleAll } = renderTable([baseApplicant]);
    fireEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }));
    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it('일부만 선택되면 헤더 체크박스가 indeterminate 다', () => {
    renderTable([baseApplicant, { ...baseApplicant, applicationId: 2, userName: '김두잉' }], [1]);
    const headerCheckbox = screen.getByRole('checkbox', { name: '전체 선택' });
    expect((headerCheckbox as HTMLInputElement).indeterminate).toBe(true);
  });

  it('선택 가능 인원이 없으면 헤더 체크박스가 비활성이다', () => {
    renderTable([{ ...baseApplicant, status: 'ACCEPTED' }]);
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeDisabled();
  });

  it('행 체크박스는 전파를 끊어 상세로 가지 않는다', () => {
    const { onToggleSelect, onOpenDetail } = renderTable([baseApplicant]);
    fireEvent.click(screen.getByRole('checkbox', { name: '홍길동 선택' }));
    expect(onToggleSelect).toHaveBeenCalledWith(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('행 본문(이름 링크 밖)을 누르면 상세로 간다', () => {
    const { onOpenDetail } = renderTable([baseApplicant]);
    fireEvent.click(screen.getByText('컴퓨터공학과 · 3학년'));
    expect(onOpenDetail).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicant-table.test.tsx`
Expected: FAIL — props 불일치, `전체 선택` 없음

- [ ] **Step 3: 표 구현**

`ApplicantTable.tsx` 전체를 아래로 교체한다.

```tsx
'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatDateTimeKst } from '@duing/hooks';
import type { Applicant } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import {
  APPLICATION_STATUS_LABEL,
  isTerminalApplicationStatus,
} from '../../../../../../../_constants/application-status';
import { STATUS_BADGE_CLASS } from '../_lib/applicantStatus';
import { selectableIds, selectAllState } from '../_lib/applicantSelection';

function MyScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-charcoal-3">—</span>;
  const colorClass =
    score >= 4
      ? 'bg-emerald-100 text-emerald-700'
      : score === 3
        ? 'bg-graysoft text-charcoal-2'
        : 'bg-rose-100 text-rose-700';
  return (
    <span
      className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs', colorClass)}
    >
      {score} / 5
    </span>
  );
}

type Props = {
  applicants: Applicant[];
  selectedSet: ReadonlySet<number>;
  onToggleSelect: (applicationId: number) => void;
  onToggleAll: () => void;
  onOpenDetail: (applicationId: number) => void;
  detailHref: (applicationId: number) => string;
  useInterview: boolean;
};

/**
 * 데스크탑(≥1024px) 지원자 표. 1024~1279px 은 콘텐츠 폭이 672~927px 뿐이라
 * Secondary 열(단과대·학번)을 숨기고 xl(1280px) 이상에서만 노출한다(설계 §3).
 * overflow-x-auto 는 최후 방어선으로 남긴다 — 예외적으로 긴 학과명 하나에 페이지가 밀리면 안 된다.
 */
export function ApplicantTable({
  applicants,
  selectedSet,
  onToggleSelect,
  onToggleAll,
  onOpenDetail,
  detailHref,
  useInterview,
}: Props) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const selectable = selectableIds(applicants);
  const allState = selectAllState(selectedSet, selectable);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = allState === 'partial';
    }
  }, [allState]);

  return (
    <div className="mt-4 hidden overflow-x-auto rounded-lg border border-line bg-paper lg:block">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-cream text-left">
          <tr>
            <th className="w-12 px-4 py-3">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                aria-label="전체 선택"
                checked={allState === 'all'}
                disabled={selectable.length === 0}
                onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer rounded border-line text-ink focus:ring-sage disabled:cursor-not-allowed disabled:opacity-50"
              />
            </th>
            <th className="px-4 py-3 font-medium text-charcoal-2">지원자</th>
            <th className="px-4 py-3 font-medium text-charcoal-2">상태</th>
            <th className="px-4 py-3 font-medium text-charcoal-2">학과 · 학년</th>
            <th className="hidden px-4 py-3 font-medium text-charcoal-2 xl:table-cell">단과대</th>
            <th className="hidden px-4 py-3 font-medium text-charcoal-2 xl:table-cell">학번</th>
            <th className="px-4 py-3 font-medium text-charcoal-2">지원일시</th>
            {useInterview && <th className="px-4 py-3 font-medium text-charcoal-2">면접일정</th>}
            <th className="px-4 py-3 font-medium text-charcoal-2">내 평가</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {applicants.map((applicant) => {
            const isTerminal = isTerminalApplicationStatus(applicant.status);
            const isSelected = selectedSet.has(applicant.applicationId);
            return (
              <tr
                key={applicant.applicationId}
                onClick={() => onOpenDetail(applicant.applicationId)}
                className={cn('cursor-pointer hover:bg-cream/60', isSelected && 'bg-cream/60')}
              >
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`${applicant.userName} 선택`}
                    checked={isSelected}
                    disabled={isTerminal}
                    onChange={() => onToggleSelect(applicant.applicationId)}
                    title={isTerminal ? '최종 상태인 지원자는 선택할 수 없습니다.' : undefined}
                    className="h-4 w-4 cursor-pointer rounded border-line text-ink focus:ring-sage disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </td>
                {/* 이름 링크가 키보드·스크린리더의 상세 진입로다. 행 onClick 과 겹치지 않게 전파를 끊는다. */}
                <td className="px-4 py-3">
                  <Link
                    href={detailHref(applicant.applicationId)}
                    onClick={(event) => event.stopPropagation()}
                    className="font-semibold text-ink-deep hover:underline"
                  >
                    {applicant.userName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
                      STATUS_BADGE_CLASS[applicant.status],
                    )}
                  >
                    {APPLICATION_STATUS_LABEL[applicant.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-charcoal-2">
                  {applicant.major} · {GRADE_DISPLAY_NAME[applicant.grade]}
                </td>
                <td className="hidden px-4 py-3 text-charcoal-3 xl:table-cell">
                  {COLLEGE_DISPLAY_NAME[applicant.college]}
                </td>
                <td className="hidden px-4 py-3 tabular-nums text-charcoal-3 xl:table-cell">
                  {applicant.studentId}
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-charcoal-3">
                  {formatDateTimeKst(applicant.submittedAt)}
                </td>
                {useInterview && (
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-charcoal-3">
                    {applicant.interviewStartAt
                      ? formatDateTimeKst(applicant.interviewStartAt)
                      : '—'}
                  </td>
                )}
                <td className="px-4 py-3">
                  <MyScoreBadge score={applicant.myScore} />
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

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicant-table.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 5: 페이지 호출부 교체 (같은 태스크에서 필수)**

`page.tsx` 의 `<ApplicantTable …/>` 를 새 props 로 바꾼다. Task 2 에서 만든 `toggleOne` / `openDetail` / `detailHref` 를 그대로 재사용하고, 전체 선택은 아래를 추가한다(Task 6 에서 `useMemo` 로 정리된다).

```tsx
import { selectableIds, selectAllState, toggleSelectAll } from './_lib/applicantSelection';
...
  const selectable = selectableIds(applicants);
  const allState = selectAllState(selectedSet, selectable);
...
<ApplicantTable
  applicants={applicants}
  selectedSet={selectedSet}
  onToggleSelect={toggleOne}
  onToggleAll={() => setSelectedIds(toggleSelectAll(selectable, allState))}
  onOpenDetail={openDetail}
  detailHref={detailHref}
  useInterview={useInterview}
/>
```

- [ ] **Step 6: 옛 확장 테스트 갱신**

`applicant-table-extension.test.tsx` 는 옛 props 와 "표+카드 동시 렌더(같은 이름 체크박스 2개)" 를 전제한다. 새 props 로 바꾸고, `getAllByRole` 로 2개를 기대하던 단언은 단수 조회로 바꾼다. `myScore` 색상·`useInterview` 헤더 케이스는 그대로 살린다.

- [ ] **Step 7: 전체 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/darter && git add -A frontend && git commit -m "feat(frontend): 지원자 표 리디자인 — 콘솔 토큰·열 위계·보조열 단계 공개·이름 링크"
```

---

### Task 4: 상태 필터 칩

**Files:**
- Create: `.../applicants/_components/StatusFilterChips.tsx`
- Test: `frontend/apps/web/test/manage/applicants/status-filter-chips.test.tsx`

**Interfaces:**
- Consumes: Task 1 의 `StatusCounts`
- Produces:
  ```ts
  type StatusFilterChipsProps = {
    value: ApplicationStatus | undefined;   // undefined = 전체
    onChange: (next: ApplicationStatus | undefined) => void;
    counts: StatusCounts;
    useInterview: boolean;
  };
  ```

**접근 이름 주의:** JSX 의 인라인 `<span>` 은 accname 계산에 공백을 넣지 않아 `전체5명` 이 된다. 그래서 버튼에 `aria-label` 을 직접 준다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/manage/applicants/status-filter-chips.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { StatusCounts } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantCounts';
import { StatusFilterChips } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/StatusFilterChips';

const counts: StatusCounts = {
  total: 5,
  SUBMITTED: 2,
  ON_HOLD: 1,
  INTERVIEW_PENDING: 1,
  ACCEPTED: 1,
  REJECTED: 0,
};

describe('상태 필터 칩', () => {
  it('운영진 라벨과 카운트를 접근 이름에 함께 담는다', () => {
    render(<StatusFilterChips value={undefined} onChange={vi.fn()} counts={counts} useInterview />);
    expect(screen.getByRole('button', { name: '전체 5명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원 완료 2명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보류 1명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '면접 대상 1명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '합격 1명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '불합격 0명' })).toBeInTheDocument();
  });

  it('면접을 쓰지 않는 모집은 면접 대상 칩을 감춘다', () => {
    render(
      <StatusFilterChips value={undefined} onChange={vi.fn()} counts={counts} useInterview={false} />,
    );
    expect(screen.queryByRole('button', { name: /면접 대상/ })).not.toBeInTheDocument();
  });

  it('단일 선택 — 선택된 칩만 aria-pressed 가 true 다', () => {
    render(<StatusFilterChips value="ON_HOLD" onChange={vi.fn()} counts={counts} useInterview />);
    expect(screen.getByRole('button', { name: '보류 1명' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '전체 5명' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '합격 1명' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('전체 칩은 상태 필터를 지운다', () => {
    const onChange = vi.fn();
    render(<StatusFilterChips value="ON_HOLD" onChange={onChange} counts={counts} useInterview />);
    fireEvent.click(screen.getByRole('button', { name: '전체 5명' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('상태 칩은 해당 상태로 필터한다', () => {
    const onChange = vi.fn();
    render(<StatusFilterChips value={undefined} onChange={onChange} counts={counts} useInterview />);
    fireEvent.click(screen.getByRole('button', { name: '합격 1명' }));
    expect(onChange).toHaveBeenCalledWith('ACCEPTED');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/status-filter-chips.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`_components/StatusFilterChips.tsx`:

```tsx
'use client';

import type { ApplicationStatus } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../_constants/application-status';
import type { StatusCounts } from '../_lib/applicantCounts';

// 회원 관리 MemberFilterChips 와 같은 칩 스타일 — 콘솔 안에서 필터 생김새가 갈리지 않게 한다.
const CHIP_BASE =
  'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors';
const CHIP_ON = 'bg-ink border-ink text-paper';
const CHIP_OFF = 'bg-paper border-line text-charcoal-2 hover:border-sage hover:text-ink';

type StatusChip = { value: ApplicationStatus | undefined; label: string };

// 칩은 라디오 성격의 단일 선택이다 — ApplicantsFilters.status 가 단일 값이고 백엔드도 단일 enum 을 받는다.
// (회원 관리의 role 칩과 같고, 다중 토글인 flags 칩과 다르다.)
const CHIPS: StatusChip[] = [
  { value: undefined, label: '전체' },
  { value: 'SUBMITTED', label: APPLICATION_STATUS_LABEL.SUBMITTED },
  { value: 'ON_HOLD', label: APPLICATION_STATUS_LABEL.ON_HOLD },
  { value: 'INTERVIEW_PENDING', label: APPLICATION_STATUS_LABEL.INTERVIEW_PENDING },
  { value: 'ACCEPTED', label: APPLICATION_STATUS_LABEL.ACCEPTED },
  { value: 'REJECTED', label: APPLICATION_STATUS_LABEL.REJECTED },
];

type Props = {
  value: ApplicationStatus | undefined;
  onChange: (next: ApplicationStatus | undefined) => void;
  /** 목록에서 파생한 카운트 — 항상 존재하므로 로딩 분기가 없다. */
  counts: StatusCounts;
  useInterview: boolean;
};

/**
 * 상태 필터 = 현황 표시. 별도 KPI 타일을 두지 않고 칩에 카운트를 얹는다(설계 §6).
 * 카운트는 목록에서 파생하므로 다른 필터(단과대·기간·검색어)가 걸린 결과 안의 분포이며,
 * 눈앞의 목록과 항상 일치한다.
 */
export function StatusFilterChips({ value, onChange, counts, useInterview }: Props) {
  const visibleChips = CHIPS.filter(
    (chip) => useInterview || chip.value !== 'INTERVIEW_PENDING',
  );

  return (
    // 칩은 한 줄 가로 스크롤이다 — 줄바꿈하면 목록이 아래로 밀린다.
    // 음수 마진은 페이지 좌우 패딩(px-4 sm:px-6)과 정확히 짝을 맞춘다.
    <div
      role="group"
      aria-label="상태 필터"
      className="-mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
    >
      {visibleChips.map((chip) => {
        const selected = value === chip.value;
        const count = chip.value === undefined ? counts.total : counts[chip.value];
        return (
          <button
            key={chip.value ?? 'ALL'}
            type="button"
            aria-pressed={selected}
            // 인라인 span 은 accname 에 공백을 넣지 않아 "전체5명" 이 된다 — 이름을 직접 준다.
            aria-label={`${chip.label} ${count}명`}
            onClick={() => onChange(chip.value)}
            className={cn(CHIP_BASE, selected ? CHIP_ON : CHIP_OFF)}
          >
            {chip.label}
            <span aria-hidden className="ml-1 tabular-nums">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/status-filter-chips.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/darter && git add -A frontend && git commit -m "feat(frontend): 지원자 상태 필터 칩 — 목록 파생 카운트 통합"
```

---

### Task 5: 검색·필터 리디자인 (+ 클라이언트 상태 필터 배선)

이 태스크가 설계의 핵심 배선을 담당한다. **목록을 `status` 없이 받아 카운트를 세고, 상태 필터를 클라이언트에서 적용한다.**

**Files:**
- Create: `.../applicants/_components/ApplicantsFilterSheet.tsx`
- Modify: `.../applicants/_components/ApplicantsFilterBar.tsx` (전면 교체)
- Modify: `.../applicants/_components/ApplicantsSearchInput.tsx` (토큰·전폭)
- Modify: `.../applicants/page.tsx` (목록 쿼리에서 status 제외 + 카운트 + 클라이언트 필터)
- Modify: `frontend/packages/hooks/src/applications.ts` (`placeholderData: keepPreviousData`)
- Modify: `frontend/apps/web/test/manage/applicants/applicants-filter-bar.test.tsx` (전면 교체)
- Modify: `frontend/apps/web/test/manage/applicants/closed-readonly.test.tsx`

**Interfaces:**
- Consumes: Task 4 의 `StatusFilterChips`, Task 1 의 `countByStatus`
- Produces:
  ```ts
  type ApplicantsFilterBarProps = {
    filters: ApplicantsFilters;
    onChange: (next: ApplicantsFilters) => void;
    useInterview: boolean;
    counts: StatusCounts;
  };
  export function secondaryFilterCount(filters: ApplicantsFilters): number; // 단과대 1 + 기간 1
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`test/manage/applicants/applicants-filter-bar.test.tsx` 를 아래로 교체한다. **기존 파일의 검색 디바운스 케이스는 반드시 살린다.**

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ApplicantsFilters } from '@duing/types';
import type { StatusCounts } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantCounts';
import { ApplicantsFilterBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantsFilterBar';

const counts: StatusCounts = {
  total: 5,
  SUBMITTED: 2,
  ON_HOLD: 1,
  INTERVIEW_PENDING: 1,
  ACCEPTED: 1,
  REJECTED: 0,
};

function renderBar(filters: ApplicantsFilters = {}) {
  const onChange = vi.fn();
  render(
    <ApplicantsFilterBar filters={filters} onChange={onChange} useInterview counts={counts} />,
  );
  return { onChange };
}

describe('지원자 필터 바', () => {
  it('검색과 상태 칩을 항상 노출한다', () => {
    renderBar();
    expect(screen.getByLabelText('지원자 검색')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원 완료 2명' })).toBeInTheDocument();
  });

  it('상태 칩을 누르면 status 필터만 바뀐다', () => {
    const { onChange } = renderBar({ college: 'IT_ENGINEERING' });
    fireEvent.click(screen.getByRole('button', { name: '보류 1명' }));
    expect(onChange).toHaveBeenCalledWith({ college: 'IT_ENGINEERING', status: 'ON_HOLD' });
  });

  it('필터 버튼은 단과대·기간 적용 개수를 접근 이름에 담는다', () => {
    renderBar({ college: 'IT_ENGINEERING', submittedFrom: '2026-05-01' });
    expect(screen.getByRole('button', { name: '필터 2개 적용됨' })).toBeInTheDocument();
  });

  it('적용된 보조 필터가 없으면 "필터" 로만 보인다', () => {
    renderBar({ status: 'ON_HOLD' });
    expect(screen.getByRole('button', { name: '필터' })).toBeInTheDocument();
  });

  it('필터 초기화는 한 벌만 렌더되고 모든 필터를 비운다', () => {
    const { onChange } = renderBar({ status: 'ON_HOLD', college: 'IT_ENGINEERING', q: '홍' });
    const resetButtons = screen.getAllByRole('button', { name: '필터 초기화' });
    expect(resetButtons).toHaveLength(1);
    fireEvent.click(resetButtons[0]);
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('데스크탑 단과대 선택은 college 필터를 바꾼다', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByLabelText('단과대'), { target: { value: 'IT_ENGINEERING' } });
    expect(onChange).toHaveBeenCalledWith({ college: 'IT_ENGINEERING' });
  });
});

describe('검색 디바운스', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('입력 후 디바운스가 지나야 q 로 커밋된다', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByLabelText('지원자 검색'), { target: { value: '홍길동' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onChange).toHaveBeenCalledWith({ q: '홍길동' });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicants-filter-bar.test.tsx`
Expected: FAIL — 새 props·칩·필터 버튼 없음

- [ ] **Step 3: 시트 구현**

`_components/ApplicantsFilterSheet.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { ApplicantsFilters, College } from '@duing/types';
import { COLLEGE_DISPLAY_NAME } from '@duing/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

const COLLEGE_OPTIONS = (Object.entries(COLLEGE_DISPLAY_NAME) as [College, string][]).map(
  ([value, label]) => ({ value, label }),
);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ApplicantsFilters;
  onApply: (next: ApplicantsFilters) => void;
};

/**
 * 모바일 보조 필터(단과대·지원 기간) 시트. 상태는 칩이 항상 노출하므로 여기 중복해 넣지 않는다.
 * 시트 안에서는 초안으로 편집하고 "적용" 에서 한 번에 반영한다 — 즉시 반영하면 시트가 열린 채
 * router.replace 가 반복된다. 열 때마다 현재 필터로 초기화한다.
 */
export function ApplicantsFilterSheet({ open, onOpenChange, filters, onApply }: Props) {
  const [draft, setDraft] = useState<ApplicantsFilters>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-4 pt-4">
        <SheetHeader>
          <SheetTitle>필터</SheetTitle>
          <SheetDescription className="sr-only">
            단과대와 지원 기간으로 지원자를 거릅니다.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <label className="block text-sm text-charcoal-2">
            단과대
            <select
              value={draft.college ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  college:
                    event.target.value === '' ? undefined : (event.target.value as College),
                })
              }
              className="mt-1.5 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal"
            >
              <option value="">전체</option>
              {COLLEGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="text-sm text-charcoal-2">
            <legend className="mb-1.5">지원 기간</legend>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="시작일"
                value={draft.submittedFrom ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, submittedFrom: event.target.value || undefined })
                }
                className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal"
              />
              <span aria-hidden className="text-charcoal-3">~</span>
              <input
                type="date"
                aria-label="종료일"
                value={draft.submittedTo ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, submittedTo: event.target.value || undefined })
                }
                className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal"
              />
            </div>
          </fieldset>
        </div>

        <div className="mt-6 flex gap-2 pb-2">
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                college: undefined,
                submittedFrom: undefined,
                submittedTo: undefined,
              })
            }
            className="btn btn-secondary btn-sm flex-1"
          >
            보조 필터 지우기
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
            className="btn btn-primary btn-sm flex-1"
          >
            적용
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: 필터 바 구현**

`_components/ApplicantsFilterBar.tsx` 전체 교체. **`필터 초기화` 는 한 벌만 렌더한다** — 두 벌을 두면 jsdom 이 둘 다 잡아 테스트가 터진다. 배치만 `lg:` 로 분기한다.

```tsx
'use client';

import { useState } from 'react';
import type { ApplicantsFilters, ApplicationStatus, College } from '@duing/types';
import { COLLEGE_DISPLAY_NAME } from '@duing/types';
import type { StatusCounts } from '../_lib/applicantCounts';
import { ApplicantsSearchInput } from './ApplicantsSearchInput';
import { ApplicantsFilterSheet } from './ApplicantsFilterSheet';
import { StatusFilterChips } from './StatusFilterChips';

const COLLEGE_OPTIONS = (Object.entries(COLLEGE_DISPLAY_NAME) as [College, string][]).map(
  ([value, label]) => ({ value, label }),
);

/** 시트에 들어가는 보조 필터 중 적용된 개수. 기간은 시작·종료를 한 덩어리로 센다. */
export function secondaryFilterCount(filters: ApplicantsFilters): number {
  let count = 0;
  if (filters.college) count += 1;
  if (filters.submittedFrom || filters.submittedTo) count += 1;
  return count;
}

type Props = {
  filters: ApplicantsFilters;
  onChange: (next: ApplicantsFilters) => void;
  useInterview: boolean;
  counts: StatusCounts;
};

export function ApplicantsFilterBar({ filters, onChange, useInterview, counts }: Props) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const appliedCount = secondaryFilterCount(filters);
  const hasAnyFilter = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-3">
      {/* 1행 — 검색 + (모바일) 필터 버튼 */}
      <div className="flex items-center gap-2">
        <ApplicantsSearchInput
          defaultValue={filters.q ?? ''}
          onCommit={(committed) =>
            onChange({ ...filters, q: committed === '' ? undefined : committed })
          }
        />
        <button
          type="button"
          onClick={() => setIsSheetOpen(true)}
          aria-label={appliedCount > 0 ? `필터 ${appliedCount}개 적용됨` : '필터'}
          className="btn btn-secondary btn-sm shrink-0 lg:hidden"
        >
          필터
          {appliedCount > 0 && (
            <span aria-hidden className="ml-1 rounded-full bg-ink px-1.5 text-[11px] text-paper">
              {appliedCount}
            </span>
          )}
        </button>
      </div>

      {/* 2행 — 상태 칩 (모바일 가로 스크롤 / 데스크탑 줄바꿈) */}
      <StatusFilterChips
        value={filters.status}
        onChange={(nextStatus: ApplicationStatus | undefined) =>
          onChange({ ...filters, status: nextStatus })
        }
        counts={counts}
        useInterview={useInterview}
      />

      {/* 3행 — 데스크탑 전용 보조 필터 + 초기화(한 벌만 렌더) */}
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 lg:flex">
          <select
            value={filters.college ?? ''}
            aria-label="단과대"
            onChange={(event) =>
              onChange({
                ...filters,
                college:
                  event.target.value === '' ? undefined : (event.target.value as College),
              })
            }
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] font-medium text-charcoal-2"
          >
            <option value="">단과대 전체</option>
            {COLLEGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="시작일"
            value={filters.submittedFrom ?? ''}
            onChange={(event) =>
              onChange({ ...filters, submittedFrom: event.target.value || undefined })
            }
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] text-charcoal-2"
          />
          <span aria-hidden className="text-charcoal-3">~</span>
          <input
            type="date"
            aria-label="종료일"
            value={filters.submittedTo ?? ''}
            onChange={(event) =>
              onChange({ ...filters, submittedTo: event.target.value || undefined })
            }
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] text-charcoal-2"
          />
        </div>

        {hasAnyFilter && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="btn btn-ghost btn-sm lg:ml-auto"
          >
            필터 초기화
          </button>
        )}
      </div>

      <ApplicantsFilterSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        filters={filters}
        onApply={onChange}
      />
    </div>
  );
}
```

- [ ] **Step 5: 검색 입력 정렬**

`ApplicantsSearchInput.tsx` 의 className 만 바꾼다(디바운스 로직은 그대로).

```tsx
    className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-3 focus:border-sage focus:outline-none lg:max-w-xs"
```

- [ ] **Step 6: 목록 쿼리에서 status 를 빼고 클라이언트에서 건다**

`page.tsx`:

```tsx
import { countByStatus } from './_lib/applicantCounts';
...
  // 상태는 클라이언트에서 건다 — 칩 숫자가 현재 필터 결과 안의 분포와 항상 일치해야 한다(설계 §6).
  // URL 의 status 는 그대로 둔다: 상세 이전/다음 탐색을 서버가 같은 조건으로 계산한다.
  const listFilters = useMemo(() => ({ ...filters, status: undefined }), [filters]);
  const {
    data: allApplicants = [],
    isLoading: isApplicantsLoading,
    isFetching: isApplicantsFetching,
  } = useApplicantsQuery(
    recruitment?.applicationMode === 'SELF' && !isNaN(recruitmentId) ? recruitmentId : undefined,
    listFilters,
  );
  const counts = useMemo(() => countByStatus(allApplicants), [allApplicants]);
  const applicants = useMemo(
    () =>
      filters.status
        ? allApplicants.filter((applicant) => applicant.status === filters.status)
        : allApplicants,
    [allApplicants, filters.status],
  );
```

**`selectableIds` 의 입력은 반드시 `applicants`(상태 필터 적용본)** 이어야 한다. `allApplicants` 를 넣으면 화면에 없는 지원자까지 전체 선택되어 일괄 처리에 딸려간다.

`ApplicantsFilterBar` 호출부에 `counts={counts}` 를 넘긴다.

- [ ] **Step 7: 목록 전환 중 이전 결과 유지**

`frontend/packages/hooks/src/applications.ts` 의 `useApplicantsQuery` 에 `placeholderData` 를 추가한다.

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query';
...
    placeholderData: keepPreviousData,
```

`page.tsx` 의 목록 래퍼에 갱신 중 신호를 준다.

```tsx
<div aria-busy={isApplicantsFetching} className={cn(isApplicantsFetching && 'opacity-60 transition-opacity')}>
  {/* ApplicantCardList + ApplicantTable */}
</div>
```

- [ ] **Step 8: `closed-readonly.test.tsx` 갱신**

`getByLabelText('상태')`(select 전제)를 칩 조회로 바꾼다. 마감 모집에서도 상태로 거를 수단이 남아 있는지 확인하는 원래 의도를 유지한다.

```tsx
    expect(screen.getByRole('button', { name: /지원 완료/ })).toBeInTheDocument();
```

- [ ] **Step 9: 전체 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants`
Expected: PASS

- [ ] **Step 10: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/darter && git add -A frontend && git commit -m "feat(frontend): 지원자 검색·필터 리디자인 — 상태 칩 상시 노출·보조 필터 시트·클라이언트 상태 필터"
```

---

### Task 6: 전체 선택 · 선택 생존 규칙 · 화면 마감

**Files:**
- Create: `.../applicants/_components/SelectAllBar.tsx`
- Modify: `.../applicants/page.tsx`
- Modify: `.../applicants/_components/BulkActionBar.tsx` (폭 동기화 + 재도색)
- Test: `frontend/apps/web/test/manage/applicants/select-all-bar.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  type SelectAllBarProps = {
    selectableCount: number;
    selectedCount: number;
    state: SelectAllState;
    onToggleAll: () => void;
  };
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`test/manage/applicants/select-all-bar.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectAllBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/SelectAllBar';

describe('전체 선택 바', () => {
  it('미선택이면 선택 가능 인원을 먼저 알려준다', () => {
    render(<SelectAllBar selectableCount={14} selectedCount={0} state="none" onToggleAll={vi.fn()} />);
    expect(screen.getByText('전체 선택 (14명 선택 가능)')).toBeInTheDocument();
  });

  it('부분 선택이면 진행 상황을 보여주고 indeterminate 다', () => {
    render(<SelectAllBar selectableCount={14} selectedCount={7} state="partial" onToggleAll={vi.fn()} />);
    expect(screen.getByText('전체 선택 (7/14)')).toBeInTheDocument();
    expect(
      (screen.getByRole('checkbox', { name: '전체 선택' }) as HTMLInputElement).indeterminate,
    ).toBe(true);
  });

  it('전체 선택이면 선택 인원을 보여준다', () => {
    render(<SelectAllBar selectableCount={14} selectedCount={14} state="all" onToggleAll={vi.fn()} />);
    expect(screen.getByText('전체 선택 (14명)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeChecked();
  });

  it('선택 가능 인원이 0명이면 비활성이다', () => {
    render(<SelectAllBar selectableCount={0} selectedCount={0} state="none" onToggleAll={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeDisabled();
  });

  it('누르면 onToggleAll 이 불린다', () => {
    const onToggleAll = vi.fn();
    render(<SelectAllBar selectableCount={14} selectedCount={0} state="none" onToggleAll={onToggleAll} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }));
    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/select-all-bar.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`_components/SelectAllBar.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { SelectAllState } from '../_lib/applicantSelection';

type Props = {
  selectableCount: number;
  selectedCount: number;
  state: SelectAllState;
  onToggleAll: () => void;
};

/**
 * 모바일·태블릿(≤1023px) 전체 선택 줄. 데스크탑은 표 헤더 체크박스가 같은 역할을 한다.
 * "전체" 는 현재 필터 결과 중 선택 가능한 지원자 전원이며 최종 상태는 제외된다.
 * 체크하기 전에 대상 인원을 먼저 알려준다 — 34명을 눌렀는데 14명만 선택되면 놀란다.
 */
export function SelectAllBar({ selectableCount, selectedCount, state, onToggleAll }: Props) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = state === 'partial';
    }
  }, [state]);

  const label =
    state === 'all'
      ? `전체 선택 (${selectedCount}명)`
      : state === 'partial'
        ? `전체 선택 (${selectedCount}/${selectableCount})`
        : `전체 선택 (${selectableCount}명 선택 가능)`;

  return (
    <label className="mt-4 flex cursor-pointer items-center gap-2 px-1 text-[13px] font-medium text-charcoal-2 lg:hidden">
      <input
        ref={checkboxRef}
        type="checkbox"
        aria-label="전체 선택"
        checked={state === 'all'}
        disabled={selectableCount === 0}
        onChange={onToggleAll}
        className="h-4 w-4 cursor-pointer rounded border-line text-ink focus:ring-sage disabled:cursor-not-allowed disabled:opacity-50"
      />
      {label}
    </label>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/select-all-bar.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: 페이지 마감 — 컨테이너·선택 생존·재도색**

**(1) 컨테이너를 회원 관리와 통일**

```tsx
    <div
      className={cn(
        'mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10',
        selectedIds.length > 0
          ? 'pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pb-24'
          : 'pb-10',
      )}
    >
```

**(2) 선택 생존 규칙 — 정리하되 검색어는 예외**

회원 관리 `members/page.tsx` 의 규칙을 따른다. 검색어 한 글자에 선택이 전멸하면 안 된다.

```tsx
  const updateFilters = useCallback(
    (nextFilters: ApplicantsFilters) => {
      const nextParams = new URLSearchParams();
      if (nextFilters.status) nextParams.set('status', nextFilters.status);
      if (nextFilters.college) nextParams.set('college', nextFilters.college);
      if (nextFilters.q) nextParams.set('q', nextFilters.q);
      if (nextFilters.submittedFrom) nextParams.set('submittedFrom', nextFilters.submittedFrom);
      if (nextFilters.submittedTo) nextParams.set('submittedTo', nextFilters.submittedTo);

      // 검색어만 바뀐 경우는 선택을 건드리지 않는다 — 타이핑 한 글자에 선택이 영구 소실되고
      // 검색어를 지워도 복구되지 않는다(회원 관리와 같은 규칙).
      const onlyQueryChanged =
        nextFilters.status === filters.status &&
        nextFilters.college === filters.college &&
        nextFilters.submittedFrom === filters.submittedFrom &&
        nextFilters.submittedTo === filters.submittedTo;

      if (!onlyQueryChanged) {
        // 상태가 바뀌면 새 상태에 해당하는 선택만 남긴다(클라이언트에서 즉시 판정 가능).
        // 단과대·기간은 서버 필터라 새 결과를 아직 모르므로 비운다 — "보이지 않는 선택" 을
        // 남기지 않는 쪽으로 안전하게 기운다.
        const collegeOrPeriodChanged =
          nextFilters.college !== filters.college ||
          nextFilters.submittedFrom !== filters.submittedFrom ||
          nextFilters.submittedTo !== filters.submittedTo;
        setSelectedIds((current) =>
          collegeOrPeriodChanged
            ? []
            : current.filter((id) =>
                allApplicants.some(
                  (applicant) =>
                    applicant.applicationId === id &&
                    (!nextFilters.status || applicant.status === nextFilters.status),
                ),
              ),
        );
      }
      router.replace(`?${nextParams.toString()}`);
    },
    [router, filters, allApplicants],
  );
```

**(3) 선택 헬퍼 정리** — Task 3 에서 인라인으로 둔 것을 `useMemo`/`useCallback` 으로 옮긴다.

```tsx
  const selectable = useMemo(() => selectableIds(applicants), [applicants]);
  const allState = useMemo(
    () => selectAllState(selectedSet, selectable),
    [selectedSet, selectable],
  );
  const toggleAll = useCallback(
    () => setSelectedIds(toggleSelectAll(selectable, allState)),
    [selectable, allState],
  );
```

**(4) `SelectAllBar` 배치** — 목록이 0건이면 렌더하지 않는다.

```tsx
{applicants.length > 0 && (
  <SelectAllBar
    selectableCount={selectable.length}
    selectedCount={selectable.filter((id) => selectedSet.has(id)).length}
    state={allState}
    onToggleAll={toggleAll}
  />
)}
```

**(5) 페이지 나머지 재도색** — 문구·구조·분기 조건은 그대로 두고 색만 바꾼다.

| 위치 | 지금 | 바꿀 값 |
|---|---|---|
| 뒤로 가기 링크 | `text-slate-500 hover:text-slate-700` | `text-charcoal-3 hover:text-charcoal` |
| h1 | `text-slate-900` | `text-ink-deep` |
| 마감 배너 | `border-slate-200 bg-slate-50 text-slate-600` | `border-line bg-graysoft/40 text-charcoal-2` |
| 외부 폼 안내 | `border-slate-200 bg-slate-50 text-slate-600` | `border-line bg-graysoft/40 text-charcoal-2` |
| 일괄 결과 닫기 | `text-slate-500 hover:text-slate-800` | `text-charcoal-3 hover:text-charcoal` |
| 빈 상태 | `text-neutral-500` | `text-charcoal-3` |
| PII 푸터 | `text-slate-400` | `text-charcoal-3` |

- [ ] **Step 6: `BulkActionBar` 폭 동기화 + 재도색**

- `mx-auto flex max-w-5xl` → `max-w-6xl` (페이지가 `max-w-6xl` 로 올라가 바만 좁게 정렬되는 것을 막는다)
- `text-slate-700` → `text-charcoal-2`, `text-slate-900` → `text-ink-deep`, 버튼 테두리 → `border-line`
- **액션 구성·`finalizeOnly` 분기·`useInterview` 분기는 절대 건드리지 않는다.**
- 재도색 후 바 높이가 `page.tsx` 의 `pb-[calc(10rem+…)]` 보정값과 맞는지는 Task 7 에서 실측한다.

- [ ] **Step 7: 전체 게이트 (각 명령을 독립 실행)**

```bash
cd /Users/ksy/orca/workspaces/Duing/darter/frontend/apps/web && pnpm exec vitest run test/manage
```
```bash
cd /Users/ksy/orca/workspaces/Duing/darter/frontend && pnpm typecheck
```
```bash
cd /Users/ksy/orca/workspaces/Duing/darter/frontend && pnpm lint
```
```bash
cd /Users/ksy/orca/workspaces/Duing/darter/frontend && NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 AUTH_HINT_SECRET=build-only pnpm build
```
Expected: 전부 통과, 빌드 출력에 `Compiled successfully`.

- [ ] **Step 8: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/darter && git add -A frontend && git commit -m "feat(frontend): 지원자 전체 선택 도입·목록 화면 마감 — 선택 생존 규칙·콘솔 토큰 재도색"
```

---

### Task 7: 실브라우저 검증

jsdom 은 레이아웃이 없어 44px·2줄 기하·열 숨김·가로 overflow 를 검증하지 못한다.

**Files:**
- Create(임시): `frontend/apps/web/app/qa-applicants/page.tsx` — 검증 후 **반드시 삭제**
- Create(임시): `frontend/apps/web/.env.local` — 검증 후 **반드시 삭제**

- [ ] **Step 1: QA 하네스 준비**

`.env.local` 에 `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1` 와 `AUTH_HINT_SECRET=local-qa-only` 를 넣는다. 백엔드 없이 돌도록 QA 페이지는 고정 fixture 로 `ApplicantsFilterBar` + `SelectAllBar` + `ApplicantCardList` + `ApplicantTable` 을 직접 조립한다(최종 상태 1명 · 선택 가능 2명 · 긴 학과명 1명 · 평가 있는 1명 포함).

- [ ] **Step 2: 개발 서버 기동**

```bash
cd /Users/ksy/orca/workspaces/Duing/darter/frontend/apps/web && (pnpm dev > /tmp/dev-qa.log 2>&1 &) ; sleep 14; grep -m2 -E "Local:|Ready" /tmp/dev-qa.log
```
포트가 3000 인지 확인한다. 좀비가 잡고 있으면 **부모(`next dev`) → 워커(`next-server`) → 포트** 순으로 정리한다(순서를 뒤집으면 부모가 워커를 재생성한다).

- [ ] **Step 3: 오터치 실측 (320 / 360 / 390 / 414)**

`page.mouse.click(x, y)` 좌표 클릭을 쓴다. **`locator.click()` 은 쓰지 않는다** — 라벨의 연결 컨트롤이 disabled 면 actionability 검사에서 타임아웃 나 오판을 부른다. 첫 로드 직후는 하이드레이션 전이라 `waitForTimeout(900)` 이상 준 뒤 클릭한다.

| 대상 | 탭 위치 | 기대 |
|---|---|---|
| 선택 가능 | 체크박스 중심에서 10px·18px 빗나간 지점 | 선택만, 이동 0 |
| 선택 가능 | 카드 본문 | 상세 진입 |
| 최종 상태 | 체크박스 정중앙 | 상세 진입 |
| 최종 상태 | 44px 자리 모서리 | 상세 진입 |

- [ ] **Step 4: 뷰포트별 레이아웃 실측**

320 / 360 / 375 / 390 / 414 / 768 / 1024 / 1280 / 1440 / 1920.
- 카드 높이(최종 수치 기록), 히트 영역 크기, 가로 overflow(`documentElement.scrollWidth > innerWidth`)
- 잘린 텍스트(`scrollWidth > clientWidth + 1` 인 리프 노드) — **이름이 잘리면 레이아웃을 먼저 손본다**
- 1024 에서 단과대·학번 열이 숨겨졌는지, 1280 에서 노출되는지
- 상태 칩이 한 줄 가로 스크롤인지(줄바꿈 금지)
- 일괄 바 높이 vs `pb-[calc(10rem+…)]` 보정값이 맞는지

- [ ] **Step 5: 기능 회귀 확인**

검색 입력 → 목록 갱신(이전 목록이 딤으로 유지되는지), 상태 칩 → 즉시 반응(네트워크 없음), 시트에서 단과대·기간 적용, **시트 적용 후 닫고 뒤로가기 1회가 이전 화면으로 가는지**, 전체 선택이 최종 상태를 제외하는지, 다중 선택 후 일괄 바 노출.

- [ ] **Step 6: 정리**

```bash
cd /Users/ksy/orca/workspaces/Duing/darter && rm -rf frontend/apps/web/app/qa-applicants frontend/apps/web/.env.local && pkill -f "next dev"; pkill -f "next-server"
```
`git status` 로 임시 파일이 남지 않았는지 확인한다.

- [ ] **Step 7: 실측 결과 정리**

설계 문서 §10 검증 항목을 표로 채운다. 카드 높이 최종 수치와 한 화면에 보이는 지원자 수를 함께 적는다.

---

## 실행 순서

1 → 2 → 3 → 4 → 5 → 6 → 7 순차. Task 4 만 1~3 과 독립이라 병행 가능하지만 Task 5 가 소비한다.

PR #939 가 아직 develop 에 머지되지 않았다면 이 작업은 그 브랜치 위에 쌓인다(스택 PR).

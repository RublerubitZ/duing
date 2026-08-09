# 지원자 관리 목록 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지원자 관리 **목록 화면**을 운영 콘솔의 duing 디자인 언어로 통일하고, 데스크탑·태블릿·모바일 각각에 맞는 밀도와 선택·필터 UX를 제공한다.

**Architecture:** 지금 `ApplicantTable.tsx` 한 파일이 데스크탑 표와 모바일 카드를 모두 들고 있다. 이를 책임별로 쪼갠다 — 상태 색·선택 계산은 `_lib/`의 순수 모듈로 내리고, 표(`ApplicantTable`)와 카드 리스트(`ApplicantCardList`)를 분리하며, 필터는 칩(`StatusFilterChips`)·시트(`ApplicantsFilterSheet`)·조립부(`ApplicantsFilterBar`)로 나눈다. 페이지는 조립과 선택 상태만 담당한다.

**Tech Stack:** Next.js 15 App Router / React 19 / TanStack Query / Tailwind (duing 토큰) / Radix Sheet (`components/ui/sheet`) / vitest + @testing-library/react

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-09-applicants-list-redesign-design.md` — 충돌 시 설계 문서가 우선한다.
- **백엔드·DB·상태 전이 규칙·API contract 변경 금지.** 신규 API 금지. 기존 훅만 재사용한다.
- **범위 밖**: 메일 발송, CSV, 파이프라인/칸반, 지원자 상세 화면 리디자인.
- **`any` / `as` 타입 단언 금지**, 타입 선언은 `type`. 변수명 축약(`e`, `data`, `res`) 금지.
- 반응형 전환: **≤1023px 카드 리스트 / 1024~1279px 표(단과대·학번 숨김) / ≥1280px 표(전 열)**. Tailwind `lg:` = 1024, `xl:` = 1280.
- 상태 라벨은 `app/_constants/application-status.ts`의 `APPLICATION_STATUS_LABEL`(운영진 라벨: 지원 완료 / 보류 / 면접 대상 / 합격 / 불합격)만 쓴다. 새 어휘 금지.
- 색 토큰은 회원 관리와 동일 — `card` / `bg-cream` / `bg-cream/60` / `border-line` / `border-sage` / `text-ink` / `text-ink-deep` / `text-charcoal-2` / `text-charcoal-3` / `bg-paper`. **`sage-tint` 는 존재하지 않는다.**
- 모바일 체크박스 정책(PR #939)은 유지: 선택 가능 → 44×44 라벨 + 전파 차단, 최종 상태 → 인터랙티브 라벨 없음 + `disabled:pointer-events-none`.
- CLOSED 모집(`finalizeOnly`)에서 되돌리는 액션(면접 대상 선정·보류)을 감추는 기존 로직을 유지한다.
- 테스트 실행 cwd 는 `frontend/apps/web`, 명령은 `pnpm exec vitest run <경로>`.
- 커밋 메시지는 Conventional Commits + 한국어. Claude 공동저자 라인 금지.

---

### Task 1: 상태 색·선택 계산 공용 모듈

표와 카드 리스트가 갈라지면 `STATUS_BADGE_CLASS` 와 `isTerminalStatus` 가 양쪽에 복제된다. 먼저 순수 모듈로 내린다. UI 변화 없음.

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantStatus.ts`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantSelection.ts`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantTable.tsx` (자체 정의 대신 import)
- Test: `frontend/apps/web/test/manage/applicants/applicant-selection.test.ts`

**Interfaces:**
- Produces:
  - `STATUS_BADGE_CLASS: Record<ApplicationStatus, string>`
  - `STATUS_STRIPE_CLASS: Record<ApplicationStatus, string>`
  - `isTerminalStatus(status: ApplicationStatus): boolean`
  - `selectableIds(applicants: Applicant[]): number[]`
  - `type SelectAllState = 'none' | 'partial' | 'all'`
  - `selectAllState(selected: ReadonlySet<number>, selectable: readonly number[]): SelectAllState`
  - `toggleSelectAll(selectable: readonly number[], state: SelectAllState): number[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/manage/applicants/applicant-selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Applicant } from '@duing/types';
import {
  selectableIds,
  selectAllState,
  toggleSelectAll,
} from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantSelection';

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

describe('지원자 선택 계산', () => {
  const applicants = [
    makeApplicant(1, 'SUBMITTED'),
    makeApplicant(2, 'ACCEPTED'),
    makeApplicant(3, 'ON_HOLD'),
    makeApplicant(4, 'REJECTED'),
    makeApplicant(5, 'INTERVIEW_PENDING'),
  ];

  it('최종 상태(합격·불합격)는 선택 대상에서 빠진다', () => {
    expect(selectableIds(applicants)).toEqual([1, 3, 5]);
  });

  it('선택 가능 인원이 0명이면 전체 선택 상태는 none 이다', () => {
    expect(selectAllState(new Set([1, 2]), [])).toBe('none');
  });

  it('아무도 선택하지 않으면 none', () => {
    expect(selectAllState(new Set(), [1, 3, 5])).toBe('none');
  });

  it('일부만 선택하면 partial', () => {
    expect(selectAllState(new Set([1]), [1, 3, 5])).toBe('partial');
  });

  it('선택 가능 전원을 선택하면 all', () => {
    expect(selectAllState(new Set([1, 3, 5]), [1, 3, 5])).toBe('all');
  });

  it('전체 선택 토글 — all 이면 비우고, 그 외에는 선택 가능 전원을 채운다', () => {
    expect(toggleSelectAll([1, 3, 5], 'all')).toEqual([]);
    expect(toggleSelectAll([1, 3, 5], 'none')).toEqual([1, 3, 5]);
    expect(toggleSelectAll([1, 3, 5], 'partial')).toEqual([1, 3, 5]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicant-selection.test.ts`
Expected: FAIL — `Failed to resolve import ... _lib/applicantSelection`

- [ ] **Step 3: 최소 구현**

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
 * 띠는 배지를 대체하지 않는 보조 신호라 접근성 트리에서는 제외한다(색 단독 전달 금지).
 */
export const STATUS_STRIPE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'border-l-sky-400',
  ON_HOLD: 'border-l-amber-400',
  INTERVIEW_PENDING: 'border-l-purple-400',
  ACCEPTED: 'border-l-emerald-500',
  REJECTED: 'border-l-rose-400',
};

export function isTerminalStatus(status: ApplicationStatus): boolean {
  return status === 'ACCEPTED' || status === 'REJECTED';
}
```

`_lib/applicantSelection.ts`:

```ts
import type { Applicant } from '@duing/types';
import { isTerminalStatus } from './applicantStatus';

/** 선택 가능한 지원자 = 최종 상태가 아닌 지원자. 목록 순서를 유지한다. */
export function selectableIds(applicants: Applicant[]): number[] {
  return applicants
    .filter((applicant) => !isTerminalStatus(applicant.status))
    .map((applicant) => applicant.applicationId);
}

export type SelectAllState = 'none' | 'partial' | 'all';

export function selectAllState(
  selected: ReadonlySet<number>,
  selectable: readonly number[],
): SelectAllState {
  if (selectable.length === 0) return 'none';
  const selectedCount = selectable.filter((id) => selected.has(id)).length;
  if (selectedCount === 0) return 'none';
  return selectedCount === selectable.length ? 'all' : 'partial';
}

/** 전체 선택 토글 — 이미 전원이면 비우고, 아니면 선택 가능 전원을 채운다. */
export function toggleSelectAll(
  selectable: readonly number[],
  state: SelectAllState,
): number[] {
  return state === 'all' ? [] : [...selectable];
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicant-selection.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: `ApplicantTable.tsx` 가 공용 모듈을 쓰도록 교체**

`ApplicantTable.tsx` 상단의 `STATUS_BADGE_CLASS` 상수 정의와 `isTerminalStatus` 함수 정의를 삭제하고 import 로 바꾼다:

```tsx
import { STATUS_BADGE_CLASS, isTerminalStatus } from '../_lib/applicantStatus';
```

- [ ] **Step 6: 기존 테스트가 그대로 통과하는지 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants`
Expected: PASS — 기존 지원자 테스트 전부 초록(리팩터링이라 동작 변화 없음)

- [ ] **Step 7: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/_lib frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/applicants/_components/ApplicantTable.tsx frontend/apps/web/test/manage/applicants/applicant-selection.test.ts
git commit -m "refactor(frontend): 지원자 상태 색·선택 계산 공용 모듈 분리"
```

---

### Task 2: 모바일 2줄 dense list

`ApplicantTable.tsx` 안의 모바일 카드 블록을 별도 컴포넌트로 떼어내고 2줄 구조·상태 띠·평가 표식으로 다시 만든다.

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantCardList.tsx`
- Modify: `.../applicants/_components/ApplicantTable.tsx` (모바일 블록 제거 — 표만 남김)
- Test: `frontend/apps/web/test/manage/applicants/applicant-card-list.test.tsx`
- Modify: `frontend/apps/web/test/manage/applicants/applicant-card-touch.test.tsx` (대상 컴포넌트 교체)

**Interfaces:**
- Consumes: Task 1 의 `STATUS_BADGE_CLASS`, `STATUS_STRIPE_CLASS`, `isTerminalStatus`
- Produces:
  ```ts
  type ApplicantCardListProps = {
    applicants: Applicant[];
    selectedSet: ReadonlySet<number>;
    onToggleSelect: (applicationId: number) => void;
    onOpenDetail: (applicationId: number) => void;
  };
  export function ApplicantCardList(props: ApplicantCardListProps): JSX.Element;
  ```
  `ApplicantTable` 은 더 이상 모바일을 렌더하지 않는다 — props 는 그대로 두되 `hidden lg:block` 컨테이너만 남는다.

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

function renderList(applicants: Applicant[], overrides?: Partial<{ onToggleSelect: (id: number) => void; onOpenDetail: (id: number) => void; selected: number[] }>) {
  const onToggleSelect = overrides?.onToggleSelect ?? vi.fn();
  const onOpenDetail = overrides?.onOpenDetail ?? vi.fn();
  render(
    <ApplicantCardList
      applicants={applicants}
      selectedSet={new Set(overrides?.selected ?? [])}
      onToggleSelect={onToggleSelect}
      onOpenDetail={onOpenDetail}
    />,
  );
  return { onToggleSelect, onOpenDetail };
}

describe('모바일 지원자 카드 리스트', () => {
  it('1행에 이름·학년·상태, 2행에 학과·학번·지원일을 보여준다', () => {
    renderList([baseApplicant]);
    expect(screen.getByText('홍길동')).toBeInTheDocument();
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

  it('상태 띠는 상태별 색을 쓰고 접근성 트리에 노출되지 않는다', () => {
    renderList([baseApplicant]);
    const card = screen.getByText('홍길동').closest('[data-applicant-card]');
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
Expected: FAIL — `Failed to resolve import ... ApplicantCardList`

- [ ] **Step 3: 컴포넌트 구현**

`_components/ApplicantCardList.tsx`:

```tsx
'use client';

import { formatDateKst } from '@duing/hooks';
import type { Applicant } from '@duing/types';
import { GRADE_DISPLAY_NAME } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../_constants/application-status';
import {
  STATUS_BADGE_CLASS,
  STATUS_STRIPE_CLASS,
  isTerminalStatus,
} from '../_lib/applicantStatus';

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
}: Props) {
  return (
    <div className="mt-4 space-y-2 lg:hidden">
      {applicants.map((applicant) => {
        const isTerminal = isTerminalStatus(applicant.status);
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
                {/* 1행 — 이름·학년·상태 */}
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate text-[14px] font-semibold leading-5 text-ink-deep">
                    {applicant.userName}
                  </span>
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
Expected: PASS (9 tests)

- [ ] **Step 5: `ApplicantTable.tsx` 에서 모바일 블록 삭제**

`ApplicantTable.tsx` 의 `{/* 모바일: 카드 리스트 */}` 로 시작하는 `md:hidden` 블록 전체를 지우고, 감싸던 프래그먼트(`<>...</>`)를 없앤 뒤 표 컨테이너만 반환하도록 바꾼다. 표 컨테이너 클래스는 `hidden md:block` → `hidden lg:block` 으로 바꾼다(전환점 이동).

- [ ] **Step 6: 기존 터치 테스트를 새 컴포넌트로 옮김**

`test/manage/applicants/applicant-card-touch.test.tsx` 의 import 와 렌더 대상을 `ApplicantTable` → `ApplicantCardList` 로 바꾼다. `ApplicantCardList` 는 라우팅을 하지 않고 `onOpenDetail` 콜백만 부르므로, `next/navigation` mock 과 `pushMock` 단언은 `onOpenDetail` 단언으로 교체한다. 데스크탑 표가 같이 렌더되지 않으므로 `mobileCheckbox` 헬퍼의 "라벨로 감싸진 것 하나만 고르기" 로직은 단순 조회로 바꾼다.

- [ ] **Step 7: 전체 테스트 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants`
Expected: PASS — 모든 지원자 테스트 초록

- [ ] **Step 8: 커밋**

```bash
git add frontend/apps/web/app/manage frontend/apps/web/test/manage/applicants
git commit -m "feat(frontend): 지원자 목록 모바일 2줄 dense list — 상태 띠·평가 표식·히트 영역 보정"
```

---

### Task 3: 데스크탑 표 리디자인

**Files:**
- Modify: `.../applicants/_components/ApplicantTable.tsx`
- Test: `frontend/apps/web/test/manage/applicants/applicant-table.test.tsx`

**Interfaces:**
- Consumes: Task 1 의 `STATUS_BADGE_CLASS`, `isTerminalStatus`, `selectAllState`, `toggleSelectAll`
- Produces:
  ```ts
  type ApplicantTableProps = {
    applicants: Applicant[];
    selectedSet: ReadonlySet<number>;
    onToggleSelect: (applicationId: number) => void;
    onToggleAll: () => void;
    onOpenDetail: (applicationId: number) => void;
    useInterview: boolean;
  };
  ```
  `clubId` / `recruitmentId` / `selectedIds` / `onSelect` props 는 없어진다 — 라우팅과 선택 계산은 페이지가 맡는다(Task 6).

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

  it('단과대·학번 열은 1024~1279px 에서 숨기는 클래스를 갖는다', () => {
    renderTable([baseApplicant]);
    const collegeCell = screen.getByText('IT·공과대학');
    const studentIdCell = screen.getByText('20200001');
    expect(collegeCell.closest('td')?.className).toContain('hidden xl:table-cell');
    expect(studentIdCell.closest('td')?.className).toContain('hidden xl:table-cell');
  });

  it('헤더 전체 선택 체크박스가 있고 누르면 onToggleAll 이 불린다', () => {
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

  it('행 본문을 누르면 상세로 간다', () => {
    const { onOpenDetail } = renderTable([baseApplicant]);
    fireEvent.click(screen.getByText('홍길동'));
    expect(onOpenDetail).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicant-table.test.tsx`
Expected: FAIL — props 불일치로 타입/렌더 실패, `전체 선택` 체크박스 없음

- [ ] **Step 3: 표 구현**

`ApplicantTable.tsx` 전체를 아래로 교체한다:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { formatDateKst } from '@duing/hooks';
import type { Applicant } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../_constants/application-status';
import { STATUS_BADGE_CLASS, isTerminalStatus } from '../_lib/applicantStatus';
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
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs', colorClass)}>
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
  useInterview: boolean;
};

/**
 * 데스크탑(≥1024px) 지원자 표. 1024~1279px 은 콘텐츠 폭이 672~927px 뿐이라
 * Secondary 열(단과대·학번)을 숨기고 xl(1280px) 이상에서만 노출한다(설계 §3).
 * 가로 스크롤은 만들지 않는다.
 */
export function ApplicantTable({
  applicants,
  selectedSet,
  onToggleSelect,
  onToggleAll,
  onOpenDetail,
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
    <div className="mt-4 hidden overflow-hidden rounded-lg border border-line bg-paper lg:block">
      <table className="w-full text-sm">
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
            <th className="px-4 py-3 font-medium text-charcoal-2">지원일</th>
            {useInterview && (
              <th className="px-4 py-3 font-medium text-charcoal-2">면접일정</th>
            )}
            <th className="px-4 py-3 font-medium text-charcoal-2">내 평가</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {applicants.map((applicant) => {
            const isTerminal = isTerminalStatus(applicant.status);
            const isSelected = selectedSet.has(applicant.applicationId);
            return (
              <tr
                key={applicant.applicationId}
                onClick={() => onOpenDetail(applicant.applicationId)}
                className={cn(
                  'cursor-pointer hover:bg-cream/60',
                  isSelected && 'bg-cream/60',
                )}
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
                <td className="px-4 py-3 font-semibold text-ink-deep">{applicant.userName}</td>
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
                <td className="px-4 py-3 tabular-nums text-charcoal-3">
                  {formatDateKst(applicant.submittedAt)}
                </td>
                {useInterview && (
                  <td className="px-4 py-3 tabular-nums text-charcoal-3">
                    {applicant.interviewStartAt
                      ? formatDateKst(applicant.interviewStartAt)
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
Expected: PASS (7 tests)

- [ ] **Step 5: 낡은 테스트 정리**

`test/manage/applicants/applicant-table-extension.test.tsx` 는 옛 props(`selectedIds`/`onSelect`/`clubId`/`recruitmentId`)와 표+카드 동시 렌더를 전제로 한다. 새 props 에 맞게 고치고, 모바일 카드에 관한 단언(`getAllByRole` 로 2개 기대)은 Task 2 의 카드 테스트가 이미 덮으므로 표 단독 단언으로 바꾼다.

- [ ] **Step 6: 전체 테스트 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add frontend/apps/web/app/manage frontend/apps/web/test/manage/applicants
git commit -m "feat(frontend): 지원자 표 리디자인 — 콘솔 토큰 정렬·열 위계·좁은 데스크탑 보조열 숨김"
```

---

### Task 4: 상태 필터 칩 + 카운트

**Files:**
- Create: `.../applicants/_components/StatusFilterChips.tsx`
- Test: `frontend/apps/web/test/manage/applicants/status-filter-chips.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  type StatusFilterChipsProps = {
    value: ApplicationStatus | undefined;      // undefined = 전체
    onChange: (next: ApplicationStatus | undefined) => void;
    summary: StatsSummary | undefined;         // 로딩·실패 시 undefined
    useInterview: boolean;
  };
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/manage/applicants/status-filter-chips.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { StatsSummary } from '@duing/types';
import { StatusFilterChips } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/StatusFilterChips';

const summary: StatsSummary = {
  total: 34,
  submitted: 12,
  onHold: 3,
  interviewPending: 8,
  accepted: 10,
  rejected: 1,
  capacity: 20,
  ratio: 0.5,
};

describe('상태 필터 칩', () => {
  it('운영진 라벨과 카운트를 함께 보여준다', () => {
    render(<StatusFilterChips value={undefined} onChange={vi.fn()} summary={summary} useInterview />);
    expect(screen.getByRole('button', { name: '전체 34명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원 완료 12명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보류 3명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '면접 대상 8명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '합격 10명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '불합격 1명' })).toBeInTheDocument();
  });

  it('summary 가 없으면 숫자 없이 칩만 렌더한다', () => {
    render(<StatusFilterChips value={undefined} onChange={vi.fn()} summary={undefined} useInterview />);
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원 완료' })).toBeInTheDocument();
  });

  it('면접을 쓰지 않는 모집은 면접 대상 칩을 감춘다', () => {
    render(<StatusFilterChips value={undefined} onChange={vi.fn()} summary={summary} useInterview={false} />);
    expect(screen.queryByRole('button', { name: /면접 대상/ })).not.toBeInTheDocument();
  });

  it('선택된 칩만 aria-pressed 가 true 다', () => {
    render(<StatusFilterChips value="ON_HOLD" onChange={vi.fn()} summary={summary} useInterview />);
    expect(screen.getByRole('button', { name: '보류 3명' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '전체 34명' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('전체 칩은 상태 필터를 지운다', () => {
    const onChange = vi.fn();
    render(<StatusFilterChips value="ON_HOLD" onChange={onChange} summary={summary} useInterview />);
    fireEvent.click(screen.getByRole('button', { name: '전체 34명' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('상태 칩은 해당 상태로 필터한다', () => {
    const onChange = vi.fn();
    render(<StatusFilterChips value={undefined} onChange={onChange} summary={summary} useInterview />);
    fireEvent.click(screen.getByRole('button', { name: '합격 10명' }));
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

import type { ApplicationStatus, StatsSummary } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../_constants/application-status';

// 회원 관리 MemberFilterChips 와 같은 칩 스타일 — 콘솔 안에서 필터 생김새가 갈리지 않게 한다.
const CHIP_BASE =
  'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors';
const CHIP_ON = 'bg-ink border-ink text-paper';
const CHIP_OFF = 'bg-paper border-line text-charcoal-2 hover:border-sage hover:text-ink';

type StatusChip = {
  value: ApplicationStatus | undefined;
  label: string;
  count: (summary: StatsSummary) => number;
};

const CHIPS: StatusChip[] = [
  { value: undefined, label: '전체', count: (summary) => summary.total },
  {
    value: 'SUBMITTED',
    label: APPLICATION_STATUS_LABEL.SUBMITTED,
    count: (summary) => summary.submitted,
  },
  {
    value: 'ON_HOLD',
    label: APPLICATION_STATUS_LABEL.ON_HOLD,
    count: (summary) => summary.onHold,
  },
  {
    value: 'INTERVIEW_PENDING',
    label: APPLICATION_STATUS_LABEL.INTERVIEW_PENDING,
    count: (summary) => summary.interviewPending,
  },
  {
    value: 'ACCEPTED',
    label: APPLICATION_STATUS_LABEL.ACCEPTED,
    count: (summary) => summary.accepted,
  },
  {
    value: 'REJECTED',
    label: APPLICATION_STATUS_LABEL.REJECTED,
    count: (summary) => summary.rejected,
  },
];

type Props = {
  value: ApplicationStatus | undefined;
  onChange: (next: ApplicationStatus | undefined) => void;
  /** stats 로딩·실패 시 undefined — 그때는 숫자 없이 필터만 동작한다. */
  summary: StatsSummary | undefined;
  useInterview: boolean;
};

/**
 * 상태 필터 = 현황 표시. 별도 KPI 타일을 두지 않고 칩에 카운트를 얹는다(설계 §6).
 * 카운트는 모집 전체 집계라 단과대·기간·검색어 필터와는 무관하다.
 */
export function StatusFilterChips({ value, onChange, summary, useInterview }: Props) {
  const visibleChips = CHIPS.filter(
    (chip) => useInterview || chip.value !== 'INTERVIEW_PENDING',
  );

  return (
    <div
      role="group"
      aria-label="상태 필터"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {visibleChips.map((chip) => {
        const selected = value === chip.value;
        const count = summary ? chip.count(summary) : null;
        return (
          <button
            key={chip.value ?? 'ALL'}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(chip.value)}
            className={cn(CHIP_BASE, selected ? CHIP_ON : CHIP_OFF)}
          >
            {chip.label}
            {count !== null && (
              <span className="ml-1 tabular-nums">
                {count}
                <span className="sr-only">명</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/status-filter-chips.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/manage frontend/apps/web/test/manage/applicants/status-filter-chips.test.tsx
git commit -m "feat(frontend): 지원자 상태 필터 칩 — 현황 카운트 통합·stats 실패 시 숫자 생략"
```

---

### Task 5: 필터 시트 + 필터 바 재구성

**Files:**
- Create: `.../applicants/_components/ApplicantsFilterSheet.tsx`
- Modify: `.../applicants/_components/ApplicantsFilterBar.tsx` (전면 교체)
- Modify: `.../applicants/_components/ApplicantsSearchInput.tsx` (콘솔 토큰·전폭 대응)
- Test: `frontend/apps/web/test/manage/applicants/applicants-filter-bar.test.tsx` (기존 파일 갱신)

**Interfaces:**
- Consumes: Task 4 의 `StatusFilterChips`
- Produces:
  ```ts
  type ApplicantsFilterBarProps = {
    filters: ApplicantsFilters;
    onChange: (next: ApplicantsFilters) => void;
    useInterview: boolean;
    summary: StatsSummary | undefined;
  };
  type ApplicantsFilterSheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    filters: ApplicantsFilters;
    onApply: (next: ApplicantsFilters) => void;
  };
  ```
  `secondaryFilterCount(filters)` — 단과대·기간에서 적용된 개수(0~2). 필터 버튼 배지에 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/manage/applicants/applicants-filter-bar.test.tsx` 를 아래로 교체한다:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ApplicantsFilters, StatsSummary } from '@duing/types';
import { ApplicantsFilterBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantsFilterBar';

const summary: StatsSummary = {
  total: 34, submitted: 12, onHold: 3, interviewPending: 8,
  accepted: 10, rejected: 1, capacity: 20, ratio: 0.5,
};

function renderBar(filters: ApplicantsFilters = {}) {
  const onChange = vi.fn();
  render(
    <ApplicantsFilterBar filters={filters} onChange={onChange} useInterview summary={summary} />,
  );
  return { onChange };
}

describe('지원자 필터 바', () => {
  it('검색과 상태 칩을 항상 노출한다', () => {
    renderBar();
    expect(screen.getByLabelText('지원자 검색')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원 완료 12명' })).toBeInTheDocument();
  });

  it('상태 칩을 누르면 status 필터만 바뀐다', () => {
    const { onChange } = renderBar({ college: 'IT_ENGINEERING' });
    fireEvent.click(screen.getByRole('button', { name: '보류 3명' }));
    expect(onChange).toHaveBeenCalledWith({ college: 'IT_ENGINEERING', status: 'ON_HOLD' });
  });

  it('모바일 필터 버튼은 단과대·기간 적용 개수를 배지로 보여준다', () => {
    renderBar({ college: 'IT_ENGINEERING', submittedFrom: '2026-05-01' });
    expect(screen.getByRole('button', { name: '필터 2개 적용됨' })).toBeInTheDocument();
  });

  it('적용된 보조 필터가 없으면 개수 없이 "필터" 로만 보인다', () => {
    renderBar({ status: 'ON_HOLD' });
    expect(screen.getByRole('button', { name: '필터' })).toBeInTheDocument();
  });

  it('필터 초기화는 모든 필터를 비운다', () => {
    const { onChange } = renderBar({ status: 'ON_HOLD', college: 'IT_ENGINEERING', q: '홍' });
    fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('데스크탑 단과대 선택은 college 필터를 바꾼다', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByLabelText('단과대'), { target: { value: 'IT_ENGINEERING' } });
    expect(onChange).toHaveBeenCalledWith({ college: 'IT_ENGINEERING' });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicants-filter-bar.test.tsx`
Expected: FAIL — 새 props(`summary`) 와 칩·필터 버튼이 없음

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
 * 시트 안에서는 임시 상태로 편집하고 "적용" 에서 한 번에 반영한다 — 열 때마다 현재 필터로 초기화한다.
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
                  college: event.target.value === '' ? undefined : (event.target.value as College),
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
              setDraft({ ...draft, college: undefined, submittedFrom: undefined, submittedTo: undefined })
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

`_components/ApplicantsFilterBar.tsx` 전체 교체:

```tsx
'use client';

import { useState } from 'react';
import type { ApplicantsFilters, ApplicationStatus, College, StatsSummary } from '@duing/types';
import { COLLEGE_DISPLAY_NAME } from '@duing/types';
import { ApplicantsSearchInput } from './ApplicantsSearchInput';
import { ApplicantsFilterSheet } from './ApplicantsFilterSheet';
import { StatusFilterChips } from './StatusFilterChips';

const COLLEGE_OPTIONS = (Object.entries(COLLEGE_DISPLAY_NAME) as [College, string][]).map(
  ([value, label]) => ({ value, label }),
);

/** 시트에 들어가는 보조 필터(단과대·기간) 중 적용된 개수. 기간은 시작·종료를 한 덩어리로 센다. */
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
  summary: StatsSummary | undefined;
};

export function ApplicantsFilterBar({ filters, onChange, useInterview, summary }: Props) {
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

      {/* 2행 — 상태 칩 (모바일은 가로 스크롤, 데스크탑은 줄바꿈) */}
      <StatusFilterChips
        value={filters.status}
        onChange={(nextStatus: ApplicationStatus | undefined) =>
          onChange({ ...filters, status: nextStatus })
        }
        summary={summary}
        useInterview={useInterview}
      />

      {/* 3행 — 데스크탑 전용 보조 필터(시트에 숨기지 않는다) */}
      <div className="hidden items-center gap-2 lg:flex">
        <select
          value={filters.college ?? ''}
          aria-label="단과대"
          onChange={(event) =>
            onChange({
              ...filters,
              college: event.target.value === '' ? undefined : (event.target.value as College),
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

        {hasAnyFilter && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="btn btn-ghost btn-sm ml-auto"
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* 모바일 초기화 — 필터가 하나라도 걸린 경우에만 */}
      {hasAnyFilter && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="btn btn-ghost btn-sm lg:hidden"
        >
          필터 초기화
        </button>
      )}

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

`ApplicantsSearchInput.tsx` 의 className 을 콘솔 토큰과 전폭 대응으로 바꾼다(로직·디바운스는 그대로):

```tsx
    className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-3 focus:border-sage focus:outline-none lg:max-w-xs"
```

- [ ] **Step 6: 통과 확인**

Run: `cd frontend/apps/web && pnpm exec vitest run test/manage/applicants/applicants-filter-bar.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 7: 커밋**

```bash
git add frontend/apps/web/app/manage frontend/apps/web/test/manage/applicants/applicants-filter-bar.test.tsx
git commit -m "feat(frontend): 지원자 검색·필터 리디자인 — 상태 칩 상시 노출·보조 필터 모바일 시트"
```

---

### Task 6: 전체 선택 바 + 페이지 조립

**Files:**
- Create: `.../applicants/_components/SelectAllBar.tsx`
- Modify: `.../applicants/page.tsx`
- Modify: `.../applicants/_components/BulkActionBar.tsx` (콘솔 토큰 재도색만)
- Test: `frontend/apps/web/test/manage/applicants/select-all-bar.test.tsx`

**Interfaces:**
- Consumes: Task 1 의 `selectableIds` / `selectAllState` / `toggleSelectAll`, Task 2·3 의 컴포넌트, Task 5 의 `ApplicantsFilterBar`
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
    const checkbox = screen.getByRole('checkbox', { name: '전체 선택' });
    expect((checkbox as HTMLInputElement).indeterminate).toBe(true);
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
 * "전체" 는 현재 필터 결과 중 선택 가능한 지원자 전원이며, 최종 상태는 제외된다.
 * 체크하기 전에 몇 명이 대상인지 먼저 알려준다 — 34명을 눌렀는데 14명만 선택되면 놀란다.
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

- [ ] **Step 5: 페이지 조립**

`page.tsx` 를 다음 원칙으로 수정한다.

1. 컨테이너를 `max-w-5xl px-6 py-10` → `max-w-6xl px-4 pb-10 pt-6 sm:px-6 sm:pb-10 sm:pt-10` 로 바꿔 회원 관리와 통일한다. 선택 시 하단 여백(`pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pb-24`) 규칙은 유지한다.
2. `useRecruitmentStatsSummaryQuery` 를 붙인다:

```tsx
import { useRecruitmentStatsSummaryQuery } from '@duing/hooks';
...
const { data: statsSummary } = useRecruitmentStatsSummaryQuery(
  recruitment?.applicationMode === 'SELF' && !isNaN(recruitmentId) ? recruitmentId : undefined,
);
```

3. 선택 상태 헬퍼를 만든다:

```tsx
const selectable = useMemo(() => selectableIds(applicants), [applicants]);
const allState = useMemo(() => selectAllState(selectedSet, selectable), [selectedSet, selectable]);

const toggleOne = useCallback((applicationId: number) => {
  setSelectedIds((current) =>
    current.includes(applicationId)
      ? current.filter((id) => id !== applicationId)
      : [...current, applicationId],
  );
}, []);

const toggleAll = useCallback(() => {
  setSelectedIds(toggleSelectAll(selectable, allState));
}, [selectable, allState]);
```

4. **필터가 바뀌면 선택을 비운다.** "선택 = 지금 보이는 것" 을 지키기 위해서다 — 안 지우면 화면에서 사라진 지원자가 일괄 처리에 딸려간다.

```tsx
  const updateFilters = useCallback(
    (nextFilters: ApplicantsFilters) => {
      const nextParams = new URLSearchParams();
      if (nextFilters.status) nextParams.set('status', nextFilters.status);
      if (nextFilters.college) nextParams.set('college', nextFilters.college);
      if (nextFilters.q) nextParams.set('q', nextFilters.q);
      if (nextFilters.submittedFrom) nextParams.set('submittedFrom', nextFilters.submittedFrom);
      if (nextFilters.submittedTo) nextParams.set('submittedTo', nextFilters.submittedTo);
      // 목록이 바뀌면 선택도 비운다 — 화면에서 사라진 지원자가 일괄 처리에 딸려가면 안 된다.
      setSelectedIds([]);
      router.replace(`?${nextParams.toString()}`);
    },
    [router],
  );
```

5. 상세 이동 콜백을 페이지로 올린다. 기존 `navigateToDetail` 을 `ApplicantTable` 에서 그대로 옮겨온다 — **현재 쿼리스트링을 붙이는 규칙을 바꾸지 않는다.** 상세의 이전/다음 탐색이 같은 필터 결과 안에서 움직이는 근거가 이 쿼리스트링이다.

```tsx
  const openDetail = useCallback(
    (applicationId: number) => {
      const currentQs = searchParams.toString();
      const base = `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${applicationId}`;
      router.push(toRoute(currentQs ? `${base}?${currentQs}` : base));
    },
    [router, searchParams, clubId, recruitmentId],
  );
```

6. 렌더 순서: 헤더 → (마감 배너) → `ApplicantsFilterBar` → (일괄 결과·오류) → `SelectAllBar` → `ApplicantCardList` + `ApplicantTable` → `BulkActionBar`.

7. **빈 상태·로딩 분기는 그대로 둔다** — `isApplicantsLoading` 일 때 `LoadingGate`, 0건일 때 `hasActiveFilters` 에 따라 `검색 결과 없음` / `지원자가 아직 없습니다`. 다만 목록이 0건이면 `SelectAllBar` 도 렌더하지 않는다.

- [ ] **Step 6: `BulkActionBar` 재도색**

버튼·텍스트 색만 콘솔 토큰으로 바꾼다. 액션 구성·`finalizeOnly` 분기·`useInterview` 분기는 **건드리지 않는다**. `text-slate-700` → `text-charcoal-2`, `text-slate-900` → `text-ink-deep`, 합격 버튼 `bg-emerald-600` 유지(상태색), 나머지 테두리 `border-line`.

- [ ] **Step 7: 전체 테스트·타입·린트·빌드**

```bash
cd frontend/apps/web && pnpm exec vitest run test/manage
cd frontend && pnpm typecheck
cd frontend && pnpm lint
cd frontend && NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 AUTH_HINT_SECRET=build-only pnpm build
```
Expected: 전부 통과. 빌드 출력에 `Compiled successfully` 확인.

- [ ] **Step 8: 커밋**

```bash
git add frontend/apps/web/app/manage frontend/apps/web/test/manage/applicants
git commit -m "feat(frontend): 지원자 전체 선택 도입·목록 페이지 조립 — 필터 변경 시 선택 초기화"
```

---

### Task 7: 실브라우저 검증

jsdom 은 레이아웃이 없어 44px·2줄 기하·열 숨김·가로 overflow 를 검증하지 못한다. 실제 브라우저로 실측하고 결과를 보고에 남긴다.

**Files:**
- Create(임시): `frontend/apps/web/app/qa-applicants/page.tsx` — 검증 후 **반드시 삭제**
- Create(임시): `frontend/apps/web/.env.local` — 검증 후 **반드시 삭제**

- [ ] **Step 1: QA 하네스 준비**

`.env.local` 에 `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1` 와 `AUTH_HINT_SECRET=local-qa-only` 를 넣는다. 백엔드가 없어도 되도록, QA 페이지는 고정 fixture 로 `ApplicantsFilterBar` + `SelectAllBar` + `ApplicantCardList` + `ApplicantTable` 을 직접 조립한다(최종 상태 1명·선택 가능 2명·긴 학과명 1명 포함).

- [ ] **Step 2: 개발 서버 기동**

```bash
cd frontend/apps/web && (pnpm dev > /tmp/dev.log 2>&1 &) ; sleep 14; grep -m2 -E "Local:|Ready" /tmp/dev.log
```
로그에서 포트가 3000 인지 확인한다. 좀비 프로세스가 3000 을 잡고 있으면 `next dev` 부모 → `next-server` 워커 → 포트 순으로 정리한다.

- [ ] **Step 3: 오터치 실측 (320 / 360 / 390 / 414)**

각 폭에서 Playwright 좌표 클릭으로 다음 4가지를 확인한다. **`locator.click()` 은 쓰지 않는다** — 라벨의 연결 컨트롤이 disabled 면 actionability 검사에서 타임아웃 나는 도구 특성이 있어 오판을 부른다. `page.mouse.click(x, y)` 를 쓴다.

| 대상 | 탭 위치 | 기대 |
|---|---|---|
| 선택 가능 | 체크박스 중심에서 10px·18px 빗나간 지점 | 선택만, 상세 이동 0 |
| 선택 가능 | 카드 본문 | 상세 진입 |
| 최종 상태 | 체크박스 정중앙 | 상세 진입 |
| 최종 상태 | 44px 자리 모서리 | 상세 진입 |

첫 로드 직후 클릭은 하이드레이션 전이라 무반응일 수 있다 — `waitForTimeout(900)` 이상 준 뒤 클릭한다.

- [ ] **Step 4: 뷰포트별 레이아웃 실측**

320 / 360 / 375 / 390 / 414 / 768 / 1024 / 1280 / 1440 / 1920 에서 측정한다.
- 카드 높이, 히트 영역 크기, 가로 overflow(`documentElement.scrollWidth > innerWidth`)
- 잘린 텍스트(`scrollWidth > clientWidth + 1` 인 리프 노드) — 이름이 잘리면 레이아웃을 먼저 손본다
- 1024 에서 단과대·학번 열이 숨겨졌는지, 1280 에서 노출되는지
- 상태 칩이 한 줄 가로 스크롤인지(줄바꿈 금지), 칩 행 높이가 두 줄이 되지 않는지

- [ ] **Step 5: 기능 회귀 확인**

검색 입력 → 목록 갱신, 상태 칩 → 필터 반영, 시트에서 단과대·기간 적용, 전체 선택 → 최종 상태 제외 확인, 다중 선택 후 일괄 바 노출.

- [ ] **Step 6: 정리**

```bash
rm -rf frontend/apps/web/app/qa-applicants frontend/apps/web/.env.local
pkill -f "next-server"; pkill -f "next dev"
```
`git status` 로 임시 파일이 남지 않았는지 확인한다.

- [ ] **Step 7: 실측 결과를 최종 보고에 정리**

설계 문서 §10 의 검증 항목을 표로 채운다. 카드 높이 최종 수치와 한 화면에 보이는 지원자 수를 함께 적는다.

---

## 실행 순서 메모

Task 1 → 2 → 3 은 순차 의존(공용 모듈 → 카드 → 표). Task 4 는 1~3 과 독립이라 병행 가능하지만, Task 5 는 Task 4 를 소비한다. Task 6 은 2·3·5 를 모두 소비하므로 마지막이고, Task 7 은 6 이후에만 의미가 있다.

PR #939 가 아직 develop 에 머지되지 않았다면 이 작업은 그 브랜치 위에 쌓인다 — 스택 PR 이 되므로 base 브랜치를 `#939` 브랜치로 두고, 머지 후 base 를 `develop` 으로 재지정한다.

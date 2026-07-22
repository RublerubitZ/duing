# 모집 관리(Recruit Management) 리디자인 Implementation Plan — 하이브리드 확정안

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/manage/clubs/[clubId]/recruitments` (사이드바 라벨 "모집 관리") 화면을 "KPI 4타일 → 현재 모집 카드(라이트) / Empty State → 지난 모집 테이블" 구조로 리디자인하고, "양식 복제" 기능을 신규 구현한다.

**Architecture:** 기존 `useClubRecruitmentsQuery` 응답을 `page.tsx`에서 활성(비CLOSED, 정책상 최대 1건)/지난(CLOSED)으로 분리한다. KPI 4타일(`RecruitmentKpiRow`)은 **stats summary 단독**(지원자·검토 대기·면접 대기·합격)으로 구성해 활성 모집이 있을 때만 렌더하고, 현재 모집 카드(`CurrentRecruitmentCard`)는 통계 의존이 없는 프레젠테이션+액션 컴포넌트(제목=상세 링크, 조건부 면접 관리 버튼, 마감 뮤테이션만)로 만든다. 지난 모집 테이블은 라우트 로컬 `useQueries` fan-out으로 행별 지원/합격을 표시한다. 양식 복제는 별도 Clone API 없이 상세 조회(`useRecruitmentDetailQuery`) + 생성(`useCreateRecruitmentMutation`)을 재사용하고, `RecruitmentForm` create 모드에 `cloneSeed` prop을 추가해 시드한다.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query(useQueries combine 포함), Zod(`@duing/schemas`), Vitest + Testing Library + MSW.

## Global Constraints

- OPEN/CLOSED 탭 UI는 완전히 제거한다(KPI → 현재 모집 → 지난 모집 고정 구조).
- 백엔드 상태는 `OPEN`/`CLOSED` 2종이고 활성(OPEN) 모집은 클럽당 최대 1건이 DB 부분 유니크 인덱스(V38)로 강제된다 — 화면의 비CLOSED(`displayStatus !== 'CLOSED'`) 모집은 구조적으로 최대 1건이며 `find()` 사용이 안전하다.
- 화면 표시는 `UPCOMING`/`OPEN`/`ALWAYS_OPEN`/`CLOSED` 4종 파생 상태(`RecruitmentDisplayStatus`)와 기존 라벨·뱃지 맵(`dashboard-labels.ts`)을 그대로 재사용한다.
- KPI 4타일은 **`useRecruitmentStatsSummaryQuery` 단독**으로 만든다(daily/funnel 쿼리 금지). 구성: 지원자(total, 부제 "정원 N명") · 검토 대기(underReview) · 면접 대기(interviewPending, `useInterview=false`면 "—") · 합격(accepted). 활성 모집이 없으면 KPI Row 자체를 렌더하지 않는다.
- 현재 모집 카드는 라이트 `.card` + 좌측 sage 액센트(`border-l-4 border-l-sage`)를 쓴다. 다크 카드·`tone` prop 금지. 제목은 상세 페이지 링크다(기존 기능 진입점 보존). 버튼 순서: 지원자 관리(primary) → 면접 관리(`useInterview=true`일 때만) → 통계, 보조 텍스트 액션: 모집글 편집 · 모집 종료.
- 카드에는 통계 수치를 표시하지 않는다 — 숫자는 KPI Row 전담(같은 화면 중복 표시 금지).
- 기존 기능(생성/수정/마감/삭제(CLOSED+지원자 0명, 상세 페이지)/통계/면접 관리 진입점/공고 원문 확인)은 어떤 것도 제거하지 않는다.
- 양식 복제는 원본 모집을 절대 변경하지 않고, 새 작성 화면을 기존 값으로 채워 연다. 기간 필드(시작일/종료일/면접 일정/상시모집 여부)는 의도적으로 시드하지 않는다. 별도 Clone API를 추가하지 않는다(생성 시 질문 id는 서버가 무시하고 새로 발급 — `QuestionItemPayload` 스펙 §2.2 — 이므로 id 스트립 불필요).
- 타입은 `type`만 사용(`interface` 금지), `any`/`as` 금지, 서버 상태는 TanStack Query로만 관리.
- 새로 만드는 파일은 `@/` alias를 사용한다. 파일 전체를 새로 쓰는 경우(`page.tsx`, `new/page.tsx`)도 `@/`로 통일한다.
- 커밋 메시지는 Conventional Commits 한국어(`feat(frontend): ...`), attribution 라인 금지.

## Out of Scope

- 상세(`[recruitmentId]/page.tsx`)/생성/수정 페이지의 slate→duing 토큰 마이그레이션 (후속 PR)
- `replace-active` API를 활용한 "마감하고 바로 새 모집" 원클릭 교체 (후속)
- funnel/daily 기반 지표(서류 합격·오늘 지원 등) — summary 단독 구성으로 확정
- 지난 모집 전용 페이지네이션 API — 현재 비페이지네이션 목록 재사용(클럽당 연 1~2회 수준)
- 상세 페이지의 삭제·면접 관리 진입점 변경 — 그대로 유지, 카드 제목 링크로 접근

---

### Task 1: `DDayBadge` 공용 컴포넌트로 추출 (무수정 이동)

**Files:**
- Create: `apps/web/app/manage/_components/DDayBadge.tsx`
- Modify: `apps/web/app/manage/_components/dashboard/ActiveRecruitmentsCard.tsx`
- Test: `apps/web/test/manage/ActiveRecruitmentsCard.test.tsx` (기존 테스트가 회귀 가드 — 새 테스트 추가 없음)

**Interfaces:**
- Produces: `DDayBadge({ recruitment: RecruitmentSummary, now: Date })` — Task 4(`CurrentRecruitmentCard`)가 소비한다. 라이트 카드만 쓰므로 tone prop 없음(로직 100% 무수정 이동).

- [ ] **Step 1: `ActiveRecruitmentsCard.tsx`의 `DDayBadge`를 그대로 옮겨 공용 파일 생성**

`apps/web/app/manage/_components/DDayBadge.tsx`:

```tsx
'use client';

import type { RecruitmentSummary } from '@duing/types';
import { CLOSING_SOON_DAYS, daysUntilKst } from '@duing/hooks';

/** 마감일 D-day 뱃지 — 임박(D-0~D-3)은 coral pill 강조, 그 외는 muted 텍스트. 상시모집·마감·경과는 미표시 */
export function DDayBadge({ recruitment, now }: { recruitment: RecruitmentSummary; now: Date }) {
  if (recruitment.displayStatus === 'CLOSED' || recruitment.displayStatus === 'ALWAYS_OPEN') return null;
  if (!recruitment.endDate) return null;
  const daysLeft = daysUntilKst(recruitment.endDate, now);
  if (daysLeft < 0) return null;
  const label = daysLeft === 0 ? 'D-day' : `D-${daysLeft}`;
  if (daysLeft <= CLOSING_SOON_DAYS) {
    return <span className="pill pill-coral ml-2 shrink-0">{label}</span>;
  }
  return <span className="ml-2 shrink-0 text-xs text-charcoal-3">{label}</span>;
}
```

- [ ] **Step 2: `ActiveRecruitmentsCard.tsx`에서 로컬 정의 제거하고 공용 컴포넌트 import**

파일 상단(1~21행: import 블록 + 로컬 `DDayBadge` 함수 정의)을 아래로 교체한다. 이후 내용(`export function ActiveRecruitmentsCard` 부터)은 그대로 유지:

```tsx
'use client';

import Link from 'next/link';
import { useActiveRecruitments } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';
import { DDayBadge } from '@/app/manage/_components/DDayBadge';
import { RECRUITMENT_DISPLAY_STATUS_BADGE, RECRUITMENT_DISPLAY_STATUS_LABEL } from './dashboard-labels';
```

(`RecruitmentSummary`/`CLOSING_SOON_DAYS`/`daysUntilKst` import와 로컬 `DDayBadge` 함수는 삭제. JSX의 `<DDayBadge recruitment={recruitment} now={now} />` 호출부는 수정하지 않는다.)

- [ ] **Step 3: 회귀 테스트 실행**

Run: `pnpm --filter @duing/web test -- run test/manage/ActiveRecruitmentsCard.test.tsx`
Expected: PASS (특히 `pill-coral`/`text-charcoal-3` 클래스 검증이 그대로 통과해야 추출이 안전했음을 확인)

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/manage/_components/DDayBadge.tsx apps/web/app/manage/_components/dashboard/ActiveRecruitmentsCard.tsx
git commit -m "refactor(frontend): DDayBadge를 공용 컴포넌트로 추출"
```

---

### Task 2: 전형 흐름 라벨 헬퍼

**Files:**
- Create: `apps/web/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentFlowLabel.ts`
- Test: `apps/web/test/manage/recruitments/recruitmentFlowLabel.test.ts`

**Interfaces:**
- Produces: `recruitmentStageLabels(useInterview: boolean): string[]`, `recruitmentFlowLabel(useInterview: boolean): string` — Task 4(`CurrentRecruitmentCard`)와 Task 5(`PastRecruitmentsTable`)가 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/test/manage/recruitments/recruitmentFlowLabel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  recruitmentFlowLabel,
  recruitmentStageLabels,
} from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentFlowLabel';

describe('recruitmentStageLabels / recruitmentFlowLabel', () => {
  it('면접을 진행하면 서류 → 면접 → 최종 3단계다', () => {
    expect(recruitmentStageLabels(true)).toEqual(['서류', '면접', '최종']);
    expect(recruitmentFlowLabel(true)).toBe('서류 → 면접 → 최종');
  });

  it('면접이 없으면 서류 → 최종 2단계다', () => {
    expect(recruitmentStageLabels(false)).toEqual(['서류', '최종']);
    expect(recruitmentFlowLabel(false)).toBe('서류 → 최종');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/recruitmentFlowLabel.test.ts`
Expected: FAIL — Cannot find module '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentFlowLabel'

- [ ] **Step 3: 구현**

`apps/web/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentFlowLabel.ts`:

```ts
export function recruitmentStageLabels(useInterview: boolean): string[] {
  return useInterview ? ['서류', '면접', '최종'] : ['서류', '최종'];
}

export function recruitmentFlowLabel(useInterview: boolean): string {
  return recruitmentStageLabels(useInterview).join(' → ');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/recruitmentFlowLabel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/_lib/recruitmentFlowLabel.ts apps/web/test/manage/recruitments/recruitmentFlowLabel.test.ts
git commit -m "feat(frontend): 전형 흐름 라벨 헬퍼 추가"
```

---

### Task 3: `RecruitmentKpiRow` — summary 단독 4타일

**Files:**
- Create: `apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentKpiRow.tsx`
- Test: `apps/web/test/manage/recruitments/RecruitmentKpiRow.test.tsx`

**Interfaces:**
- Consumes: `useRecruitmentStatsSummaryQuery` (`@duing/hooks`, 기존).
- Produces: `RecruitmentKpiRow({ recruitment: RecruitmentSummary })` — Task 6(`page.tsx`)이 활성 모집이 있을 때만 렌더한다(무활성 시 미렌더는 page 책임 — 이 컴포넌트는 non-null 모집을 받는다).

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/test/manage/recruitments/RecruitmentKpiRow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RecruitmentSummary, StatsSummary } from '@duing/types';

const mockSummary = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actualHooks = await importOriginal<typeof import('@duing/hooks')>();
  return {
    ...actualHooks,
    useRecruitmentStatsSummaryQuery: (recruitmentId: number | undefined) => mockSummary(recruitmentId),
  };
});

import { RecruitmentKpiRow } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentKpiRow';

function recruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
    id: 1,
    clubId: 1,
    clubName: '두잉',
    title: '10기 모집',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    capacity: 20,
    status: 'OPEN',
    displayStatus: 'OPEN',
    effectivelyOpen: true,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview: true,
    targetRole: 'MEMBER',
    ...over,
  };
}

function statsSummary(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    total: 0,
    submitted: 0,
    underReview: 0,
    interviewPending: 0,
    accepted: 0,
    rejected: 0,
    capacity: 20,
    ratio: 0,
    ...over,
  };
}

describe('RecruitmentKpiRow', () => {
  it('4개 타일에 summary 버킷 값(지원자·검토 대기·면접 대기·합격)을 표시한다', () => {
    mockSummary.mockReturnValue({
      data: statsSummary({ total: 34, underReview: 12, interviewPending: 8, accepted: 2 }),
      isLoading: false,
    });
    render(<RecruitmentKpiRow recruitment={recruitment()} />);

    expect(screen.getByText('지원자')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText('정원 20명')).toBeInTheDocument();
    expect(screen.getByText('검토 대기')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('면접 대기')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('합격')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('면접을 진행하지 않는 모집은 데이터가 있어도 면접 대기를 —로 표시한다', () => {
    mockSummary.mockReturnValue({
      data: statsSummary({ total: 5, underReview: 1, interviewPending: 8, accepted: 0 }),
      isLoading: false,
    });
    render(<RecruitmentKpiRow recruitment={recruitment({ useInterview: false })} />);

    expect(screen.queryByText('8')).not.toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('summary 로딩 중이면 4개 값 모두 —로 표시한다 (정원 부제는 유지)', () => {
    mockSummary.mockReturnValue({ data: undefined, isLoading: true });
    render(<RecruitmentKpiRow recruitment={recruitment()} />);

    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.getByText('정원 20명')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/RecruitmentKpiRow.test.tsx`
Expected: FAIL — Cannot find module '.../RecruitmentKpiRow'

- [ ] **Step 3: 구현**

`apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentKpiRow.tsx`:

```tsx
'use client';

import type { RecruitmentSummary } from '@duing/types';
import { useRecruitmentStatsSummaryQuery } from '@duing/hooks';

type Props = {
  recruitment: RecruitmentSummary;
};

type KpiTileProps = {
  label: string;
  value: string;
  sub?: string;
};

function KpiTile({ label, value, sub }: KpiTileProps) {
  return (
    <div className="card p-4">
      <div className="text-xs text-charcoal-3">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-ink-deep">{value}</div>
      {sub && <div className="mt-1 text-xs text-charcoal-3">{sub}</div>}
    </div>
  );
}

/**
 * 활성 모집 1건의 현황 버킷 4종 — stats summary 단독 구성(추가 쿼리 금지).
 * 4타일이 지원자 관리 화면의 상태 필터와 1:1 대응하므로 "보고 → 처리" 동선이 이어진다.
 */
export function RecruitmentKpiRow({ recruitment }: Props) {
  const { data: summary } = useRecruitmentStatsSummaryQuery(recruitment.id);

  const interviewPendingValue = !recruitment.useInterview
    ? '—'
    : summary
      ? String(summary.interviewPending)
      : '—';

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiTile
        label="지원자"
        value={summary ? String(summary.total) : '—'}
        sub={`정원 ${recruitment.capacity}명`}
      />
      <KpiTile label="검토 대기" value={summary ? String(summary.underReview) : '—'} />
      <KpiTile label="면접 대기" value={interviewPendingValue} />
      <KpiTile label="합격" value={summary ? String(summary.accepted) : '—'} />
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/RecruitmentKpiRow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/_components/RecruitmentKpiRow.tsx apps/web/test/manage/recruitments/RecruitmentKpiRow.test.tsx
git commit -m "feat(frontend): 모집 관리 KPI 4타일(summary 단독) 추가"
```

---

### Task 4: `CurrentRecruitmentCard` + `RecruitmentEmptyState`

**Files:**
- Create: `apps/web/app/manage/clubs/[clubId]/recruitments/_components/CurrentRecruitmentCard.tsx`
- Create: `apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentEmptyState.tsx`
- Test: `apps/web/test/manage/recruitments/CurrentRecruitmentCard.test.tsx`

**Interfaces:**
- Consumes: `DDayBadge` (Task 1), `recruitmentStageLabels` (Task 2), `useCloseRecruitmentMutation` (`@duing/hooks`, 기존), `ConfirmDialog` (`@/app/_components/ConfirmDialog`, 기존 — `confirmLabel` prop 지원), `recruitmentPeriodLabel` (`@/app/_lib/recruitmentDisplay`, 기존), `RECRUITMENT_DISPLAY_STATUS_LABEL`/`_BADGE` (기존).
- Produces: `CurrentRecruitmentCard({ clubId: number, recruitment: RecruitmentSummary })`, `RecruitmentEmptyState({ clubId: number })` — Task 6(`page.tsx`)이 소비한다. 통계 훅 의존 없음(숫자는 KPI Row 전담).

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/test/manage/recruitments/CurrentRecruitmentCard.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RecruitmentSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

const mockCloseMutateAsync = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actualHooks = await importOriginal<typeof import('@duing/hooks')>();
  return {
    ...actualHooks,
    useCloseRecruitmentMutation: () => ({ mutateAsync: mockCloseMutateAsync, isPending: false }),
  };
});

import { CurrentRecruitmentCard } from '@/app/manage/clubs/[clubId]/recruitments/_components/CurrentRecruitmentCard';
import { RecruitmentEmptyState } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentEmptyState';

function recruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
    id: 42,
    clubId: 1,
    clubName: '두잉',
    title: '10기 신입 모집',
    startDate: '2026-09-15',
    endDate: '2026-09-27',
    capacity: 20,
    status: 'OPEN',
    displayStatus: 'OPEN',
    effectivelyOpen: true,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview: true,
    targetRole: 'MEMBER',
    ...over,
  };
}

describe('CurrentRecruitmentCard', () => {
  it('제목은 상세 페이지 링크이고, 뱃지·기간·전형 단계를 렌더한다', () => {
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment()} />);

    expect(screen.getByRole('link', { name: '10기 신입 모집' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/42',
    );
    expect(screen.getByText('모집중')).toBeInTheDocument();
    expect(screen.getByText('2026-09-15 ~ 2026-09-27')).toBeInTheDocument();
    expect(screen.getByText('1. 서류')).toBeInTheDocument();
    expect(screen.getByText('2. 면접')).toBeInTheDocument();
    expect(screen.getByText('3. 최종')).toBeInTheDocument();
  });

  it('링크 순서: 제목 → 지원자 관리 → 면접 관리 → 통계 → 모집글 편집, 모집 종료는 버튼이다', () => {
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment()} />);

    const linkTexts = screen.getAllByRole('link').map((el) => el.textContent);
    expect(linkTexts).toEqual(['10기 신입 모집', '지원자 관리', '면접 관리', '통계', '모집글 편집']);
    expect(screen.getByRole('link', { name: '지원자 관리' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/42/applicants',
    );
    expect(screen.getByRole('link', { name: '면접 관리' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/42/interview',
    );
    expect(screen.getByRole('link', { name: '통계' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/42/stats',
    );
    expect(screen.getByRole('link', { name: '모집글 편집' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/42/edit',
    );
    expect(screen.getByRole('button', { name: '모집 종료' })).toBeInTheDocument();
  });

  it('면접 미사용 모집은 면접 관리 링크와 면접 단계를 숨긴다', () => {
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment({ useInterview: false })} />);

    expect(screen.queryByRole('link', { name: '면접 관리' })).not.toBeInTheDocument();
    expect(screen.getByText('1. 서류')).toBeInTheDocument();
    expect(screen.getByText('2. 최종')).toBeInTheDocument();
    expect(screen.queryByText(/면접/)).not.toBeInTheDocument();
  });

  it('모집 종료 버튼 → 확인 모달 → 마감 클릭 시 마감 뮤테이션을 호출한다', async () => {
    mockCloseMutateAsync.mockResolvedValue(undefined);
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment()} />);

    fireEvent.click(screen.getByRole('button', { name: '모집 종료' }));
    expect(screen.getByText('모집을 마감할까요?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '마감' }));
    await waitFor(() => expect(mockCloseMutateAsync).toHaveBeenCalled());
  });
});

describe('RecruitmentEmptyState', () => {
  it('안내 문구와 새 모집 만들기 CTA를 렌더한다', () => {
    render(<RecruitmentEmptyState clubId={1} />);
    expect(screen.getByText('진행 중인 모집이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /새 모집 만들기/ })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/new',
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/CurrentRecruitmentCard.test.tsx`
Expected: FAIL — Cannot find module '.../CurrentRecruitmentCard'

- [ ] **Step 3: `RecruitmentEmptyState` 구현**

`apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentEmptyState.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';

type Props = {
  clubId: number;
};

export function RecruitmentEmptyState({ clubId }: Props) {
  return (
    <div className="rounded-[20px] border border-dashed border-line bg-paper px-6 py-10 text-center">
      <p className="text-3xl">📥</p>
      <p className="mt-3 text-[15.5px] font-bold text-ink-deep">진행 중인 모집이 없어요</p>
      <p className="mt-1.5 text-sm leading-relaxed text-charcoal-3">
        모집은 한 번에 하나씩만 진행할 수 있어요.
        <br />
        새 모집을 만들어 지원을 받아보세요.
      </p>
      <Link href={toRoute(`/manage/clubs/${clubId}/recruitments/new`)} className="btn btn-primary mt-5 inline-flex">
        <span className="mr-1 text-base leading-none">＋</span>새 모집 만들기
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: `CurrentRecruitmentCard` 구현**

`apps/web/app/manage/clubs/[clubId]/recruitments/_components/CurrentRecruitmentCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { RecruitmentSummary } from '@duing/types';
import { useCloseRecruitmentMutation } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { recruitmentPeriodLabel } from '@/app/_lib/recruitmentDisplay';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { DDayBadge } from '@/app/manage/_components/DDayBadge';
import {
  RECRUITMENT_DISPLAY_STATUS_BADGE,
  RECRUITMENT_DISPLAY_STATUS_LABEL,
} from '@/app/manage/_components/dashboard/dashboard-labels';
import { recruitmentStageLabels } from '../_lib/recruitmentFlowLabel';

type Props = {
  clubId: number;
  recruitment: RecruitmentSummary;
};

/**
 * 활성 모집 1건의 정체성·액션 허브. 통계 수치는 표시하지 않는다(바로 위 KPI Row 전담).
 * 제목이 상세 페이지 링크다 — 공고 원문·질문 확인, (마감 후) 삭제 등 기존 진입점 보존.
 */
export function CurrentRecruitmentCard({ clubId, recruitment }: Props) {
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const closeRecruitment = useCloseRecruitmentMutation(recruitment.id);

  const now = new Date();
  const stageLabels = recruitmentStageLabels(recruitment.useInterview);
  const recruitmentBasePath = `/manage/clubs/${clubId}/recruitments/${recruitment.id}`;

  async function handleClose() {
    setCloseError(null);
    try {
      await closeRecruitment.mutateAsync();
      setShowCloseConfirm(false);
    } catch (closeFailure) {
      setShowCloseConfirm(false);
      setCloseError(closeFailure instanceof Error ? closeFailure.message : '마감 처리에 실패했습니다.');
    }
  }

  return (
    <div className="card border-l-4 border-l-sage p-6">
      <div className="flex flex-wrap items-center gap-1">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RECRUITMENT_DISPLAY_STATUS_BADGE[recruitment.displayStatus]}`}
        >
          {RECRUITMENT_DISPLAY_STATUS_LABEL[recruitment.displayStatus]}
        </span>
        <DDayBadge recruitment={recruitment} now={now} />
        <span className="ml-2 text-xs text-charcoal-3">
          {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
        </span>
      </div>

      <h2 className="mt-2">
        <Link href={toRoute(recruitmentBasePath)} className="text-xl font-bold text-ink-deep hover:underline">
          {recruitment.title}
        </Link>
      </h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {stageLabels.map((stage, index) => (
          <span key={stage} className="rounded-full bg-sage-tint px-3 py-1.5 text-xs font-semibold text-charcoal-2">
            {index + 1}. {stage}
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href={toRoute(`${recruitmentBasePath}/applicants`)} className="btn btn-primary btn-sm">
          지원자 관리
        </Link>
        {recruitment.useInterview && (
          <Link href={toRoute(`${recruitmentBasePath}/interview`)} className="btn btn-secondary btn-sm">
            면접 관리
          </Link>
        )}
        <Link href={toRoute(`${recruitmentBasePath}/stats`)} className="btn btn-secondary btn-sm">
          통계
        </Link>
        <span className="ml-auto flex items-center gap-3 text-sm">
          <Link href={toRoute(`${recruitmentBasePath}/edit`)} className="text-charcoal-3 hover:text-charcoal hover:underline">
            모집글 편집
          </Link>
          <button
            type="button"
            onClick={() => setShowCloseConfirm(true)}
            className="text-charcoal-3 hover:text-coral hover:underline"
          >
            모집 종료
          </button>
        </span>
      </div>

      {closeError && <p className="mt-3 text-sm text-coral">{closeError}</p>}

      <ConfirmDialog
        open={showCloseConfirm}
        title="모집을 마감할까요?"
        description="마감 후에는 지원서를 더 이상 받을 수 없으며, 되돌릴 수 없습니다."
        confirmLabel="마감"
        isPending={closeRecruitment.isPending}
        onConfirm={handleClose}
        onCancel={() => {
          setShowCloseConfirm(false);
          setCloseError(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/CurrentRecruitmentCard.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/_components/CurrentRecruitmentCard.tsx apps/web/app/manage/clubs/'[clubId]'/recruitments/_components/RecruitmentEmptyState.tsx apps/web/test/manage/recruitments/CurrentRecruitmentCard.test.tsx
git commit -m "feat(frontend): 현재 모집 카드·Empty State 추가"
```

---

### Task 5: `PastRecruitmentsTable`

**Files:**
- Create: `apps/web/app/manage/clubs/[clubId]/recruitments/_components/PastRecruitmentsTable.tsx`
- Test: `apps/web/test/manage/recruitments/PastRecruitmentsTable.test.tsx`

**Interfaces:**
- Consumes: `recruitmentFlowLabel` (Task 2), `recruitmentPeriodLabel`/`RECRUITMENT_DISPLAY_STATUS_LABEL`/`_BADGE`(기존), `useApiClient`/`statsQueryKeys` (`@duing/hooks`, 기존 export), `useQueries` (`@tanstack/react-query`).
- Produces: `PastRecruitmentsTable({ clubId: number, recruitments: RecruitmentSummary[] })` — Task 6이 소비한다. 행별 summary fan-out은 이 컴포넌트에 인라인(단일 소비처라 packages 승격 금지 — 레포 규칙).

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/test/manage/recruitments/PastRecruitmentsTable.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

import { PastRecruitmentsTable } from '@/app/manage/clubs/[clubId]/recruitments/_components/PastRecruitmentsTable';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function summaryResponse(overrides: Partial<{ total: number; accepted: number }> = {}) {
  return {
    ok: true,
    message: null,
    data: {
      total: 0,
      submitted: 0,
      underReview: 0,
      interviewPending: 0,
      accepted: 0,
      rejected: 0,
      capacity: 18,
      ratio: 0,
      ...overrides,
    },
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderTable(recruitments: RecruitmentSummary[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }
  return render(<PastRecruitmentsTable clubId={1} recruitments={recruitments} />, { wrapper: Wrapper });
}

function closedRecruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
    id: 9,
    clubId: 1,
    clubName: '두잉',
    title: '9기 신입 모집',
    startDate: '2025-09-10',
    endDate: '2025-09-24',
    capacity: 18,
    status: 'CLOSED',
    displayStatus: 'CLOSED',
    effectivelyOpen: false,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview: true,
    targetRole: 'MEMBER',
    ...over,
  };
}

describe('PastRecruitmentsTable', () => {
  it('지난 모집이 없으면 빈 상태 문구를 표시한다', () => {
    renderTable([]);
    expect(screen.getByText('아직 마감된 모집이 없어요.')).toBeInTheDocument();
  });

  it('행마다 지원/합격·상태·제목(상세 링크)·결과 보기/양식 복제 링크를 렌더한다', async () => {
    server.use(
      http.get('*/leader/recruitments/9/stats/summary', () =>
        HttpResponse.json(summaryResponse({ total: 41, accepted: 18 })),
      ),
    );
    renderTable([closedRecruitment()]);

    expect((await screen.findAllByText('41 / 18')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('마감').length).toBeGreaterThan(0);

    const titleLinks = screen.getAllByRole('link', { name: '9기 신입 모집' });
    expect(titleLinks[0]).toHaveAttribute('href', '/manage/clubs/1/recruitments/9');

    const resultLinks = screen.getAllByRole('link', { name: '결과 보기' });
    expect(resultLinks[0]).toHaveAttribute('href', '/manage/clubs/1/recruitments/9/stats');

    const cloneLinks = screen.getAllByRole('link', { name: '양식 복제' });
    expect(cloneLinks[0]).toHaveAttribute('href', '/manage/clubs/1/recruitments/new?cloneFrom=9');
  });

  it('summary 조회에 실패한 행은 지원/합격을 —로 표시한다', async () => {
    server.use(
      http.get('*/leader/recruitments/9/stats/summary', () =>
        HttpResponse.json(summaryResponse({ total: 41, accepted: 18 })),
      ),
      http.get('*/leader/recruitments/8/stats/summary', () =>
        HttpResponse.json({ ok: false, message: '오류', data: null }, { status: 500 }),
      ),
    );
    renderTable([closedRecruitment(), closedRecruitment({ id: 8, title: '8기 신입 모집' })]);

    expect((await screen.findAllByText('41 / 18')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/PastRecruitmentsTable.test.tsx`
Expected: FAIL — Cannot find module '.../PastRecruitmentsTable'

- [ ] **Step 3: 구현**

`apps/web/app/manage/clubs/[clubId]/recruitments/_components/PastRecruitmentsTable.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import type { RecruitmentSummary, StatsSummary } from '@duing/types';
import { statsQueryKeys, useApiClient } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { recruitmentPeriodLabel } from '@/app/_lib/recruitmentDisplay';
import {
  RECRUITMENT_DISPLAY_STATUS_BADGE,
  RECRUITMENT_DISPLAY_STATUS_LABEL,
} from '@/app/manage/_components/dashboard/dashboard-labels';
import { recruitmentFlowLabel } from '../_lib/recruitmentFlowLabel';

type Props = {
  clubId: number;
  recruitments: RecruitmentSummary[];
};

export function PastRecruitmentsTable({ clubId, recruitments }: Props) {
  const client = useApiClient();
  // 행별 지원/합격 집계 — 단일 소비처라 라우트 로컬 fan-out(대시보드 useApplicantSummary와 동일 패턴,
  // statsQueryKeys.summary 공유로 대시보드·상세·통계와 캐시 일치). 지난 모집은 클럽당 연 1~2건 수준.
  const summariesById = useQueries({
    queries: recruitments.map((recruitment) => ({
      queryKey: statsQueryKeys.summary(recruitment.id),
      queryFn: () => client.stats.summary(recruitment.id),
    })),
    combine: (results) => {
      const byId = new Map<number, StatsSummary>();
      results.forEach((result, index) => {
        const recruitment = recruitments[index];
        if (recruitment !== undefined && result.data !== undefined) {
          byId.set(recruitment.id, result.data);
        }
      });
      return byId;
    },
  });

  if (recruitments.length === 0) {
    return (
      <p className="rounded-md bg-graysoft py-6 text-center text-sm text-charcoal-3">
        아직 마감된 모집이 없어요.
      </p>
    );
  }

  function appliedAcceptedLabel(recruitmentId: number): string {
    const summary = summariesById.get(recruitmentId);
    return summary ? `${summary.total} / ${summary.accepted}` : '—';
  }

  return (
    <div className="card overflow-hidden">
      {/* 데스크탑: 표 */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-charcoal-2">모집</th>
              <th className="px-4 py-3 font-medium text-charcoal-2">기간</th>
              <th className="px-4 py-3 font-medium text-charcoal-2">지원 / 합격</th>
              <th className="px-4 py-3 font-medium text-charcoal-2">상태</th>
              <th className="px-4 py-3 text-right font-medium text-charcoal-2">처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {recruitments.map((recruitment) => (
              <tr key={recruitment.id}>
                <td className="px-4 py-3">
                  <Link
                    href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}`)}
                    className="font-medium text-ink-deep hover:underline"
                  >
                    {recruitment.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-charcoal-3">
                    전형 {recruitmentFlowLabel(recruitment.useInterview)}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-charcoal-2">
                  {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
                </td>
                <td className="px-4 py-3 font-mono text-charcoal">{appliedAcceptedLabel(recruitment.id)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${RECRUITMENT_DISPLAY_STATUS_BADGE[recruitment.displayStatus]}`}
                  >
                    {RECRUITMENT_DISPLAY_STATUS_LABEL[recruitment.displayStatus]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}/stats`)}
                      className="btn btn-secondary btn-sm"
                    >
                      결과 보기
                    </Link>
                    <Link
                      href={toRoute(`/manage/clubs/${clubId}/recruitments/new?cloneFrom=${recruitment.id}`)}
                      className="btn btn-ghost btn-sm"
                    >
                      양식 복제
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 리스트 */}
      <div className="divide-y divide-line md:hidden">
        {recruitments.map((recruitment) => (
          <div key={recruitment.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}`)}
                className="font-medium text-ink-deep hover:underline"
              >
                {recruitment.title}
              </Link>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RECRUITMENT_DISPLAY_STATUS_BADGE[recruitment.displayStatus]}`}
              >
                {RECRUITMENT_DISPLAY_STATUS_LABEL[recruitment.displayStatus]}
              </span>
            </div>
            <div className="mt-1 text-xs text-charcoal-3">
              {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)} · 전형{' '}
              {recruitmentFlowLabel(recruitment.useInterview)}
            </div>
            <div className="mt-1 font-mono text-sm text-charcoal">
              지원 {appliedAcceptedLabel(recruitment.id)}
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}/stats`)}
                className="btn btn-secondary btn-sm flex-1"
              >
                결과 보기
              </Link>
              <Link
                href={toRoute(`/manage/clubs/${clubId}/recruitments/new?cloneFrom=${recruitment.id}`)}
                className="btn btn-ghost btn-sm flex-1"
              >
                양식 복제
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/PastRecruitmentsTable.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/_components/PastRecruitmentsTable.tsx apps/web/test/manage/recruitments/PastRecruitmentsTable.test.tsx
git commit -m "feat(frontend): 지난 모집 테이블(결과 보기·양식 복제 진입) 추가"
```

---

### Task 6: `page.tsx` 조립 — 탭 제거, KPI/현재 모집/지난 모집 구조로 전환

**Files:**
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/page.tsx` (전체 재작성)
- Test: `apps/web/test/manage/recruitments/recruitment-list-page.test.tsx`

**Interfaces:**
- Consumes: `RecruitmentKpiRow`(Task 3), `CurrentRecruitmentCard`/`RecruitmentEmptyState`(Task 4), `PastRecruitmentsTable`(Task 5), `useClubRecruitmentsQuery`(기존).

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/test/manage/recruitments/recruitment-list-page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

import RecruitmentsPage from '@/app/manage/clubs/[clubId]/recruitments/page';

const CLUB_ID = 1;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function summaryHandler(
  recruitmentId: number,
  overrides: Partial<{ total: number; underReview: number; interviewPending: number; accepted: number }> = {},
) {
  return http.get(`*/leader/recruitments/${recruitmentId}/stats/summary`, () =>
    HttpResponse.json({
      ok: true,
      message: null,
      data: {
        total: overrides.total ?? 0,
        submitted: overrides.total ?? 0,
        underReview: overrides.underReview ?? 0,
        interviewPending: overrides.interviewPending ?? 0,
        accepted: overrides.accepted ?? 0,
        rejected: 0,
        capacity: 20,
        ratio: 0,
      },
    }),
  );
}

function recruitmentListHandler(recruitmentRows: unknown[]) {
  return http.get(`*/clubs/${CLUB_ID}/recruitments`, () =>
    HttpResponse.json({ ok: true, message: null, data: recruitmentRows }),
  );
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <RecruitmentsPage params={Promise.resolve({ clubId: String(CLUB_ID) })} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('RecruitmentsPage', () => {
  it('활성 모집이 없으면 헤더 CTA·Empty State CTA가 보이고 KPI Row는 렌더하지 않는다', async () => {
    server.use(
      recruitmentListHandler([
        {
          id: 9, clubId: CLUB_ID, clubName: '두잉', title: '9기 신입 모집',
          startDate: '2025-09-10', endDate: '2025-09-24', capacity: 18,
          status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false,
          applicationMode: 'SELF', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER',
        },
      ]),
      summaryHandler(9, { total: 41, accepted: 18 }),
    );
    renderPage();

    expect(await screen.findByText('진행 중인 모집이 없어요')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /새 모집 만들기/ })).toHaveLength(2);
    expect(screen.queryByText('검토 대기')).not.toBeInTheDocument();
    expect(await screen.findByText('9기 신입 모집')).toBeInTheDocument();
  });

  it('활성 모집이 있으면 헤더 CTA를 숨기고 KPI Row와 현재 모집 카드를 렌더한다', async () => {
    server.use(
      recruitmentListHandler([
        {
          id: 10, clubId: CLUB_ID, clubName: '두잉', title: '10기 신입 모집',
          startDate: '2026-09-15', endDate: '2026-09-27', capacity: 20,
          status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
          applicationMode: 'SELF', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER',
        },
      ]),
      summaryHandler(10, { total: 34, underReview: 12, interviewPending: 8, accepted: 2 }),
    );
    renderPage();

    expect(await screen.findByRole('link', { name: '10기 신입 모집' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /새 모집 만들기/ })).not.toBeInTheDocument();
    expect(screen.getByText('검토 대기')).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '지원자 관리' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '면접 관리' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '통계' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/recruitment-list-page.test.tsx`
Expected: FAIL (탭 UI가 남아있어 "진행 중인 모집이 없어요"·KPI·카드 마크업이 존재하지 않음)

- [ ] **Step 3: `page.tsx` 재작성**

`apps/web/app/manage/clubs/[clubId]/recruitments/page.tsx` 전체를 아래로 교체:

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useClubRecruitmentsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { RecruitmentKpiRow } from './_components/RecruitmentKpiRow';
import { CurrentRecruitmentCard } from './_components/CurrentRecruitmentCard';
import { RecruitmentEmptyState } from './_components/RecruitmentEmptyState';
import { PastRecruitmentsTable } from './_components/PastRecruitmentsTable';

export default function RecruitmentsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);

  const { data: recruitments, isLoading } = useClubRecruitmentsQuery(
    isNaN(clubId) ? undefined : clubId,
  );

  // 활성(OPEN) 모집은 클럽당 최대 1건 — 백엔드 V38 부분 유니크 인덱스가 강제하므로 find 가 안전하다.
  const activeRecruitment =
    recruitments?.find((recruitment) => recruitment.displayStatus !== 'CLOSED') ?? null;
  const pastRecruitments =
    recruitments?.filter((recruitment) => recruitment.displayStatus === 'CLOSED') ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-deep">모집 관리</h1>
        {!isLoading && activeRecruitment === null && (
          <Link href={toRoute(`/manage/clubs/${clubId}/recruitments/new`)} className="btn btn-primary">
            <span className="mr-1 text-base leading-none">＋</span>새 모집 만들기
          </Link>
        )}
      </header>

      {isLoading ? (
        <LoadingGate label="모집 목록 불러오는 중" className="min-h-0 py-8" />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-sm font-bold tracking-wide text-ink-deep">현재 모집</h2>
            {activeRecruitment ? (
              <div className="space-y-3">
                <RecruitmentKpiRow recruitment={activeRecruitment} />
                <CurrentRecruitmentCard clubId={clubId} recruitment={activeRecruitment} />
              </div>
            ) : (
              <RecruitmentEmptyState clubId={clubId} />
            )}
          </section>

          <section>
            <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-deep">
              지난 모집 <span className="ml-1 font-medium text-charcoal-3">{pastRecruitments.length}</span>
            </h2>
            <PastRecruitmentsTable clubId={clubId} recruitments={pastRecruitments} />
          </section>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/recruitment-list-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/page.tsx apps/web/test/manage/recruitments/recruitment-list-page.test.tsx
git commit -m "feat(frontend): 모집 관리 화면 KPI·현재 모집·지난 모집 구조로 리디자인"
```

---

### Task 7: `RecruitmentForm`에 `cloneSeed` 지원 추가

**Files:**
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx`
- Test: `apps/web/test/manage/recruitment-form.test.tsx` (기존 파일 끝에 describe 블록 추가 — 기존 `baseRecruitmentDetail` 픽스처 재사용)

**Interfaces:**
- Produces: `CreateMode.cloneSeed?: RecruitmentDetail` — Task 8(`new/page.tsx`)이 소비한다. 기간 필드(startDate/endDate/isAlwaysOpen/interviewStartDate/interviewEndDate)는 절대 시드하지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/test/manage/recruitment-form.test.tsx` 파일 끝에 추가:

```tsx
describe('RecruitmentForm — cloneSeed(양식 복제)', () => {
  const seed: RecruitmentDetail = {
    ...baseRecruitmentDetail,
    title: '9기 신입 모집',
    content: '기존 안내문',
    capacity: 18,
    applicationMode: 'EXTERNAL',
    externalFormUrl: 'https://forms.example.com/legacy',
    useInterview: true,
    targetRole: 'OFFICER',
    showApplicantCount: true,
    startDate: '2025-09-10',
    endDate: '2025-09-24',
  };

  it('제목·정원·지원 방식 등은 시드되지만 시작일/종료일은 비워둔다', () => {
    render(<RecruitmentForm mode="create" cloneSeed={seed} onSubmit={vi.fn()} isPending={false} />);

    expect(screen.getByPlaceholderText('모집 공고 제목을 입력하세요')).toHaveValue('9기 신입 모집');
    expect(screen.getByDisplayValue('18')).toBeInTheDocument();
    expect(screen.getByLabelText('외부 폼')).toBeChecked();
    expect(screen.getByLabelText('운영진')).toBeChecked();
    expect((screen.getByLabelText(/^시작일/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^종료일/) as HTMLInputElement).value).toBe('');
  });

  it('cloneSeed가 없으면 기존과 동일하게 빈 폼으로 시작한다', () => {
    render(<RecruitmentForm mode="create" onSubmit={vi.fn()} isPending={false} />);
    expect(screen.getByPlaceholderText('모집 공고 제목을 입력하세요')).toHaveValue('');
  });
});
```

주의: 이 테스트 파일에서 `getByLabelText(...) as HTMLInputElement`가 기존 파일의 관례와 충돌하면(`as` 금지 규칙은 앱 코드 기준, 테스트 기존 관례 우선) 기존 파일에서 쓰는 헬퍼/패턴을 따른다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitment-form.test.tsx`
Expected: FAIL — Property 'cloneSeed' does not exist on type (타입 에러) 또는 시드 미반영 assertion 실패

- [ ] **Step 3: `RecruitmentForm.tsx` 수정**

현재 파일의 `type CreateMode` 블록:

```tsx
type CreateMode = {
  mode: 'create';
  onSubmit: (values: CreateFormValues) => Promise<void>;
  isPending: boolean;
};
```

를 아래로 교체:

```tsx
type CreateMode = {
  mode: 'create';
  /**
   * 양식 복제 진입 시 초기값. 원본 모집 값을 재사용하되 기간 관련 필드(시작일·종료일·면접 일정·상시모집)는
   * 회차마다 달라지므로 의도적으로 시드하지 않는다 — 아래 useState 초기화 목록 참고.
   */
  cloneSeed?: RecruitmentDetail;
  onSubmit: (values: CreateFormValues) => Promise<void>;
  isPending: boolean;
};
```

그리고 컴포넌트 본문 시작부(`export function RecruitmentForm(props: RecruitmentFormProps) {` 부터 `const isSelfForm = ...` 줄까지)를 아래로 교체한다. **이 블록 이후(`async function handleSubmit(event: FormEvent) {` 부터)는 수정하지 않는다.** 기존 파일의 `isLegacyQuestionsBackend` 주석 블록은 원문 그대로 보존한다:

```tsx
export function RecruitmentForm(props: RecruitmentFormProps) {
  const isEditMode = props.mode === 'edit';
  const initialData = isEditMode ? props.initialValues : null;
  const cloneSeed = !isEditMode ? (props.cloneSeed ?? null) : null;
  // 기간 필드를 제외한 값들의 단일 시드 소스 — edit 모드면 상세, create+복제 모드면 원본 모집.
  const seed = initialData ?? cloneSeed;

  /**
   * (기존 isLegacyQuestionsBackend 주석 원문 그대로 유지)
   */
  const isLegacyQuestionsBackend = isEditMode && initialData?.questionItems === undefined;

  const [title, setTitle] = useState(seed?.title ?? '');
  const [content, setContent] = useState(seed?.content ?? '');
  const [startDate, setStartDate] = useState(initialData?.startDate ?? '');
  const [endDate, setEndDate] = useState(initialData?.endDate ?? '');
  const [isAlwaysOpen, setIsAlwaysOpen] = useState(
    isEditMode ? initialData?.endDate === null : false,
  );
  const [capacity, setCapacity] = useState(seed?.capacity ?? 1);
  const [applicationMode, setApplicationMode] = useState<'SELF' | 'EXTERNAL'>(
    seed?.applicationMode ?? 'SELF',
  );
  const [externalFormUrl, setExternalFormUrl] = useState(seed?.externalFormUrl ?? '');
  const [useInterview, setUseInterview] = useState(seed?.useInterview ?? false);
  const [interviewStartDate, setInterviewStartDate] = useState(initialData?.interviewStartDate ?? '');
  const [interviewEndDate, setInterviewEndDate] = useState(initialData?.interviewEndDate ?? '');
  const [showApplicantCount, setShowApplicantCount] = useState(seed?.showApplicantCount ?? false);
  const [targetRole, setTargetRole] = useState<'MEMBER' | 'OFFICER'>(seed?.targetRole ?? 'MEMBER');
  // 서버 id 와 무관한 React key 발급기 — jsdom 에 crypto.randomUUID 가 없어 카운터로 만든다.
  const keyCounter = useRef(0);
  const nextKey = useCallback(() => `bq-${(keyCounter.current += 1)}`, []);
  const [questionItems, setQuestionItems] = useState<BuilderQuestion[]>(() => {
    if (isEditMode) {
      return isLegacyQuestionsBackend
        ? []
        : toBuilderQuestions(initialData?.questionItems, initialData?.questions ?? [], nextKey);
    }
    if (cloneSeed) {
      return toBuilderQuestions(cloneSeed.questionItems, cloneSeed.questions, nextKey);
    }
    return [];
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isSelfForm = isEditMode ? initialData?.applicationMode === 'SELF' : applicationMode === 'SELF';
```

(주의: 위 블록은 기존 본문과 대부분 동일하고, 실제 변경은 ① `cloneSeed`/`seed` 도입, ② `initialData?.X` → `seed?.X` 치환(기간 필드 제외), ③ `questionItems` 초기화에 clone 분기 추가뿐이다. 기존 파일과 대조하며 diff 를 최소로 유지할 것.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitment-form.test.tsx`
Expected: PASS (기존 케이스 포함 전체 — 특히 edit 모드 회귀 없어야 함)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/_components/RecruitmentForm.tsx apps/web/test/manage/recruitment-form.test.tsx
git commit -m "feat(frontend): RecruitmentForm에 양식 복제 시드(cloneSeed) 지원 추가"
```

---

### Task 8: `new/page.tsx` — `?cloneFrom=` 진입 처리 (searchParams prop 사용)

**Files:**
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/new/page.tsx` (전체 재작성)
- Test: `apps/web/test/manage/recruitments/recruitment-clone.test.tsx`

**Interfaces:**
- Consumes: `RecruitmentForm`(Task 7의 `cloneSeed`), `useRecruitmentDetailQuery`(기존).
- 주의: `useSearchParams()` 훅 대신 **page prop `searchParams: Promise<{ cloneFrom?: string }>`**를 쓴다 — Suspense 경계 요구가 없어 빌드 안전하고 테스트도 prop 주입으로 단순해진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/test/manage/recruitments/recruitment-clone.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

import NewRecruitmentPage from '@/app/manage/clubs/[clubId]/recruitments/new/page';

const CLUB_ID = 1;
const SOURCE_ID = 9;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function sourceRecruitmentHandler() {
  return http.get(`*/recruitments/${SOURCE_ID}`, () =>
    HttpResponse.json({
      ok: true,
      message: null,
      data: {
        id: SOURCE_ID, clubId: CLUB_ID, clubName: '두잉', title: '9기 신입 모집',
        startDate: '2025-09-10', endDate: '2025-09-24', capacity: 18,
        status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false,
        applicationMode: 'SELF', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER',
        content: '기존 안내문', questions: [],
        questionItems: [
          { id: 'q1', text: '지원 동기를 알려주세요', type: 'TEXT', required: true, choices: [] },
        ],
        interviewStartDate: null, interviewEndDate: null, showApplicantCount: false, applicantCount: null,
      },
    }),
  );
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage(searchParams: { cloneFrom?: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <NewRecruitmentPage
          params={Promise.resolve({ clubId: String(CLUB_ID) })}
          searchParams={Promise.resolve(searchParams)}
        />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('NewRecruitmentPage — 양식 복제', () => {
  it('cloneFrom 쿼리가 없으면 평소처럼 빈 폼을 연다', () => {
    renderPage({});
    expect(screen.getByText('신규 모집 작성')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('모집 공고 제목을 입력하세요')).toHaveValue('');
  });

  it('cloneFrom이 있으면 원본을 불러와 제목·질문을 시드하고 안내 배너를 보여준다', async () => {
    server.use(sourceRecruitmentHandler());
    renderPage({ cloneFrom: String(SOURCE_ID) });

    expect(await screen.findByPlaceholderText('모집 공고 제목을 입력하세요')).toHaveValue('9기 신입 모집');
    expect(screen.getByText(/원본 모집은 변경되지 않으며/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('지원 동기를 알려주세요')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/recruitment-clone.test.tsx`
Expected: FAIL (cloneFrom 파라미터를 읽지 않아 시드가 반영되지 않음)

- [ ] **Step 3: `new/page.tsx` 재작성**

```tsx
'use client';

import { use } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useCreateRecruitmentMutation, useRecruitmentDetailQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { RecruitmentForm } from '../_components/RecruitmentForm';
import type { CreateFormValues } from '../_components/RecruitmentForm';

export default function NewRecruitmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ cloneFrom?: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const { cloneFrom: cloneFromParam } = use(searchParams);
  const clubId = Number(clubIdParam);
  const router = useGuardedRouter();

  // 양식 복제 진입 — ?cloneFrom={id} 가 있으면 해당 모집 상세를 새 작성 폼의 초기값으로 쓴다.
  // 별도 Clone API 없이 기존 상세 조회 + 생성 API 를 재사용한다(원본은 절대 수정하지 않음).
  // 생성 시 질문 id 는 서버가 무시하고 새로 발급하므로(QuestionItemPayload 스펙 §2.2) id 스트립 불필요.
  // 추후 백엔드 Clone API 가 생기면 이 fetch 만 바꾸면 된다 — RecruitmentForm 은 cloneSeed(RecruitmentDetail)만 받는다.
  const cloneFromId = cloneFromParam !== undefined ? Number(cloneFromParam) : undefined;
  const isValidCloneFromId = cloneFromId !== undefined && !isNaN(cloneFromId);
  const { data: cloneSource, isLoading: isCloneSourceLoading } = useRecruitmentDetailQuery(
    isValidCloneFromId ? cloneFromId : undefined,
  );

  const createRecruitment = useCreateRecruitmentMutation(clubId);

  async function handleSubmit(values: CreateFormValues) {
    const newRecruitmentId = await createRecruitment.mutateAsync({
      title: values.title,
      content: values.content || undefined,
      startDate: values.startDate,
      endDate: values.endDate,
      capacity: values.capacity,
      applicationMode: values.applicationMode,
      externalFormUrl: values.applicationMode === 'EXTERNAL' ? values.externalFormUrl : undefined,
      useInterview: values.useInterview,
      targetRole: values.targetRole,
      questionItems: values.applicationMode === 'SELF' ? values.questionItems : undefined,
      interviewStartDate: values.interviewStartDate ?? undefined,
      interviewEndDate: values.interviewEndDate ?? undefined,
      showApplicantCount: values.showApplicantCount,
    });
    router.push(toRoute(`/manage/clubs/${clubId}/recruitments/${newRecruitmentId}`));
  }

  if (isValidCloneFromId && isCloneSourceLoading) {
    return <LoadingGate label="복제할 모집 정보 불러오는 중" />;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-bold">
          {cloneSource ? '모집 양식 복제로 새 모집 작성' : '신규 모집 작성'}
        </h1>
        {cloneSource && (
          <p className="mt-2 rounded-md bg-sage-tint px-3 py-2 text-xs text-charcoal-2">
            「{cloneSource.title}」의 내용을 기반으로 새 모집을 작성합니다. 원본 모집은 변경되지 않으며,
            모집 기간은 새로 입력해주세요.
          </p>
        )}
      </div>
      <RecruitmentForm
        mode="create"
        cloneSeed={cloneSource}
        onSubmit={handleSubmit}
        isPending={createRecruitment.isPending}
      />
    </div>
  );
}
```

(엣지: 유효하지 않은 `cloneFrom`이나 상세 조회 실패 시 조용히 빈 폼으로 폴백 — 의도된 동작. `handleSubmit` 본문은 기존 파일과 동일하다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/recruitment-clone.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/new/page.tsx apps/web/test/manage/recruitments/recruitment-clone.test.tsx
git commit -m "feat(frontend): 지난 모집 양식 복제 진입(?cloneFrom=) 구현"
```

---

### Task 9: 전체 검증

**Files:** 없음(코드 변경 없음) — CI 동등 명령 실행 + 개발 서버 수동 QA.

- [ ] **Step 1: 타입 체크**

Run: `pnpm --filter @duing/web typecheck`
Expected: 에러 없음

- [ ] **Step 2: 린트**

Run: `pnpm --filter @duing/web lint`
Expected: 에러 없음

- [ ] **Step 3: 전체 테스트**

Run: `pnpm --filter @duing/web test -- --run`
Expected: 전체 PASS (Task 1~8 테스트 + 기존 회귀 테스트 전부)

- [ ] **Step 4: 빌드**

Run: `pnpm --filter @duing/web build` (frontend/ 에서 실행, `| tail` 금지 — exit code 와 최종 출력 함께 확인)
Expected: 빌드 성공

- [ ] **Step 5: 개발 서버 수동 QA (백엔드 로컬 실행 중이어야 함, 포트 3000)**

Run: `pnpm --filter @duing/web dev`

브라우저에서 `/manage/clubs/{clubId}/recruitments` 확인:
- 활성 모집 있을 때: 헤더 CTA 없음, KPI 4타일(지원자/검토 대기/면접 대기/합격) 실수치, 카드 제목 클릭 → 상세 이동, 면접 사용 모집이면 면접 관리 버튼 노출, 모집 종료 → 확인 모달 → 마감 동작.
- 활성 없을 때: 헤더 CTA + Empty State CTA, KPI Row 미표시.
- 지난 모집 표: 결과 보기 → 통계, 양식 복제 → `new?cloneFrom=`, 모바일 폭(<md) 카드 리스트 전환.
- 양식 복제 작성 화면: 제목/정원/지원 방식/질문 시드 확인, 시작일/종료일 비어 있음, 제출 시 새 모집 생성 + 원본 무변경(원본 상세 재확인).

QA 종료 후 개발 서버를 종료한다.

- [ ] **Step 6: Commit 없음** — 문제 발견 시 해당 Task로 돌아가 수정 후 그 Task 안에서 커밋.

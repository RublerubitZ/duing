# 운영자 메인 대시보드 Implementation Plan (v1, FE-only)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/manage` 진입점을 운영자(OFFICER/LEADER)가 선택한 동아리의 "처리 필요 업무 · 진행 중 모집 · 지원자 현황 · 오늘 일정 · 공지·일정 딥링크"를 한눈에 보는 메인 대시보드로 교체한다.

**Architecture:** 신규 백엔드 없이 기존 엔드포인트를 FE에서 조합한다. 순수 selector 함수(도메인 로직)를 `@duing/hooks`에 두고 단위 테스트로 검증하고, `useQueries` fan-out 훅이 모집별 `stats.summary`·`interview-rounds`를 병렬 호출해 selector로 가공한다. 프레젠테이션은 공용 `DashboardCard` 셸 + 카드별 컴포넌트로 분리한다. 대시보드는 `ManageShell` 없이 자체 헤더(동아리 전환기)를 가진 standalone 페이지이며, 카드 클릭 시 셸이 적용된 `/manage/clubs/[clubId]/...` 관리 화면으로 딥링크한다.

**Tech Stack:** Next.js 15 App Router / React 19 / TanStack Query 5 / pnpm workspaces (`@duing/types`, `@duing/api`, `@duing/hooks`, `@duing/web`) / Vitest 4 + Testing Library + MSW 2.

---

## 사양 대비 현실 조정 (구현 전 필독)

| 사양 항목 | 코드 현실 | v1 처리 |
|---|---|---|
| 카드1 "결과 미발표 면접 라운드" | `InterviewRoundStatus`에 결과발표 상태/플래그 없음 | **근사**: `status === 'SCHEDULED'` 라운드 + 해당 모집 `stats.interviewPending > 0` → `INTERVIEW_RESULT_PENDING`. 지원자 화면으로 딥링크. 정확판은 v2(백엔드 결과발표 모델링). |
| 진행 중 모집 마감 임박 = `endDate`/`interviewEndDate` | `RecruitmentSummary`에 `interviewEndDate` 없음(`endDate`만 존재) | `endDate` 기준 D-3만 사용. |
| 모집별 지원자 수 | `RecruitmentSummary`에 `applicantCount` 없음 | `stats.summary(recruitmentId).total` fan-out으로 취득. |
| `/manage`를 `ManageShell`로 감싸기 | `ManageShell`은 non-null `currentClubId` 필요, `/manage`는 shell 없음 | v1 대시보드는 **standalone**(자체 헤더+전환기). 카드 딥링크가 셸 페이지로 이동. |
| 카드1 "응답 미수집/기간 경과" | 라운드에 `status`, `respondedMemberCount/totalMemberCount`, (요약)`availabilityDeadline` 존재 | `status === 'COLLECTING'` && `respondedMemberCount < totalMemberCount` → `INTERVIEW_RESPONSE_UNCOLLECTED`. 마감 경과는 `daysLeft<0`로 표기. |

---

## 파일 구조 (생성/수정)

**`packages/types/src/`**
- 생성 `dashboard.ts` — 대시보드 뷰모델 타입(`ActionItem*`, `TodayScheduleItem*`, `ApplicantStatusTotals`). 라우팅(`href`) 미포함 — 식별자만 담고 링크는 web에서 생성.
- 수정 `index.ts` — `export * from './dashboard';`

**`packages/hooks/src/`**
- 생성 `dashboardDate.ts` — KST 날짜 순수 헬퍼
- 생성 `dashboardSelectors.ts` — 순수 도메인 로직(액션아이템 생성/정렬, 통계 합산, 오늘 일정 병합/정렬)
- 생성 `dashboardQueryKeys.ts` — 쿼리키 팩토리
- 생성 `dashboard.ts` — 카드별 `useQueries` fan-out 훅 5개
- 수정 `index.ts` — 신규 훅 + 키 팩토리 export

**`packages/hooks/test/`**
- 생성 `dashboardDate.test.ts`, `dashboardSelectors.test.ts`, `dashboardActionItems.test.tsx`, `dashboardApplicantSummary.test.tsx`, `dashboardTodaySchedule.test.tsx`, `dashboardActiveRecruitments.test.tsx`, `dashboardFeedCounts.test.tsx`

**`apps/web/app/manage/_components/dashboard/`** (생성)
- `dashboard-labels.ts` — 라벨·배지 클래스 맵
- `DashboardCard.tsx` — 공용 카드 셸(헤더/배지/로딩/Empty/children)
- `ActionItemsCard.tsx`, `ActiveRecruitmentsCard.tsx`, `ApplicantSummaryCard.tsx`, `TodayScheduleCard.tsx`, `ClubFeedLinkCard.tsx`
- `DashboardClubSwitcher.tsx`

**`apps/web/app/manage/_pages/`** (생성)
- `OperatorMainDashboardPage.tsx` — 클라이언트 조립(선택 동아리 `?clubId=`, 카드 그리드)

**`apps/web/app/manage/page.tsx`** (수정) — 리다이렉트 제거, `OperatorMainDashboardPage` 렌더

**`apps/web/test/manage/`** (생성)
- `DashboardCard.test.tsx`, `ActionItemsCard.test.tsx`, `OperatorMainDashboardPage.test.tsx`

---

## Task 1: 대시보드 뷰모델 타입

**Files:**
- Create: `packages/types/src/dashboard.ts`
- Modify: `packages/types/src/index.ts`
- Verify: `pnpm --filter @duing/types typecheck`

- [ ] **Step 1: 타입 파일 작성**

`packages/types/src/dashboard.ts`:

```ts
// 운영자 대시보드 v1 뷰모델 — 백엔드 DTO가 아니라 FE에서 조합한 파생 타입.
// 라우팅 경로(href)는 담지 않는다(식별자만). 링크는 web 레이어에서 toRoute로 생성.

export type ActionItemType =
  | 'APPLICANTS_AWAITING_REVIEW'
  | 'INTERVIEW_ROUND_UNCONFIRMED'
  | 'INTERVIEW_RESPONSE_UNCOLLECTED'
  | 'INTERVIEW_RESULT_PENDING'
  | 'RECRUITMENT_CLOSING_SOON';

export interface ActionItem {
  type: ActionItemType;
  recruitmentId: number;
  recruitmentTitle: string;
  roundId?: number;
  roundTitle?: string;
  /** 검토 대기 인원, 미응답 인원 등 맥락 수치 */
  count?: number;
  /** 마감/기한까지 남은 일수. 음수면 경과 */
  daysLeft?: number;
}

export type TodayScheduleKind = 'INTERVIEW' | 'EVENT';

export interface TodayScheduleItem {
  kind: TodayScheduleKind;
  title: string;
  /** ISO datetime */
  startAt: string;
  endAt: string | null;
  location: string | null;
  /** INTERVIEW 딥링크용 */
  recruitmentId?: number;
  roundId?: number;
  /** EVENT 식별자(v1 비링크) */
  eventId?: number;
}

export interface ApplicantStatusTotals {
  total: number;
  submitted: number;
  underReview: number;
  interviewPending: number;
  accepted: number;
  rejected: number;
  capacity: number;
}
```

- [ ] **Step 2: 배럴 export 추가**

`packages/types/src/index.ts` 끝에 추가:

```ts
export * from './dashboard';
```

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @duing/types typecheck`
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/dashboard.ts packages/types/src/index.ts
git commit -m "feat(types): 운영자 대시보드 뷰모델 타입"
```

---

## Task 2: KST 날짜 순수 헬퍼

**Files:**
- Create: `packages/hooks/src/dashboardDate.ts`
- Test: `packages/hooks/test/dashboardDate.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`packages/hooks/test/dashboardDate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  kstDateString,
  todayKstDateString,
  isTodayKst,
  daysUntilKst,
} from '../src/dashboardDate';

describe('dashboardDate', () => {
  it('kstDateString: UTC ISO를 KST 날짜로 변환한다', () => {
    // 2026-06-12T16:30:00Z == 2026-06-13 01:30 KST
    expect(kstDateString('2026-06-12T16:30:00Z')).toBe('2026-06-13');
    // 2026-06-12T10:00:00Z == 2026-06-12 19:00 KST
    expect(kstDateString('2026-06-12T10:00:00Z')).toBe('2026-06-12');
  });

  it('todayKstDateString: now(Date)를 KST 날짜로 변환한다', () => {
    expect(todayKstDateString(new Date('2026-06-11T20:00:00Z'))).toBe('2026-06-12');
  });

  it('isTodayKst: 같은 KST 날짜면 true', () => {
    const now = new Date('2026-06-12T03:00:00Z'); // 12:00 KST 6/12
    expect(isTodayKst('2026-06-12T05:00:00Z', now)).toBe(true);
    expect(isTodayKst('2026-06-11T05:00:00Z', now)).toBe(false);
  });

  it('daysUntilKst: KST 캘린더 일수 차이(양수=미래)', () => {
    const now = new Date('2026-06-12T03:00:00Z'); // 6/12 KST
    expect(daysUntilKst('2026-06-15', now)).toBe(3);
    expect(daysUntilKst('2026-06-12', now)).toBe(0);
    expect(daysUntilKst('2026-06-10', now)).toBe(-2);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardDate.test.ts --run`
Expected: FAIL — `Cannot find module '../src/dashboardDate'`

- [ ] **Step 3: 구현**

`packages/hooks/src/dashboardDate.ts`:

```ts
// KST(Asia/Seoul) 기준 날짜 유틸. now를 인자로 받아 순수성을 유지한다.

const KST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** ISO datetime 또는 'YYYY-MM-DD'를 KST 'YYYY-MM-DD'로 변환 */
export function kstDateString(iso: string): string {
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00+09:00`) : new Date(iso);
  return KST_FORMATTER.format(date);
}

export function todayKstDateString(now: Date): string {
  return KST_FORMATTER.format(now);
}

export function isTodayKst(iso: string, now: Date): boolean {
  return kstDateString(iso) === todayKstDateString(now);
}

/** KST 캘린더 기준 (target - today) 일수. 양수면 미래, 음수면 경과 */
export function daysUntilKst(targetIso: string, now: Date): number {
  const targetMs = Date.parse(`${kstDateString(targetIso)}T00:00:00Z`);
  const todayMs = Date.parse(`${todayKstDateString(now)}T00:00:00Z`);
  return Math.round((targetMs - todayMs) / 86_400_000);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardDate.test.ts --run`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/hooks/src/dashboardDate.ts packages/hooks/test/dashboardDate.test.ts
git commit -m "feat(hooks): 대시보드 KST 날짜 헬퍼"
```

---

## Task 3: 대시보드 selector(순수 도메인 로직)

**Files:**
- Create: `packages/hooks/src/dashboardSelectors.ts`
- Test: `packages/hooks/test/dashboardSelectors.test.ts`

> 이 태스크가 대시보드의 핵심 로직이다. 입력은 fan-out으로 모은 원시 데이터, 출력은 카드용 뷰모델. 모두 순수 함수.

- [ ] **Step 1: 실패 테스트 작성**

`packages/hooks/test/dashboardSelectors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type {
  RecruitmentSummary,
  StatsSummary,
  InterviewRoundSummary,
  ClubEventCard,
  TodayScheduleItem,
} from '@duing/types';
import {
  CLOSING_SOON_DAYS,
  ACTION_ITEM_PREVIEW_COUNT,
  buildActionItems,
  sortActionItems,
  aggregateApplicantTotals,
  sortTodaySchedule,
  type RecruitmentDashboardInput,
} from '../src/dashboardSelectors';

const NOW = new Date('2026-06-12T03:00:00Z'); // 6/12 KST 12:00

function recruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
    id: 1, clubId: 10, clubName: '두잉', title: '2026 봄 모집',
    startDate: '2026-06-01', endDate: '2026-06-30', capacity: 20,
    status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
    applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: true,
    targetRole: 'MEMBER', ...over,
  } as RecruitmentSummary;
}

function stats(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    total: 0, submitted: 0, underReview: 0, interviewPending: 0,
    accepted: 0, rejected: 0, capacity: 20, ratio: 0, ...over,
  };
}

function round(over: Partial<InterviewRoundSummary> = {}): InterviewRoundSummary {
  return {
    roundId: 100, title: '1차 면접', status: 'DRAFT',
    availabilityDeadline: null, location: null,
    totalMemberCount: 0, respondedMemberCount: 0, ...over,
  };
}

describe('buildActionItems', () => {
  it('검토 대기 지원자(submitted+underReview>0)를 만든다', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment(), stats: stats({ submitted: 2, underReview: 3 }), rounds: [] },
    ];
    const items = buildActionItems(input, NOW);
    const review = items.find((i) => i.type === 'APPLICANTS_AWAITING_REVIEW');
    expect(review).toBeDefined();
    expect(review?.count).toBe(5);
    expect(review?.recruitmentId).toBe(1);
  });

  it('ASSIGNING 라운드 → 미확정 면접 라운드', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment(), stats: stats(), rounds: [round({ roundId: 7, status: 'ASSIGNING', title: '2차' })] },
    ];
    const items = buildActionItems(input, NOW);
    const unconfirmed = items.find((i) => i.type === 'INTERVIEW_ROUND_UNCONFIRMED');
    expect(unconfirmed?.roundId).toBe(7);
    expect(unconfirmed?.roundTitle).toBe('2차');
  });

  it('COLLECTING & 미응답 인원 존재 → 응답 미수집', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment(), stats: stats(),
        rounds: [round({ status: 'COLLECTING', totalMemberCount: 10, respondedMemberCount: 4, availabilityDeadline: '2026-06-10' })] },
    ];
    const items = buildActionItems(input, NOW);
    const uncollected = items.find((i) => i.type === 'INTERVIEW_RESPONSE_UNCOLLECTED');
    expect(uncollected?.count).toBe(6); // 미응답 10-4
    expect(uncollected?.daysLeft).toBe(-2); // 6/10 마감 → 경과
  });

  it('SCHEDULED 라운드 + interviewPending>0 → 결과 미확정', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment(), stats: stats({ interviewPending: 4 }),
        rounds: [round({ status: 'SCHEDULED' })] },
    ];
    const items = buildActionItems(input, NOW);
    const pending = items.find((i) => i.type === 'INTERVIEW_RESULT_PENDING');
    expect(pending?.count).toBe(4);
  });

  it('endDate가 D-3 이내면 마감 임박', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment({ endDate: '2026-06-14' }), stats: stats(), rounds: [] },
    ];
    const items = buildActionItems(input, NOW);
    const closing = items.find((i) => i.type === 'RECRUITMENT_CLOSING_SOON');
    expect(closing?.daysLeft).toBe(2);
  });

  it('endDate가 D-3 초과면 마감 임박 아님', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment({ endDate: '2026-06-30' }), stats: stats(), rounds: [] },
    ];
    expect(buildActionItems(input, NOW).some((i) => i.type === 'RECRUITMENT_CLOSING_SOON')).toBe(false);
  });

  it('CLOSED 모집은 마감 임박을 만들지 않는다', () => {
    const input: RecruitmentDashboardInput[] = [
      { recruitment: recruitment({ displayStatus: 'CLOSED', endDate: '2026-06-14' }), stats: stats(), rounds: [] },
    ];
    expect(buildActionItems(input, NOW).some((i) => i.type === 'RECRUITMENT_CLOSING_SOON')).toBe(false);
  });
});

describe('sortActionItems', () => {
  it('기한 있는 항목이 daysLeft 오름차순으로 먼저, 그 뒤 타입 우선순위', () => {
    const items = buildActionItems(
      [
        { recruitment: recruitment({ id: 1, endDate: '2026-06-14' }), stats: stats({ submitted: 1 }),
          rounds: [round({ roundId: 9, status: 'ASSIGNING' })] },
      ],
      NOW,
    );
    const sorted = sortActionItems(items);
    // 마감 임박(daysLeft=2) → 기한 없는 ASSIGNING → 검토 대기 순
    expect(sorted[0].type).toBe('RECRUITMENT_CLOSING_SOON');
    expect(sorted[1].type).toBe('INTERVIEW_ROUND_UNCONFIRMED');
    expect(sorted[2].type).toBe('APPLICANTS_AWAITING_REVIEW');
  });
});

describe('aggregateApplicantTotals', () => {
  it('여러 모집 통계를 합산한다(undefined 무시)', () => {
    const totals = aggregateApplicantTotals([
      stats({ total: 5, submitted: 2, accepted: 1, capacity: 20 }),
      undefined,
      stats({ total: 3, submitted: 1, interviewPending: 2, capacity: 10 }),
    ]);
    expect(totals.total).toBe(8);
    expect(totals.submitted).toBe(3);
    expect(totals.interviewPending).toBe(2);
    expect(totals.capacity).toBe(30);
  });
});

describe('sortTodaySchedule', () => {
  it('시간 오름차순, 동일 시간은 면접 우선', () => {
    const event = (h: number): TodayScheduleItem => ({
      kind: 'EVENT', title: `행사${h}`, startAt: `2026-06-12T${String(h).padStart(2, '0')}:00:00+09:00`,
      endAt: null, location: null,
    });
    const interview = (h: number): TodayScheduleItem => ({
      kind: 'INTERVIEW', title: `면접${h}`, startAt: `2026-06-12T${String(h).padStart(2, '0')}:00:00+09:00`,
      endAt: null, location: null, recruitmentId: 1, roundId: 2,
    });
    const sorted = sortTodaySchedule([event(10), interview(10), event(9)]);
    expect(sorted.map((i) => i.title)).toEqual(['행사9', '면접10', '행사10']);
  });
});

describe('constants', () => {
  it('상수 노출', () => {
    expect(CLOSING_SOON_DAYS).toBe(3);
    expect(ACTION_ITEM_PREVIEW_COUNT).toBe(3);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardSelectors.test.ts --run`
Expected: FAIL — `Cannot find module '../src/dashboardSelectors'`

- [ ] **Step 3: 구현**

`packages/hooks/src/dashboardSelectors.ts`:

```ts
import type {
  ActionItem,
  ActionItemType,
  ApplicantStatusTotals,
  InterviewRoundSummary,
  RecruitmentSummary,
  StatsSummary,
  TodayScheduleItem,
} from '@duing/types';
import { daysUntilKst } from './dashboardDate';

export const CLOSING_SOON_DAYS = 3;
export const ACTION_ITEM_PREVIEW_COUNT = 3;

/** 모집 1건 + 그 모집의 통계·면접 라운드 묶음 */
export interface RecruitmentDashboardInput {
  recruitment: RecruitmentSummary;
  stats: StatsSummary | undefined;
  rounds: InterviewRoundSummary[] | undefined;
}

const TYPE_PRIORITY: Record<ActionItemType, number> = {
  INTERVIEW_ROUND_UNCONFIRMED: 0,
  INTERVIEW_RESPONSE_UNCOLLECTED: 1,
  RECRUITMENT_CLOSING_SOON: 2,
  INTERVIEW_RESULT_PENDING: 3,
  APPLICANTS_AWAITING_REVIEW: 4,
};

export function buildActionItems(inputs: RecruitmentDashboardInput[], now: Date): ActionItem[] {
  const items: ActionItem[] = [];

  for (const { recruitment, stats, rounds } of inputs) {
    const base = { recruitmentId: recruitment.id, recruitmentTitle: recruitment.title };

    // 검토 대기 지원자
    if (stats) {
      const awaiting = stats.submitted + stats.underReview;
      if (awaiting > 0) {
        items.push({ type: 'APPLICANTS_AWAITING_REVIEW', ...base, count: awaiting });
      }
    }

    // 면접 라운드 기반
    for (const round of rounds ?? []) {
      if (round.status === 'ASSIGNING') {
        items.push({ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...base, roundId: round.roundId, roundTitle: round.title });
      }
      if (round.status === 'COLLECTING' && round.respondedMemberCount < round.totalMemberCount) {
        items.push({
          type: 'INTERVIEW_RESPONSE_UNCOLLECTED', ...base,
          roundId: round.roundId, roundTitle: round.title,
          count: round.totalMemberCount - round.respondedMemberCount,
          daysLeft: round.availabilityDeadline ? daysUntilKst(round.availabilityDeadline, now) : undefined,
        });
      }
    }

    // 결과 미확정(근사): SCHEDULED 라운드 존재 + 면접대기 인원
    const hasScheduled = (rounds ?? []).some((r) => r.status === 'SCHEDULED');
    if (hasScheduled && stats && stats.interviewPending > 0) {
      items.push({ type: 'INTERVIEW_RESULT_PENDING', ...base, count: stats.interviewPending });
    }

    // 마감 임박: 종료 아님 + endDate D-N 이내(경과 제외)
    if (recruitment.displayStatus !== 'CLOSED' && recruitment.endDate) {
      const daysLeft = daysUntilKst(recruitment.endDate, now);
      if (daysLeft >= 0 && daysLeft <= CLOSING_SOON_DAYS) {
        items.push({ type: 'RECRUITMENT_CLOSING_SOON', ...base, daysLeft });
      }
    }
  }

  return items;
}

export function sortActionItems(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => {
    const aHas = a.daysLeft !== undefined;
    const bHas = b.daysLeft !== undefined;
    if (aHas && bHas && a.daysLeft !== b.daysLeft) return (a.daysLeft as number) - (b.daysLeft as number);
    if (aHas !== bHas) return aHas ? -1 : 1;
    return TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
  });
}

export function aggregateApplicantTotals(statsList: Array<StatsSummary | undefined>): ApplicantStatusTotals {
  const totals: ApplicantStatusTotals = {
    total: 0, submitted: 0, underReview: 0, interviewPending: 0, accepted: 0, rejected: 0, capacity: 0,
  };
  for (const stats of statsList) {
    if (!stats) continue;
    totals.total += stats.total;
    totals.submitted += stats.submitted;
    totals.underReview += stats.underReview;
    totals.interviewPending += stats.interviewPending;
    totals.accepted += stats.accepted;
    totals.rejected += stats.rejected;
    totals.capacity += stats.capacity;
  }
  return totals;
}

const KIND_RANK = { INTERVIEW: 0, EVENT: 1 } as const;

export function sortTodaySchedule(items: TodayScheduleItem[]): TodayScheduleItem[] {
  return [...items].sort((a, b) => {
    const byTime = a.startAt.localeCompare(b.startAt);
    if (byTime !== 0) return byTime;
    return KIND_RANK[a.kind] - KIND_RANK[b.kind];
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardSelectors.test.ts --run`
Expected: PASS (전체 통과)

- [ ] **Step 5: Commit**

```bash
git add packages/hooks/src/dashboardSelectors.ts packages/hooks/test/dashboardSelectors.test.ts
git commit -m "feat(hooks): 대시보드 액션아이템·통계·오늘일정 selector"
```

---

## Task 4: 대시보드 쿼리키 팩토리

**Files:**
- Create: `packages/hooks/src/dashboardQueryKeys.ts`
- Modify: `packages/hooks/src/index.ts`

- [ ] **Step 1: 키 팩토리 작성**

`packages/hooks/src/dashboardQueryKeys.ts`:

```ts
// 대시보드 카드용 쿼리키. 모집/라운드/통계 등 하위 데이터는 기존 도메인 키를 재사용하고,
// 여기서는 카드5 카운트(공지·이벤트 집계)처럼 대시보드 전용 합성 쿼리에만 사용한다.
export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  feedCounts: (clubId: number) => [...dashboardQueryKeys.all, clubId, 'feed-counts'] as const,
  todayEvents: (clubId: number, day: string) =>
    [...dashboardQueryKeys.all, clubId, 'today-events', day] as const,
};
```

- [ ] **Step 2: export 추가**

`packages/hooks/src/index.ts`의 쿼리키 export 묶음에 추가:

```ts
export { dashboardQueryKeys } from './dashboardQueryKeys';
```

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @duing/hooks typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/hooks/src/dashboardQueryKeys.ts packages/hooks/src/index.ts
git commit -m "feat(hooks): 대시보드 쿼리키 팩토리"
```

---

## Task 5: `useActiveRecruitments` 훅 (카드2)

**Files:**
- Create/Modify: `packages/hooks/src/dashboard.ts`
- Modify: `packages/hooks/src/index.ts`
- Test: `packages/hooks/test/dashboardActiveRecruitments.test.tsx`

> 공통 옵션 상수 `DASHBOARD_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 300_000 }`를 `dashboard.ts` 상단에 정의해 모든 대시보드 훅이 공유한다.

- [ ] **Step 1: 실패 테스트 작성**

`packages/hooks/test/dashboardActiveRecruitments.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useActiveRecruitments } from '../src/dashboard';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const server = setupServer(
  http.get('*/clubs/10/recruitments', () =>
    HttpResponse.json({
      ok: true, message: null,
      data: [
        { id: 1, clubId: 10, clubName: '두잉', title: '봄 모집', startDate: '2026-06-01', endDate: '2026-06-30',
          capacity: 20, status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
          applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER' },
        { id: 2, clubId: 10, clubName: '두잉', title: '겨울 모집', startDate: '2025-12-01', endDate: '2025-12-31',
          capacity: 20, status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false,
          applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER' },
      ],
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useActiveRecruitments', () => {
  it('CLOSED를 제외한 진행 중 모집만 반환', async () => {
    const { result } = renderHook(() => useActiveRecruitments(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((r) => r.id)).toEqual([1]);
  });

  it('clubId undefined면 비활성', () => {
    const { result } = renderHook(() => useActiveRecruitments(undefined), { wrapper: makeWrapper(newQueryClient()) });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardActiveRecruitments.test.tsx --run`
Expected: FAIL — `useActiveRecruitments` not exported

- [ ] **Step 3: 구현**

`packages/hooks/src/dashboard.ts` (신규):

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RecruitmentSummary } from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';

export const DASHBOARD_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 300_000 } as const;

function isActive(recruitment: RecruitmentSummary): boolean {
  return recruitment.displayStatus !== 'CLOSED';
}

/** 카드2: CLOSED 제외 진행 중 모집 */
export function useActiveRecruitments(clubId: number | undefined) {
  const client = useApiClient();
  const query = useQuery({
    queryKey: clubId !== undefined ? clubQueryKeys.recruitments(clubId) : ['clubs', undefined, 'recruitments'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubs.recruitmentsByClub(clubId);
    },
    enabled: clubId !== undefined,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const data = useMemo(() => query.data?.filter(isActive), [query.data]);
  return { ...query, data };
}
```

`packages/hooks/src/index.ts`에 추가(대시보드 훅 묶음):

```ts
export {
  DASHBOARD_QUERY_OPTIONS,
  useActiveRecruitments,
} from './dashboard';
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardActiveRecruitments.test.tsx --run`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/hooks/src/dashboard.ts packages/hooks/src/index.ts packages/hooks/test/dashboardActiveRecruitments.test.tsx
git commit -m "feat(hooks): useActiveRecruitments (진행 중 모집)"
```

---

## Task 6: `useApplicantSummary` 훅 (카드3)

**Files:**
- Modify: `packages/hooks/src/dashboard.ts`, `packages/hooks/src/index.ts`
- Test: `packages/hooks/test/dashboardApplicantSummary.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`packages/hooks/test/dashboardApplicantSummary.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useApplicantSummary } from '../src/dashboard';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (<ApiClientProvider client={apiClient}><QueryClientProvider client={qc}>{children}</QueryClientProvider></ApiClientProvider>);
  };
}
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function recruitmentRow(id: number, displayStatus: string) {
  return { id, clubId: 10, clubName: '두잉', title: `모집${id}`, startDate: '2026-06-01', endDate: '2026-06-30',
    capacity: 10, status: displayStatus === 'CLOSED' ? 'CLOSED' : 'OPEN', displayStatus, effectivelyOpen: displayStatus !== 'CLOSED',
    applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER' };
}
function statsBody(over: Record<string, number>) {
  return { ok: true, message: null,
    data: { total: 0, submitted: 0, underReview: 0, interviewPending: 0, accepted: 0, rejected: 0, capacity: 10, ratio: 0, ...over } };
}

const server = setupServer(
  http.get('*/clubs/10/recruitments', () =>
    HttpResponse.json({ ok: true, message: null, data: [recruitmentRow(1, 'OPEN'), recruitmentRow(2, 'OPEN')] }),
  ),
  http.get('*/leader/recruitments/1/stats/summary', () => HttpResponse.json(statsBody({ total: 5, submitted: 2, accepted: 1 }))),
  http.get('*/leader/recruitments/2/stats/summary', () => HttpResponse.json(statsBody({ total: 3, submitted: 1, interviewPending: 2 }))),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useApplicantSummary', () => {
  it('진행 중 모집들의 통계를 합산한다', async () => {
    const { result } = renderHook(() => useApplicantSummary(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totals.total).toBe(8);
    expect(result.current.totals.submitted).toBe(3);
    expect(result.current.totals.interviewPending).toBe(2);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardApplicantSummary.test.tsx --run`
Expected: FAIL — `useApplicantSummary` not exported

- [ ] **Step 3: 구현**

`packages/hooks/src/dashboard.ts`에 추가:

```ts
import { useQueries } from '@tanstack/react-query';
import type { ApplicantStatusTotals, StatsSummary } from '@duing/types';
import { recruitmentQueryKeys } from './recruitmentQueryKeys';
import { aggregateApplicantTotals } from './dashboardSelectors';
```

```ts
/** 카드3: 진행 중 모집들의 단계별 지원자 통계 합산 */
export function useApplicantSummary(clubId: number | undefined): {
  totals: ApplicantStatusTotals;
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const recruitments = useActiveRecruitments(clubId);
  const ids = recruitments.data?.map((r) => r.id) ?? [];

  const statsQueries = useQueries({
    queries: ids.map((recruitmentId) => ({
      queryKey: recruitmentQueryKeys.statsSummary(recruitmentId),
      queryFn: () => client.stats.summary(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
  });

  const totals = useMemo(
    () => aggregateApplicantTotals(statsQueries.map((q) => q.data as StatsSummary | undefined)),
    [statsQueries],
  );

  return {
    totals,
    isLoading: recruitments.isLoading || statsQueries.some((q) => q.isLoading),
    isError: recruitments.isError || statsQueries.some((q) => q.isError),
  };
}
```

`index.ts`의 대시보드 export에 `useApplicantSummary` 추가.

> **사전 점검:** `recruitmentQueryKeys.statsSummary(recruitmentId)`가 없으면 `packages/hooks/src/recruitmentQueryKeys.ts`에 `statsSummary: (recruitmentId: number) => [...recruitmentQueryKeys.all, recruitmentId, 'stats', 'summary'] as const,`를 추가한다(기존 키 컨벤션 동일). 있으면 재사용.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardApplicantSummary.test.tsx --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/hooks/src/dashboard.ts packages/hooks/src/index.ts packages/hooks/src/recruitmentQueryKeys.ts packages/hooks/test/dashboardApplicantSummary.test.tsx
git commit -m "feat(hooks): useApplicantSummary (지원자 현황 합산)"
```

---

## Task 7: `useClubActionItems` 훅 (카드1)

**Files:**
- Modify: `packages/hooks/src/dashboard.ts`, `packages/hooks/src/index.ts`
- Test: `packages/hooks/test/dashboardActionItems.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`packages/hooks/test/dashboardActionItems.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useClubActionItems } from '../src/dashboard';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (<ApiClientProvider client={apiClient}><QueryClientProvider client={qc}>{children}</QueryClientProvider></ApiClientProvider>);
  };
}
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const server = setupServer(
  http.get('*/clubs/10/recruitments', () =>
    HttpResponse.json({ ok: true, message: null, data: [
      { id: 1, clubId: 10, clubName: '두잉', title: '봄 모집', startDate: '2026-06-01', endDate: '2026-06-30',
        capacity: 20, status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
        applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER' },
    ] }),
  ),
  http.get('*/leader/recruitments/1/stats/summary', () =>
    HttpResponse.json({ ok: true, message: null, data: { total: 9, submitted: 2, underReview: 3, interviewPending: 0, accepted: 0, rejected: 0, capacity: 20, ratio: 0 } }),
  ),
  http.get('*/leader/recruitments/1/interview-rounds', () =>
    HttpResponse.json({ ok: true, message: null, data: [
      { roundId: 7, title: '1차 면접', status: 'ASSIGNING', availabilityDeadline: null, location: null, totalMemberCount: 0, respondedMemberCount: 0 },
    ] }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useClubActionItems', () => {
  it('총 건수 + 정렬된 미리보기(최대 3) 반환', async () => {
    const { result } = renderHook(() => useClubActionItems(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // 검토 대기(5) + 미확정 라운드(7) = 2건
    expect(result.current.totalCount).toBe(2);
    expect(result.current.preview.length).toBeLessThanOrEqual(3);
    // 기한 없음 → 타입 우선순위로 미확정 라운드가 먼저
    expect(result.current.preview[0].type).toBe('INTERVIEW_ROUND_UNCONFIRMED');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardActionItems.test.tsx --run`
Expected: FAIL — `useClubActionItems` not exported

- [ ] **Step 3: 구현**

`packages/hooks/src/dashboard.ts`에 추가:

```ts
import type { ActionItem, InterviewRoundSummary } from '@duing/types';
import { interviewRoundKeys } from './interviewRoundQueryKeys';
import {
  ACTION_ITEM_PREVIEW_COUNT,
  buildActionItems,
  sortActionItems,
  type RecruitmentDashboardInput,
} from './dashboardSelectors';
```

```ts
/** 카드1: 처리 필요 업무 — 총 건수 + 정렬된 상위 미리보기 */
export function useClubActionItems(clubId: number | undefined): {
  items: ActionItem[];
  preview: ActionItem[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const recruitments = useActiveRecruitments(clubId);
  const list = recruitments.data ?? [];
  const ids = list.map((r) => r.id);

  const statsQueries = useQueries({
    queries: ids.map((recruitmentId) => ({
      queryKey: recruitmentQueryKeys.statsSummary(recruitmentId),
      queryFn: () => client.stats.summary(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
  });

  const roundsQueries = useQueries({
    queries: ids.map((recruitmentId) => ({
      queryKey: interviewRoundKeys.list(recruitmentId),
      queryFn: () => client.interviewRounds.list(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
  });

  const items = useMemo(() => {
    const inputs: RecruitmentDashboardInput[] = list.map((recruitment, index) => ({
      recruitment,
      stats: statsQueries[index]?.data as StatsSummary | undefined,
      rounds: roundsQueries[index]?.data as InterviewRoundSummary[] | undefined,
    }));
    return sortActionItems(buildActionItems(inputs, new Date()));
  }, [list, statsQueries, roundsQueries]);

  return {
    items,
    preview: items.slice(0, ACTION_ITEM_PREVIEW_COUNT),
    totalCount: items.length,
    isLoading: recruitments.isLoading || statsQueries.some((q) => q.isLoading) || roundsQueries.some((q) => q.isLoading),
    isError: recruitments.isError || statsQueries.some((q) => q.isError) || roundsQueries.some((q) => q.isError),
  };
}
```

`index.ts`의 대시보드 export에 `useClubActionItems` 추가.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardActionItems.test.tsx --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/hooks/src/dashboard.ts packages/hooks/src/index.ts packages/hooks/test/dashboardActionItems.test.tsx
git commit -m "feat(hooks): useClubActionItems (처리 필요 업무)"
```

---

## Task 8: `useTodaySchedule` 훅 (카드4)

**Files:**
- Modify: `packages/hooks/src/dashboard.ts`, `packages/hooks/src/index.ts`
- Test: `packages/hooks/test/dashboardTodaySchedule.test.tsx`

> 2단계 fan-out: 진행 중 모집 → 라운드 목록에서 `SCHEDULED` 라운드 추출 → 라운드 상세(slots) 취득. 오늘(KST) slot(assignedCount>0) + 오늘 클럽 이벤트를 병합·정렬.

- [ ] **Step 1: 실패 테스트 작성**

`packages/hooks/test/dashboardTodaySchedule.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useTodaySchedule } from '../src/dashboard';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (<ApiClientProvider client={apiClient}><QueryClientProvider client={qc}>{children}</QueryClientProvider></ApiClientProvider>);
  };
}
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

// 테스트는 '오늘'이 동적이므로, 이벤트/슬롯 시작시각을 KST 오늘로 만들기 위해 today 기준 ISO를 생성한다.
function kstTodayAt(hour: number): string {
  const todayKst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  return `${todayKst}T${String(hour).padStart(2, '0')}:00:00+09:00`;
}

const server = setupServer(
  http.get('*/clubs/10/recruitments', () =>
    HttpResponse.json({ ok: true, message: null, data: [
      { id: 1, clubId: 10, clubName: '두잉', title: '봄 모집', startDate: '2026-06-01', endDate: '2026-12-30',
        capacity: 20, status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
        applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER' },
    ] }),
  ),
  http.get('*/leader/recruitments/1/interview-rounds', () =>
    HttpResponse.json({ ok: true, message: null, data: [
      { roundId: 7, title: '1차 면접', status: 'SCHEDULED', availabilityDeadline: null, location: '301호', totalMemberCount: 5, respondedMemberCount: 5 },
    ] }),
  ),
  http.get('*/leader/interview-rounds/7', () =>
    HttpResponse.json({ ok: true, message: null, data: {
      roundId: 7, title: '1차 면접', status: 'SCHEDULED', availabilityDeadline: null, location: '301호',
      requestSequence: 1, deadlinePassed: false, counts: {}, members: [],
      slots: [{ slotId: 1, startTime: kstTodayAt(14), endTime: kstTodayAt(15), capacity: 3, selectedCount: 3, assignedCount: 3 }],
    } }),
  ),
  http.get('*/clubs/10/events', () =>
    HttpResponse.json({ ok: true, message: null, data: [
      { id: 50, title: '정기모임', startAt: kstTodayAt(14), endAt: kstTodayAt(16), location: '동방' },
    ] }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useTodaySchedule', () => {
  it('오늘 면접 슬롯 + 이벤트를 병합하고 동일시간 면접 우선 정렬', async () => {
    const { result } = renderHook(() => useTodaySchedule(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toHaveLength(2);
    // 14:00 동일 → 면접이 먼저
    expect(result.current.items[0].kind).toBe('INTERVIEW');
    expect(result.current.items[0].roundId).toBe(7);
    expect(result.current.items[1].kind).toBe('EVENT');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardTodaySchedule.test.tsx --run`
Expected: FAIL — `useTodaySchedule` not exported

- [ ] **Step 3: 구현**

`packages/hooks/src/dashboard.ts`에 추가:

```ts
import type { ClubEventCard, InterviewRoundDetail, TodayScheduleItem } from '@duing/types';
import { dashboardQueryKeys } from './dashboardQueryKeys';
import { isTodayKst, todayKstDateString } from './dashboardDate';
import { sortTodaySchedule } from './dashboardSelectors';
```

```ts
/** 카드4: 오늘 일정 — 오늘 면접 슬롯 + 오늘 클럽 이벤트 */
export function useTodaySchedule(clubId: number | undefined): {
  items: TodayScheduleItem[];
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const now = new Date();
  const today = todayKstDateString(now);

  const recruitments = useActiveRecruitments(clubId);
  const recruitmentIds = (recruitments.data ?? []).map((r) => r.id);

  const roundsQueries = useQueries({
    queries: recruitmentIds.map((recruitmentId) => ({
      queryKey: interviewRoundKeys.list(recruitmentId),
      queryFn: () => client.interviewRounds.list(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
  });

  const scheduledRoundIds = useMemo(() => {
    const ids: number[] = [];
    for (const query of roundsQueries) {
      for (const round of (query.data as InterviewRoundSummary[] | undefined) ?? []) {
        if (round.status === 'SCHEDULED') ids.push(round.roundId);
      }
    }
    return ids;
  }, [roundsQueries]);

  const detailQueries = useQueries({
    queries: scheduledRoundIds.map((roundId) => ({
      queryKey: interviewRoundKeys.detail(roundId),
      queryFn: () => client.interviewRounds.detail(roundId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
  });

  const eventsQuery = useQuery({
    queryKey: clubId !== undefined ? dashboardQueryKeys.todayEvents(clubId, today) : ['dashboard', undefined, 'today-events'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubEvents.list(clubId, { from: today, to: today });
    },
    enabled: clubId !== undefined,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  // SCHEDULED 라운드 상세에서 오늘·배정된 슬롯 → 면접 아이템 매핑을 위해
  // 라운드 메타(recruitmentId)가 필요하므로 round→recruitment 매핑을 만든다.
  const roundMeta = useMemo(() => {
    const map = new Map<number, { recruitmentId: number; title: string }>();
    recruitmentIds.forEach((recruitmentId, index) => {
      for (const round of (roundsQueries[index]?.data as InterviewRoundSummary[] | undefined) ?? []) {
        map.set(round.roundId, { recruitmentId, title: round.title });
      }
    });
    return map;
  }, [recruitmentIds, roundsQueries]);

  const items = useMemo(() => {
    const interviewItems: TodayScheduleItem[] = [];
    for (const query of detailQueries) {
      const detail = query.data as InterviewRoundDetail | undefined;
      if (!detail) continue;
      const meta = roundMeta.get(detail.roundId);
      for (const slot of detail.slots) {
        if (slot.assignedCount > 0 && isTodayKst(slot.startTime, now)) {
          interviewItems.push({
            kind: 'INTERVIEW',
            title: detail.title,
            startAt: slot.startTime,
            endAt: slot.endTime,
            location: detail.location,
            recruitmentId: meta?.recruitmentId,
            roundId: detail.roundId,
          });
        }
      }
    }

    const eventItems: TodayScheduleItem[] = ((eventsQuery.data as ClubEventCard[] | undefined) ?? [])
      .filter((event) => isTodayKst(event.startAt, now))
      .map((event) => ({
        kind: 'EVENT',
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        location: event.location,
        eventId: event.id,
      }));

    return sortTodaySchedule([...interviewItems, ...eventItems]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQueries, eventsQuery.data, roundMeta]);

  return {
    items,
    isLoading: recruitments.isLoading || roundsQueries.some((q) => q.isLoading) || detailQueries.some((q) => q.isLoading) || eventsQuery.isLoading,
    isError: recruitments.isError || roundsQueries.some((q) => q.isError) || detailQueries.some((q) => q.isError) || eventsQuery.isError,
  };
}
```

`index.ts`의 대시보드 export에 `useTodaySchedule` 추가.

> **사전 점검:** events 쿼리는 `dashboardQueryKeys.todayEvents`를 키로 사용한다(별도 `clubEventQueryKeys` 불필요). `interviewRoundKeys.detail`은 존재함(grounding 확인).

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardTodaySchedule.test.tsx --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/hooks/src/dashboard.ts packages/hooks/src/index.ts packages/hooks/test/dashboardTodaySchedule.test.tsx
git commit -m "feat(hooks): useTodaySchedule (오늘 일정)"
```

---

## Task 9: `useClubFeedCounts` 훅 (카드5)

**Files:**
- Modify: `packages/hooks/src/dashboard.ts`, `packages/hooks/src/index.ts`
- Test: `packages/hooks/test/dashboardFeedCounts.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`packages/hooks/test/dashboardFeedCounts.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useClubFeedCounts } from '../src/dashboard';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (<ApiClientProvider client={apiClient}><QueryClientProvider client={qc}>{children}</QueryClientProvider></ApiClientProvider>);
  };
}
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const server = setupServer(
  http.get('*/clubs/10/notices', () =>
    HttpResponse.json({ ok: true, message: null, data: { content: [], page: 0, size: 1, totalElements: 7, totalPages: 7, hasNext: true } }),
  ),
  http.get('*/clubs/10/events', () =>
    HttpResponse.json({ ok: true, message: null, data: [{ id: 1, title: 'a', startAt: '2026-06-12T05:00:00Z', endAt: null, location: null }, { id: 2, title: 'b', startAt: '2026-06-13T05:00:00Z', endAt: null, location: null }] }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useClubFeedCounts', () => {
  it('공지 총건수와 이벤트 건수를 반환', async () => {
    const { result } = renderHook(() => useClubFeedCounts(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.noticeCount).toBe(7);
    expect(result.current.eventCount).toBe(2);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardFeedCounts.test.tsx --run`
Expected: FAIL

- [ ] **Step 3: 구현**

`packages/hooks/src/dashboard.ts`에 추가:

```ts
/** 카드5: 공지·일정 카운트(딥링크 카드용) */
export function useClubFeedCounts(clubId: number | undefined): {
  noticeCount: number;
  eventCount: number;
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const enabled = clubId !== undefined;

  const noticesQuery = useQuery({
    queryKey: enabled ? dashboardQueryKeys.feedCounts(clubId) : ['dashboard', undefined, 'feed-counts'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubNotices.listForClub(clubId, { page: 0, size: 1 });
    },
    enabled,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const eventsQuery = useQuery({
    queryKey: enabled ? [...dashboardQueryKeys.all, clubId, 'event-count'] : ['dashboard', undefined, 'event-count'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubEvents.list(clubId);
    },
    enabled,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  return {
    noticeCount: noticesQuery.data?.totalElements ?? 0,
    eventCount: eventsQuery.data?.length ?? 0,
    isLoading: noticesQuery.isLoading || eventsQuery.isLoading,
    isError: noticesQuery.isError || eventsQuery.isError,
  };
}
```

`index.ts`의 대시보드 export에 `useClubFeedCounts` 추가.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/hooks test packages/hooks/test/dashboardFeedCounts.test.tsx --run`
Expected: PASS

- [ ] **Step 5: 훅 패키지 전체 점검 + Commit**

Run: `pnpm --filter @duing/hooks test --run && pnpm --filter @duing/hooks typecheck`
Expected: 전체 PASS

```bash
git add packages/hooks/src/dashboard.ts packages/hooks/src/index.ts packages/hooks/test/dashboardFeedCounts.test.tsx
git commit -m "feat(hooks): useClubFeedCounts (공지·일정 카운트)"
```

---

## Task 10: 라벨 맵 + 공용 `DashboardCard` 셸

**Files:**
- Create: `apps/web/app/manage/_components/dashboard/dashboard-labels.ts`
- Create: `apps/web/app/manage/_components/dashboard/DashboardCard.tsx`
- Test: `apps/web/test/manage/DashboardCard.test.tsx`

- [ ] **Step 1: 라벨 맵 작성**

`apps/web/app/manage/_components/dashboard/dashboard-labels.ts`:

```ts
import type { ActionItemType, RecruitmentDisplayStatus } from '@duing/types';

export const ACTION_ITEM_TYPE_LABEL: Record<ActionItemType, string> = {
  APPLICANTS_AWAITING_REVIEW: '검토 대기 지원자',
  INTERVIEW_ROUND_UNCONFIRMED: '면접 일정 미확정',
  INTERVIEW_RESPONSE_UNCOLLECTED: '면접 응답 미수집',
  INTERVIEW_RESULT_PENDING: '면접 결과 미확정',
  RECRUITMENT_CLOSING_SOON: '모집 마감 임박',
};

export const RECRUITMENT_DISPLAY_STATUS_LABEL: Record<RecruitmentDisplayStatus, string> = {
  UPCOMING: '예정',
  OPEN: '모집중',
  ALWAYS_OPEN: '상시모집',
  CLOSED: '마감',
};

export const RECRUITMENT_DISPLAY_STATUS_BADGE: Record<RecruitmentDisplayStatus, string> = {
  UPCOMING: 'bg-amber-100 text-amber-700',
  OPEN: 'bg-emerald-100 text-emerald-700',
  ALWAYS_OPEN: 'bg-sky-100 text-sky-700',
  CLOSED: 'bg-slate-100 text-slate-600',
};
```

- [ ] **Step 2: 실패 테스트 작성**

`apps/web/test/manage/DashboardCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { DashboardCard } from '@/manage/_components/dashboard/DashboardCard';

describe('DashboardCard', () => {
  it('로딩 상태를 표시한다', () => {
    render(<DashboardCard title="처리 필요 업무" isLoading emptyText="없음"><div>내용</div></DashboardCard>);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
    expect(screen.queryByText('내용')).not.toBeInTheDocument();
  });

  it('빈 상태를 표시한다', () => {
    render(<DashboardCard title="오늘 일정" isEmpty emptyText="오늘 일정이 없어요"><div>내용</div></DashboardCard>);
    expect(screen.getByText('오늘 일정이 없어요')).toBeInTheDocument();
    expect(screen.queryByText('내용')).not.toBeInTheDocument();
  });

  it('정상 상태에서 children과 badge를 표시한다', () => {
    render(<DashboardCard title="처리 필요 업무" badge={<span>3</span>} emptyText="없음"><div>내용</div></DashboardCard>);
    expect(screen.getByText('처리 필요 업무')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('내용')).toBeInTheDocument();
  });
});
```

> `@/` 별칭은 `apps/web/vitest.config.ts`에서 app 루트로 매핑됨(grounding 확인). 경로는 `@/manage/...`.

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @duing/web test test/manage/DashboardCard.test.tsx --run`
Expected: FAIL — module not found

- [ ] **Step 4: 구현**

`apps/web/app/manage/_components/dashboard/DashboardCard.tsx`:

```tsx
import type { ReactNode } from 'react';

interface DashboardCardProps {
  title: string;
  badge?: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyText: string;
  children?: ReactNode;
  footer?: ReactNode;
}

export function DashboardCard({ title, badge, isLoading, isEmpty, emptyText, children, footer }: DashboardCardProps) {
  return (
    <section className="card rounded-lg border border-line bg-paper p-4 transition hover:shadow-2">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
        {badge}
      </header>
      {isLoading ? (
        <p className="py-6 text-center text-sm text-charcoal-3">불러오는 중…</p>
      ) : isEmpty ? (
        <p className="rounded-md bg-graysoft py-6 text-center text-sm text-charcoal-3">{emptyText}</p>
      ) : (
        children
      )}
      {!isLoading && !isEmpty && footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @duing/web test test/manage/DashboardCard.test.tsx --run`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/manage/_components/dashboard/dashboard-labels.ts apps/web/app/manage/_components/dashboard/DashboardCard.tsx apps/web/test/manage/DashboardCard.test.tsx
git commit -m "feat(web): 대시보드 공용 카드 셸 + 라벨 맵"
```

---

## Task 11: ActionItemsCard (카드1)

**Files:**
- Create: `apps/web/app/manage/_components/dashboard/ActionItemsCard.tsx`
- Test: `apps/web/test/manage/ActionItemsCard.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/test/manage/ActionItemsCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { ActionItem } from '@duing/types';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const mockUse = vi.fn();
vi.mock('@duing/hooks', () => ({ useClubActionItems: (clubId: number) => mockUse(clubId) }));

import { ActionItemsCard } from '@/manage/_components/dashboard/ActionItemsCard';

describe('ActionItemsCard', () => {
  it('총 건수 배지와 상위 미리보기를 렌더한다', () => {
    const items: ActionItem[] = [
      { type: 'INTERVIEW_ROUND_UNCONFIRMED', recruitmentId: 1, recruitmentTitle: '봄 모집', roundId: 7, roundTitle: '1차' },
      { type: 'APPLICANTS_AWAITING_REVIEW', recruitmentId: 1, recruitmentTitle: '봄 모집', count: 5 },
    ];
    mockUse.mockReturnValue({ items, preview: items, totalCount: 2, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    expect(screen.getByText('처리 필요 업무')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('면접 일정 미확정')).toBeInTheDocument();
    expect(screen.getByText('검토 대기 지원자')).toBeInTheDocument();
  });

  it('업무가 없으면 Empty State', () => {
    mockUse.mockReturnValue({ items: [], preview: [], totalCount: 0, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    expect(screen.getByText('처리할 업무가 없어요')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test test/manage/ActionItemsCard.test.tsx --run`
Expected: FAIL — module not found

- [ ] **Step 3: 구현**

`apps/web/app/manage/_components/dashboard/ActionItemsCard.tsx`:

```tsx
'use client';

import Link from 'next/link';
import type { ActionItem } from '@duing/types';
import { useClubActionItems } from '@duing/hooks';
import { toRoute } from '@/_lib/route';
import { DashboardCard } from './DashboardCard';
import { ACTION_ITEM_TYPE_LABEL } from './dashboard-labels';

function hrefFor(clubId: number, item: ActionItem): `/${string}` {
  switch (item.type) {
    case 'INTERVIEW_ROUND_UNCONFIRMED':
    case 'INTERVIEW_RESPONSE_UNCOLLECTED':
      return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/interview/rounds/${item.roundId}`;
    case 'APPLICANTS_AWAITING_REVIEW':
    case 'INTERVIEW_RESULT_PENDING':
      return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/applicants`;
    case 'RECRUITMENT_CLOSING_SOON':
      return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}`;
  }
}

function contextText(item: ActionItem): string {
  const parts = [item.recruitmentTitle];
  if (item.roundTitle) parts.push(item.roundTitle);
  if (item.count !== undefined) parts.push(`${item.count}명`);
  if (item.daysLeft !== undefined) parts.push(item.daysLeft < 0 ? `${-item.daysLeft}일 경과` : `D-${item.daysLeft}`);
  return parts.join(' · ');
}

export function ActionItemsCard({ clubId }: { clubId: number }) {
  const { preview, totalCount, isLoading } = useClubActionItems(clubId);

  return (
    <DashboardCard
      title="처리 필요 업무"
      badge={totalCount > 0 ? <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-paper">{totalCount}</span> : undefined}
      isLoading={isLoading}
      isEmpty={!isLoading && totalCount === 0}
      emptyText="처리할 업무가 없어요"
      footer={totalCount > preview.length ? <p className="text-xs text-charcoal-3">전체 {totalCount}건</p> : undefined}
    >
      <ul className="flex flex-col gap-2">
        {preview.map((item, index) => (
          <li key={`${item.type}-${item.recruitmentId}-${item.roundId ?? index}`}>
            <Link
              href={toRoute(hrefFor(clubId, item))}
              className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition hover:bg-sage-tint"
            >
              <span className="font-medium text-charcoal">{ACTION_ITEM_TYPE_LABEL[item.type]}</span>
              <span className="ml-3 truncate text-xs text-charcoal-3">{contextText(item)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test test/manage/ActionItemsCard.test.tsx --run`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage/_components/dashboard/ActionItemsCard.tsx apps/web/test/manage/ActionItemsCard.test.tsx
git commit -m "feat(web): 처리 필요 업무 카드"
```

---

## Task 12: ActiveRecruitmentsCard (카드2)

**Files:**
- Create: `apps/web/app/manage/_components/dashboard/ActiveRecruitmentsCard.tsx`

- [ ] **Step 1: 구현**

`apps/web/app/manage/_components/dashboard/ActiveRecruitmentsCard.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useActiveRecruitments } from '@duing/hooks';
import { toRoute } from '@/_lib/route';
import { DashboardCard } from './DashboardCard';
import { RECRUITMENT_DISPLAY_STATUS_BADGE, RECRUITMENT_DISPLAY_STATUS_LABEL } from './dashboard-labels';

export function ActiveRecruitmentsCard({ clubId }: { clubId: number }) {
  const { data, isLoading } = useActiveRecruitments(clubId);
  const recruitments = data ?? [];

  return (
    <DashboardCard
      title="진행 중 모집"
      badge={recruitments.length > 0 ? <span className="text-xs text-charcoal-3">{recruitments.length}건</span> : undefined}
      isLoading={isLoading}
      isEmpty={!isLoading && recruitments.length === 0}
      emptyText="진행 중인 모집이 없어요"
    >
      <ul className="flex flex-col gap-2">
        {recruitments.map((recruitment) => (
          <li key={recruitment.id}>
            <Link
              href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}`)}
              className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition hover:bg-sage-tint"
            >
              <span className="truncate font-medium text-charcoal">{recruitment.title}</span>
              <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RECRUITMENT_DISPLAY_STATUS_BADGE[recruitment.displayStatus]}`}>
                {RECRUITMENT_DISPLAY_STATUS_LABEL[recruitment.displayStatus]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @duing/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/manage/_components/dashboard/ActiveRecruitmentsCard.tsx
git commit -m "feat(web): 진행 중 모집 카드"
```

---

## Task 13: ApplicantSummaryCard (카드3)

**Files:**
- Create: `apps/web/app/manage/_components/dashboard/ApplicantSummaryCard.tsx`

- [ ] **Step 1: 구현**

`apps/web/app/manage/_components/dashboard/ApplicantSummaryCard.tsx` — `SummaryCards` 그리드 패턴을 미러링:

```tsx
'use client';

import Link from 'next/link';
import { useApplicantSummary } from '@duing/hooks';
import { toRoute } from '@/_lib/route';
import { DashboardCard } from './DashboardCard';

export function ApplicantSummaryCard({ clubId }: { clubId: number }) {
  const { totals, isLoading } = useApplicantSummary(clubId);

  const cards: Array<{ label: string; value: number }> = [
    { label: '접수', value: totals.submitted },
    { label: '검토중', value: totals.underReview },
    { label: '면접대기', value: totals.interviewPending },
    { label: '합격', value: totals.accepted },
    { label: '불합격', value: totals.rejected },
  ];

  return (
    <DashboardCard
      title="지원자 현황"
      badge={<span className="text-xs text-charcoal-3">총 {totals.total}명</span>}
      isLoading={isLoading}
      isEmpty={!isLoading && totals.total === 0}
      emptyText="집계할 지원자 데이터가 없어요"
      footer={
        <Link href={toRoute(`/manage/clubs/${clubId}/recruitments`)} className="text-xs font-medium text-ink hover:underline">
          모집별 통계 보기 →
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-md border border-line bg-paper p-2 text-center">
            <p className="text-xs text-charcoal-3">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-charcoal">{card.value}</p>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
```

- [ ] **Step 2: 타입체크 + Commit**

Run: `pnpm --filter @duing/web typecheck`
Expected: PASS

```bash
git add apps/web/app/manage/_components/dashboard/ApplicantSummaryCard.tsx
git commit -m "feat(web): 지원자 현황 카드"
```

---

## Task 14: TodayScheduleCard (카드4)

**Files:**
- Create: `apps/web/app/manage/_components/dashboard/TodayScheduleCard.tsx`

- [ ] **Step 1: 구현**

`apps/web/app/manage/_components/dashboard/TodayScheduleCard.tsx`:

```tsx
'use client';

import Link from 'next/link';
import type { TodayScheduleItem } from '@duing/types';
import { useTodaySchedule } from '@duing/hooks';
import { toRoute } from '@/_lib/route';
import { DashboardCard } from './DashboardCard';

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function ScheduleRow({ clubId, item }: { clubId: number; item: TodayScheduleItem }) {
  const label = (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs font-semibold text-charcoal-2">{formatTime(item.startAt)}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${item.kind === 'INTERVIEW' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
        {item.kind === 'INTERVIEW' ? '면접' : '행사'}
      </span>
      <span className="truncate text-sm text-charcoal">{item.title}</span>
    </div>
  );

  if (item.kind === 'INTERVIEW' && item.recruitmentId && item.roundId) {
    return (
      <Link
        href={toRoute(`/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/interview/rounds/${item.roundId}`)}
        className="block rounded-md px-2 py-2 transition hover:bg-sage-tint"
      >
        {label}
      </Link>
    );
  }
  return <div className="px-2 py-2">{label}</div>;
}

export function TodayScheduleCard({ clubId }: { clubId: number }) {
  const { items, isLoading } = useTodaySchedule(clubId);

  return (
    <DashboardCard
      title="오늘 일정"
      badge={items.length > 0 ? <span className="text-xs text-charcoal-3">{items.length}건</span> : undefined}
      isLoading={isLoading}
      isEmpty={!isLoading && items.length === 0}
      emptyText="오늘 일정이 없어요"
    >
      <ul className="flex flex-col gap-1">
        {items.map((item, index) => (
          <li key={`${item.kind}-${item.roundId ?? item.eventId ?? index}-${item.startAt}`}>
            <ScheduleRow clubId={clubId} item={item} />
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
```

- [ ] **Step 2: 타입체크 + Commit**

Run: `pnpm --filter @duing/web typecheck`
Expected: PASS

```bash
git add apps/web/app/manage/_components/dashboard/TodayScheduleCard.tsx
git commit -m "feat(web): 오늘 일정 카드"
```

---

## Task 15: ClubFeedLinkCard (카드5)

**Files:**
- Create: `apps/web/app/manage/_components/dashboard/ClubFeedLinkCard.tsx`

- [ ] **Step 1: 구현**

`apps/web/app/manage/_components/dashboard/ClubFeedLinkCard.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useClubFeedCounts } from '@duing/hooks';
import { toRoute } from '@/_lib/route';
import { DashboardCard } from './DashboardCard';

export function ClubFeedLinkCard({ clubId }: { clubId: number }) {
  const { noticeCount, eventCount, isLoading } = useClubFeedCounts(clubId);
  const isEmpty = noticeCount === 0 && eventCount === 0;

  return (
    <DashboardCard
      title="공지 · 일정"
      isLoading={isLoading}
      emptyText=""
      footer={
        <Link href={toRoute(`/clubs/${clubId}`)} className="text-xs font-medium text-ink hover:underline">
          동아리 페이지 바로가기 →
        </Link>
      }
    >
      {isEmpty ? (
        <p className="text-sm text-charcoal-3">아직 공지·일정이 없어요</p>
      ) : (
        <p className="text-sm text-charcoal">
          공지 <span className="font-semibold">{noticeCount}</span> · 일정 <span className="font-semibold">{eventCount}</span>
        </p>
      )}
    </DashboardCard>
  );
}
```

> 카드5는 딥링크가 핵심이므로 `isEmpty`를 `DashboardCard`에 넘기지 않는다 — 공지·일정 0이어도 **바로가기 footer는 항상 노출**되고, 본문만 Empty 문구로 대체된다(사양: 바로가기 링크 유지).

- [ ] **Step 2: 타입체크 + Commit**

Run: `pnpm --filter @duing/web typecheck`
Expected: PASS

```bash
git add apps/web/app/manage/_components/dashboard/ClubFeedLinkCard.tsx
git commit -m "feat(web): 공지·일정 딥링크 카드"
```

---

## Task 16: DashboardClubSwitcher (동아리 전환기)

**Files:**
- Create: `apps/web/app/manage/_components/dashboard/DashboardClubSwitcher.tsx`

- [ ] **Step 1: 구현**

`apps/web/app/manage/_components/dashboard/DashboardClubSwitcher.tsx` — `?clubId=`를 `router.replace`로 갱신(페이지 유지):

```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ManagedClub } from '@duing/types';

export function DashboardClubSwitcher({ managedClubs, selectedClubId }: { managedClubs: ManagedClub[]; selectedClubId: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (managedClubs.length <= 1) {
    const only = managedClubs[0];
    return <span className="text-sm font-semibold text-charcoal">{only?.clubName ?? ''}</span>;
  }

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('clubId', event.target.value);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={selectedClubId}
      onChange={handleChange}
      className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal focus:border-sage focus:outline-none"
    >
      {managedClubs.map((club) => (
        <option key={club.clubId} value={club.clubId}>{club.clubName}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: 타입체크 + Commit**

Run: `pnpm --filter @duing/web typecheck`
Expected: PASS

```bash
git add apps/web/app/manage/_components/dashboard/DashboardClubSwitcher.tsx
git commit -m "feat(web): 대시보드 동아리 전환기"
```

---

## Task 17: 대시보드 페이지 조립 + `/manage` 교체

**Files:**
- Create: `apps/web/app/manage/_pages/OperatorMainDashboardPage.tsx`
- Modify: `apps/web/app/manage/page.tsx`
- Test: `apps/web/test/manage/OperatorMainDashboardPage.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/test/manage/OperatorMainDashboardPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/manage',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const managed = [{ clubId: 10, clubName: '두잉', logoUrl: null, myRole: 'LEADER', activeRecruitmentCount: 1 }];
vi.mock('@duing/hooks', () => ({
  useManagedClubsQuery: () => ({ data: managed, isLoading: false }),
  useClubActionItems: () => ({ items: [], preview: [], totalCount: 0, isLoading: false, isError: false }),
  useActiveRecruitments: () => ({ data: [], isLoading: false }),
  useApplicantSummary: () => ({ totals: { total: 0, submitted: 0, underReview: 0, interviewPending: 0, accepted: 0, rejected: 0, capacity: 0 }, isLoading: false, isError: false }),
  useTodaySchedule: () => ({ items: [], isLoading: false, isError: false }),
  useClubFeedCounts: () => ({ noticeCount: 0, eventCount: 0, isLoading: false, isError: false }),
}));

import { OperatorMainDashboardPage } from '@/manage/_pages/OperatorMainDashboardPage';

describe('OperatorMainDashboardPage', () => {
  it('관리 동아리가 있으면 5개 카드 제목을 렌더한다', () => {
    render(<OperatorMainDashboardPage />);
    expect(screen.getByText('처리 필요 업무')).toBeInTheDocument();
    expect(screen.getByText('진행 중 모집')).toBeInTheDocument();
    expect(screen.getByText('지원자 현황')).toBeInTheDocument();
    expect(screen.getByText('오늘 일정')).toBeInTheDocument();
    expect(screen.getByText('공지 · 일정')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test test/manage/OperatorMainDashboardPage.test.tsx --run`
Expected: FAIL — module not found

- [ ] **Step 3: 페이지 컴포넌트 구현**

`apps/web/app/manage/_pages/OperatorMainDashboardPage.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useManagedClubsQuery } from '@duing/hooks';
import { toRoute } from '@/_lib/route';
import { ActionItemsCard } from '../_components/dashboard/ActionItemsCard';
import { ActiveRecruitmentsCard } from '../_components/dashboard/ActiveRecruitmentsCard';
import { ApplicantSummaryCard } from '../_components/dashboard/ApplicantSummaryCard';
import { TodayScheduleCard } from '../_components/dashboard/TodayScheduleCard';
import { ClubFeedLinkCard } from '../_components/dashboard/ClubFeedLinkCard';
import { DashboardClubSwitcher } from '../_components/dashboard/DashboardClubSwitcher';

export function OperatorMainDashboardPage() {
  const searchParams = useSearchParams();
  const { data: managedClubs, isLoading } = useManagedClubsQuery();

  if (isLoading) {
    return (
      <div className="duing flex min-h-screen items-center justify-center bg-cream">
        <p className="text-sm text-charcoal-3">불러오는 중…</p>
      </div>
    );
  }

  if (!managedClubs || managedClubs.length === 0) {
    return (
      <div className="duing flex min-h-screen flex-col items-center justify-center gap-4 bg-cream">
        <p className="text-charcoal-2">관리하는 동아리가 없습니다.</p>
        <Link href={toRoute('/')} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-sage">홈으로 돌아가기</Link>
      </div>
    );
  }

  const requested = Number(searchParams.get('clubId'));
  const selected = managedClubs.find((club) => club.clubId === requested) ?? managedClubs[0];
  const clubId = selected.clubId;

  return (
    <div className="duing min-h-screen bg-cream px-5 py-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-ink-deep">운영 대시보드</h1>
          <DashboardClubSwitcher managedClubs={managedClubs} selectedClubId={clubId} />
        </div>
        <Link href={toRoute(`/manage/clubs/${clubId}`)} className="text-sm font-medium text-ink hover:underline">
          이 동아리 관리 →
        </Link>
      </header>

      <div className="mb-4">
        <ActionItemsCard clubId={clubId} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ActiveRecruitmentsCard clubId={clubId} />
        <ApplicantSummaryCard clubId={clubId} />
        <TodayScheduleCard clubId={clubId} />
        <ClubFeedLinkCard clubId={clubId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `/manage` 진입점 교체**

`apps/web/app/manage/page.tsx` 전체를 교체:

```tsx
import { OperatorMainDashboardPage } from './_pages/OperatorMainDashboardPage';

export default function ManagePage() {
  return <OperatorMainDashboardPage />;
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @duing/web test test/manage/OperatorMainDashboardPage.test.tsx --run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/manage/_pages/OperatorMainDashboardPage.tsx apps/web/app/manage/page.tsx apps/web/test/manage/OperatorMainDashboardPage.test.tsx
git commit -m "feat(web): 운영자 메인 대시보드 페이지 + /manage 교체"
```

---

## Task 18: 전체 검증

**Files:** 없음(검증/커밋만)

- [ ] **Step 1: 전체 타입체크**

Run: `pnpm typecheck`
Expected: 전체 PASS

- [ ] **Step 2: 전체 테스트**

Run: `pnpm test`
Expected: 전체 PASS

- [ ] **Step 3: 웹 린트**

Run: `pnpm --filter @duing/web lint`
Expected: PASS (또는 자동 수정 후 PASS)

- [ ] **Step 4: 수동 확인 체크리스트(로컬 dev)**

- `/manage` 진입 → 첫 관리 동아리 대시보드 표시
- 동아리 2개 이상 계정: 전환기 변경 시 `?clubId=` 갱신 + 카드 데이터 갱신
- 각 카드 Empty State 노출(데이터 없는 동아리)
- 처리 필요 업무 배지 숫자 = 미리보기+전체 일치, 항목 클릭 딥링크 정상
- 오늘 일정 시간순 + 동일시간 면접 우선

- [ ] **Step 5: 잔여 변경 커밋(있으면)**

```bash
git add -A
git commit -m "chore(web): 운영자 대시보드 린트/타입 정리"
```

---

## 사양 커버리지 (self-review)

| 사양 요구 | 구현 태스크 |
|---|---|
| 단일 선택 동아리(`?clubId=`, 기본 첫 동아리) | T16, T17 |
| 카드1 총 건수 + 상위 3개 미리보기 | T3(정렬/슬라이스), T7, T11 |
| 카드1 업무 5종(결과 미발표=근사) | T3, T7 |
| 카드2 진행 중 = CLOSED 제외 | T5, T12 |
| 카드3 단계별 합산 | T6, T13 |
| 카드4 면접+이벤트, 시간순·면접 우선 | T3(sortTodaySchedule), T8, T14 |
| 카드5 "공지 · 일정" 딥링크 | T9, T15 |
| 모든 카드 Empty State | T10(셸), T11~T15 |
| Query staleTime 60초/gcTime 5분 | T5(`DASHBOARD_QUERY_OPTIONS`) 공유 |
| `/manage` 리다이렉트 제거·교체 | T17 |
| Out of scope(신규 BE API, 작성 UI, 멀티클럽 집계, SSE) | 본 plan 미포함(v2) |

## 실행 핸드오프

구현 시 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`로 태스크 단위 진행. 각 태스크의 검증 커맨드 출력으로 완료를 확인한 뒤 다음 태스크로 넘어간다.

# Plan C — 학생측 동아리 상세 탭 + 메타 표시 활성화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan A/B 로 들어온 메타 필드를 학생측 동아리 상세 페이지에 노출하고, 원본 디자인의 Underline Tabs (소개/활동/Q&A/동아리 상세정보)를 복원한다. 빈 탭은 자동 숨김.

**Architecture:** (1) `ClubDetailHero` 에 창설년/기수 라인, (2) 신규 `ClubDetailStats` (활동/창설년 셀), (3) 신규 `ClubDetailTabs` (4탭 클라이언트 useState, 빈 탭 자동 숨김), (4) `ClubRecruitmentCard` 에 면접 일정·지원자 수 행, (5) `ClubContactCard` 에 위치·이메일 행, (6) `page.tsx` 재조립.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-19-club-scalar-metadata-and-interview-fields-design.md` §6 (학생측 표시), §1 (Underline Tabs).

**Prerequisite:** Plan A·B 머지 완료. 타입과 응답에 새 필드가 모두 있어야 한다.

**Branch:** `feat/club-detail-tabs-and-display`

---

## File Structure

**Create:**
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailStats.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailQna.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailInfoList.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailActivity.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_lib/activeDaysLabel.ts`
- `frontend/apps/web/test/clubs/club-detail-tabs.test.tsx`
- `frontend/apps/web/test/clubs/active-days-label.test.ts`

**Modify:**
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailHero.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubContactCard.tsx`
- `frontend/apps/web/app/clubs/[clubId]/page.tsx`

---

## Task 1: `activeDaysLabel` 헬퍼

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_lib/activeDaysLabel.ts`
- Create: `frontend/apps/web/test/clubs/active-days-label.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import {
  dayLabel,
  activityScheduleLabel,
} from '../../app/clubs/[clubId]/_lib/activeDaysLabel';

describe('dayLabel', () => {
  it.each([
    ['MONDAY', '월'],
    ['TUESDAY', '화'],
    ['WEDNESDAY', '수'],
    ['THURSDAY', '목'],
    ['FRIDAY', '금'],
    ['SATURDAY', '토'],
    ['SUNDAY', '일'],
  ] as const)('%s → %s', (day, expected) => {
    expect(dayLabel(day)).toBe(expected);
  });
});

describe('activityScheduleLabel', () => {
  it('빈도와 요일이 모두 있으면 "주 N회 (요일·요일)"', () => {
    expect(activityScheduleLabel(2, ['WEDNESDAY', 'FRIDAY'])).toBe('주 2회 (수·금)');
  });
  it('빈도만 있으면 "주 N회"', () => {
    expect(activityScheduleLabel(1, [])).toBe('주 1회');
  });
  it('요일만 있으면 "(요일·요일)"', () => {
    expect(activityScheduleLabel(null, ['MONDAY', 'WEDNESDAY'])).toBe('월·수');
  });
  it('둘 다 없으면 null', () => {
    expect(activityScheduleLabel(null, [])).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run active-days-label
```
Expected: FAIL.

- [ ] **Step 3: 구현**

```ts
import type { ClubDayOfWeek } from '@duing/types';

const LABELS: Record<ClubDayOfWeek, string> = {
  MONDAY: '월',
  TUESDAY: '화',
  WEDNESDAY: '수',
  THURSDAY: '목',
  FRIDAY: '금',
  SATURDAY: '토',
  SUNDAY: '일',
};

const ORDER: ClubDayOfWeek[] = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
];

export function dayLabel(day: ClubDayOfWeek): string {
  return LABELS[day];
}

export function activityScheduleLabel(
  frequency: number | null,
  activeDays: ClubDayOfWeek[],
): string | null {
  const sorted = [...activeDays].sort(
    (left, right) => ORDER.indexOf(left) - ORDER.indexOf(right),
  );
  const daysPart = sorted.map(dayLabel).join('·');

  if (frequency !== null && daysPart) return `주 ${frequency}회 (${daysPart})`;
  if (frequency !== null) return `주 ${frequency}회`;
  if (daysPart) return daysPart;
  return null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- --run active-days-label`
Expected: 11 PASS.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs/[clubId]/_lib/activeDaysLabel.ts \
        frontend/apps/web/test/clubs/active-days-label.test.ts
git commit -m "feat(frontend): activity schedule 라벨 헬퍼 추가"
```

---

## Task 2: `ClubDetailHero` — 창설년/기수 라인 활성화

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailHero.tsx`

- [ ] **Step 1: 라인 추가**

기존 `<span className="pill solid">{displayStatusLabel...}</span>` 형제 영역 안에서 두 칩 다음에 다음 추가 (현재 line 약 56):

```tsx
{(club.foundedYear !== null || club.cohortNumber !== null) && (
  <span className="text-[13px] text-charcoal-3">
    {club.foundedYear !== null && `${club.foundedYear}년 창설`}
    {club.foundedYear !== null && club.cohortNumber !== null && ' · '}
    {club.cohortNumber !== null && `${club.cohortNumber}기`}
  </span>
)}
```

- [ ] **Step 2: 타입체크/빌드**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -10
```

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailHero.tsx
git commit -m "feat(frontend): ClubDetailHero에 창설년/기수 라인 추가"
```

---

## Task 3: `ClubDetailStats` 신규 컴포넌트

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailStats.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import type { ClubDetail } from '@duing/types';
import { activityScheduleLabel } from '../_lib/activeDaysLabel';

type Props = { club: ClubDetail };

type Cell = { label: string; value: string };

export function ClubDetailStats({ club }: Props) {
  const cells: Cell[] = [];

  const schedule = activityScheduleLabel(club.activityFrequency, club.activeDays);
  if (schedule) {
    cells.push({ label: '활동', value: schedule });
  }
  if (club.foundedYear !== null) {
    cells.push({ label: '창설년도', value: String(club.foundedYear) });
  }
  if (club.membershipFee !== null) {
    cells.push({ label: '회비', value: club.membershipFee });
  }

  if (cells.length === 0) return null;

  return (
    <div className="grid grid-cols-4 border-y border-line py-5">
      {cells.map((cell) => (
        <div key={cell.label}>
          <div className="mb-1.5 text-xs tracking-wide04 text-charcoal-3">{cell.label}</div>
          <div className="font-display text-[22px] font-bold text-ink-deep">{cell.value}</div>
        </div>
      ))}
    </div>
  );
}
```

> 회원 수 셀은 본 spec 범위 외. 다른 셀이 1~3 개여도 grid-cols-4 유지 (빈 칸은 자연스럽게 비어 보임).

- [ ] **Step 2: 타입체크**

`pnpm -w typecheck`
Expected: SUCCESS.

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailStats.tsx
git commit -m "feat(frontend): ClubDetailStats 신규 컴포넌트"
```

---

## Task 4: 탭 콘텐츠 sub-컴포넌트 3개 (Activity, Qna, InfoList)

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailActivity.tsx`
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailQna.tsx`
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailInfoList.tsx`

- [ ] **Step 1: `ClubDetailActivity`**

```tsx
import type { ClubDetail, ClubPhoto } from '@duing/types';
import { activityScheduleLabel } from '../_lib/activeDaysLabel';
import { ClubDetailPhotos } from './ClubDetailPhotos';

type Props = { club: ClubDetail; photos: ClubPhoto[] };

export function ClubDetailActivity({ club, photos }: Props) {
  const schedule = activityScheduleLabel(club.activityFrequency, club.activeDays);
  return (
    <div>
      {schedule && (
        <p className="mb-8 text-[15.5px] text-charcoal">
          정기 활동: <span className="font-semibold">{schedule}</span>
        </p>
      )}
      <ClubDetailPhotos photos={photos} />
    </div>
  );
}
```

- [ ] **Step 2: `ClubDetailQna`**

```tsx
import type { ClubFaq } from '@duing/types';

type Props = { faqs: ClubFaq[] };

export function ClubDetailQna({ faqs }: Props) {
  const sorted = faqs.slice().sort((a, b) => a.order - b.order);
  return (
    <ul className="space-y-3">
      {sorted.map((faq, idx) => (
        <li key={idx} className="rounded-[14px] border border-line bg-paper p-4">
          <p className="font-semibold text-ink-deep">Q. {faq.question}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-charcoal-2">{faq.answer}</p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: `ClubDetailInfoList`**

```tsx
import type { ClubDetail } from '@duing/types';

type Props = { club: ClubDetail };

type Row = { label: string; value: string };

export function ClubDetailInfoList({ club }: Props) {
  const rows: Row[] = [];
  if (club.foundedYear !== null) rows.push({ label: '창설년도', value: `${club.foundedYear}년` });
  if (club.cohortNumber !== null) rows.push({ label: '현재 기수', value: `${club.cohortNumber}기` });
  if (club.membershipFee !== null) rows.push({ label: '회비', value: club.membershipFee });
  if (club.location !== null) rows.push({ label: '위치', value: club.location });
  if (club.contactEmail !== null) rows.push({ label: '컨택', value: club.contactEmail });

  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-[100px_1fr] gap-y-3 text-[15px]">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-charcoal-3">{row.label}</dt>
          <dd className="text-charcoal">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 4: 타입체크**

`pnpm -w typecheck` → SUCCESS.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailActivity.tsx \
        frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailQna.tsx \
        frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailInfoList.tsx
git commit -m "feat(frontend): 탭별 콘텐츠 컴포넌트 3개 추가 (Activity/Qna/InfoList)"
```

---

## Task 5: `ClubDetailTabs` — Underline Tabs 컨테이너

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import { useState } from 'react';

import type { ClubDetail, ClubPhoto } from '@duing/types';

import { cn } from '../../../_lib/cn';
import { activityScheduleLabel } from '../_lib/activeDaysLabel';
import { ClubDetailAbout } from './ClubDetailAbout';
import { ClubDetailActivity } from './ClubDetailActivity';
import { ClubDetailInfoList } from './ClubDetailInfoList';
import { ClubDetailQna } from './ClubDetailQna';

type TabKey = 'intro' | 'activity' | 'qna' | 'info';

type Tab = { key: TabKey; label: string };

type Props = { club: ClubDetail; photos: ClubPhoto[] };

export function ClubDetailTabs({ club, photos }: Props) {
  const hasIntro = club.description !== null;
  const hasActivity = activityScheduleLabel(club.activityFrequency, club.activeDays) !== null
    || photos.length > 0;
  const hasQna = club.faqs.length > 0;
  const hasInfo = club.foundedYear !== null
    || club.cohortNumber !== null
    || club.membershipFee !== null
    || club.location !== null
    || club.contactEmail !== null;

  const tabs: Tab[] = [];
  if (hasIntro) tabs.push({ key: 'intro', label: '소개' });
  if (hasActivity) tabs.push({ key: 'activity', label: '활동' });
  if (hasQna) tabs.push({ key: 'qna', label: 'Q&A' });
  if (hasInfo) tabs.push({ key: 'info', label: '동아리 상세정보' });

  const [active, setActive] = useState<TabKey | null>(
    tabs.length > 0 ? tabs[0].key : null,
  );

  if (tabs.length === 0) return null;

  return (
    <div>
      <div className="mb-8 flex gap-8 border-b border-line">
        {tabs.map((tab) => {
          const on = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={cn(
                'border-b-[2.5px] px-0 py-3.5 text-[15px] font-semibold transition',
                on
                  ? 'border-ink text-ink'
                  : 'border-transparent text-charcoal-3 hover:text-charcoal',
              )}
              style={{ marginBottom: '-1.5px' }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {active === 'intro' && <ClubDetailAbout description={club.description} />}
      {active === 'activity' && <ClubDetailActivity club={club} photos={photos} />}
      {active === 'qna' && <ClubDetailQna faqs={club.faqs} />}
      {active === 'info' && <ClubDetailInfoList club={club} />}
    </div>
  );
}
```

> `cn` 위치: `apps/web/app/_lib/cn.ts`. 컴포넌트(`clubs/[clubId]/_components/`) 기준 상대 경로 `'../../../_lib/cn'`.
> import 그룹 분리(external → 워크스페이스 → internal → sibling) 는 AGENTS.md 규칙.

- [ ] **Step 2: 타입체크**

`pnpm -w typecheck` → SUCCESS.

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx
git commit -m "feat(frontend): ClubDetailTabs Underline Tabs 복원 (빈 탭 자동 숨김)"
```

---

## Task 6: `ClubDetailTabs` 단위 테스트

**Files:**
- Create: `frontend/apps/web/test/clubs/club-detail-tabs.test.tsx`

- [ ] **Step 1: 테스트 작성**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClubDetail } from '@duing/types';
import { ClubDetailTabs } from '../../app/clubs/[clubId]/_components/ClubDetailTabs';

const baseClub: ClubDetail = {
  id: 1,
  name: 'X',
  category: 'ACADEMIC',
  division: null,
  logoUrl: null,
  status: 'ACTIVE',
  tags: [],
  description: null,
  coverUrl: null,
  snsLinks: [],
  faqs: [],
  leaderId: null,
  leaderName: null,
  photos: [],
  foundedYear: null,
  cohortNumber: null,
  location: null,
  contactEmail: null,
  activityFrequency: null,
  activeDays: [],
  membershipFee: null,
};

describe('ClubDetailTabs', () => {
  it('데이터가 하나도 없으면 컨테이너 자체를 렌더링하지 않는다 (null 반환)', () => {
    const { container } = render(<ClubDetailTabs club={baseClub} photos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('description 만 있으면 소개 탭 1개만 노출', () => {
    render(
      <ClubDetailTabs
        club={{ ...baseClub, description: '본문' }}
        photos={[]}
      />,
    );
    expect(screen.getByRole('button', { name: '소개' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '활동' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Q&A' })).toBeNull();
    expect(screen.queryByRole('button', { name: '동아리 상세정보' })).toBeNull();
  });

  it('faqs 만 있으면 Q&A 탭이 첫 활성 탭이 되고 콘텐츠가 보인다', () => {
    render(
      <ClubDetailTabs
        club={{
          ...baseClub,
          faqs: [{ question: '회비?', answer: '학기당 3만원', order: 0 }],
        }}
        photos={[]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Q&A' })).toBeInTheDocument();
    expect(screen.getByText(/Q\. 회비/)).toBeInTheDocument();
  });

  it('탭 4개가 모두 있으면 4개 모두 노출', () => {
    render(
      <ClubDetailTabs
        club={{
          ...baseClub,
          description: '본문',
          activityFrequency: 2,
          activeDays: ['WEDNESDAY'],
          faqs: [{ question: 'q', answer: 'a', order: 0 }],
          foundedYear: 2020,
        }}
        photos={[]}
      />,
    );
    expect(screen.getByRole('button', { name: '소개' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '활동' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Q&A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '동아리 상세정보' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run club-detail-tabs 2>&1 | tail -20
```
Expected: 4 PASS.

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/test/clubs/club-detail-tabs.test.tsx
git commit -m "test(frontend): ClubDetailTabs 빈 탭 숨김/노출 단위 테스트"
```

---

## Task 7: `ClubRecruitmentCard` — 면접 일정/지원자 수 행

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx`

- [ ] **Step 1: 기존 `Row` 들이 정의된 `<div className="mb-5 flex flex-col gap-3.5 text-sm">` 안에 행 2개 추가**

기존 `Row label="모집 대상" ...` 다음, `Row label="상태" last />` 앞에 다음 2개 추가:

```tsx
{recruitment.interviewStartDate && recruitment.interviewEndDate && (
  <Row
    label="면접 일정"
    value={`${recruitment.interviewStartDate} ~ ${recruitment.interviewEndDate}`}
  />
)}
{recruitment.applicantCount !== null && (
  <Row
    label="지원자"
    value={`현재 ${recruitment.applicantCount}명 지원`}
  />
)}
```

> 마지막 `Row last />` 는 그대로 유지. 위 2개 행은 데이터 있을 때만 렌더링되므로 dashed border 가 자연스럽게 처리됨.

- [ ] **Step 2: 타입체크**

`pnpm -w typecheck` → SUCCESS.

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx
git commit -m "feat(frontend): ClubRecruitmentCard에 면접 일정·지원자 수 행 추가"
```

---

## Task 8: `ClubContactCard` — 위치/이메일 행

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubContactCard.tsx`

- [ ] **Step 1: 컴포넌트 시그니처 확장**

기존 props 가 `{ snsLinks: ClubSnsLink[] }` 였다면 다음으로 교체:

```tsx
import type { ClubDetail, ClubSnsLink } from '@duing/types';

type Props = {
  snsLinks: ClubSnsLink[];
  location: string | null;
  contactEmail: string | null;
};

export function ClubContactCard({ snsLinks, location, contactEmail }: Props) {
  const hasAny = snsLinks.length > 0 || location !== null || contactEmail !== null;
  if (!hasAny) return null;
  return (
    <div className="rounded-[18px] bg-sage-mist p-5">
      <div className="mb-3 text-xs font-bold tracking-wide06 text-ink-deep">CONTACT</div>
      <ul className="flex flex-col gap-2 text-[13.5px] text-charcoal">
        {location !== null && <li>📍 {location}</li>}
        {contactEmail !== null && (
          <li>
            📨 <a href={`mailto:${contactEmail}`} className="hover:underline">{contactEmail}</a>
          </li>
        )}
        {snsLinks.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {link.platform} · {link.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> `import type` 의 `ClubDetail` 은 실제로 안 쓰면 제거 — `ClubSnsLink` 만 import.

- [ ] **Step 2: 호출처 (page.tsx) 는 Task 9 에서 함께 수정**

- [ ] **Step 3: 컴파일은 호출처가 props 부족으로 깨질 수 있음**

Run: `pnpm -w typecheck 2>&1 | tail -20`
Expected: `page.tsx` 의 `<ClubContactCard snsLinks={...} />` 가 prop 부족 에러. Task 9 와 묶어 커밋 안 한 상태로 진행.

---

## Task 9: `page.tsx` 재조립 — 탭 + Stats 통합 + Contact prop 보충

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/page.tsx`

- [ ] **Step 1: import 추가 및 본문 재배치**

기존 `page.tsx` 의 왼쪽 컬럼 안의 `ClubDetailAbout/Photos/FAQ` 영역을 `ClubDetailTabs` 로 교체. Hero 아래 Stats 를 그 위로 추가. Contact 카드에 props 보충.

전체 파일을 다음으로 교체:

```tsx
'use client';

import { use } from 'react';
import { useClubDetailQuery, useClubRecruitmentsQuery, useClubPhotosQuery } from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';
import { ClubDetailHero } from './_components/ClubDetailHero';
import { ClubDetailStats } from './_components/ClubDetailStats';
import { ClubDetailTabs } from './_components/ClubDetailTabs';
import { ClubRecruitmentCard } from './_components/ClubRecruitmentCard';
import { ClubContactCard } from './_components/ClubContactCard';

export default function ClubDetailPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);

  const detail = useClubDetailQuery(clubId);
  const photos = useClubPhotosQuery(clubId);
  const recruitments = useClubRecruitmentsQuery(clubId);

  if (detail.isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }
  if (!detail.data) {
    return <p className="p-6 text-sm text-coral">동아리를 찾을 수 없습니다.</p>;
  }

  const club = detail.data;
  const activeRecruitment: RecruitmentSummary | undefined = recruitments.data?.find(
    (item) => item.displayStatus === 'OPEN' || item.displayStatus === 'ALWAYS_OPEN',
  );

  return (
    <div className="bg-cream min-h-screen">
      <ClubDetailHero
        club={club}
        recruitmentDisplayStatus={activeRecruitment?.displayStatus}
      />

      <section className="bg-cream px-10 pb-16">
        <div className="max-w-layout mx-auto grid grid-cols-[1fr_380px] gap-12">
          <div>
            <div className="mb-8">
              <ClubDetailStats club={club} />
            </div>
            <ClubDetailTabs club={club} photos={photos.data ?? []} />
          </div>

          <div className="space-y-4">
            <ClubRecruitmentCard recruitment={activeRecruitment} clubId={clubId} />
            <ClubContactCard
              snsLinks={club.snsLinks}
              location={club.location}
              contactEmail={club.contactEmail}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
```

> 기존 사용 컴포넌트 중 `ClubDetailAbout`, `ClubDetailPhotos`, FAQ 인라인 블록은 Tabs 내부로 흡수됨. 외부에서는 더 이상 import 하지 않음 — 단, 컴포넌트 파일 자체는 Tabs 가 import 하므로 그대로 유지.

- [ ] **Step 2: 타입체크 + 빌드**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -20
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run 2>&1 | tail -20
```

Expected: 모두 SUCCESS.

- [ ] **Step 3: 브라우저 확인**

`pnpm dev` → `http://localhost:3000/clubs/<id>` 열어:
- Hero 에 창설년·기수 라인 (데이터 있으면)
- Stats row 셀들이 데이터 유무에 따라 노출
- Tabs 가 데이터 있는 탭만 노출, 클릭 시 콘텐츠 전환
- 모집 카드의 면접 일정/지원자 수 행이 데이터 유무에 따라 노출
- Contact 카드의 위치/이메일 행이 데이터 유무에 따라 노출

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubContactCard.tsx \
        frontend/apps/web/app/clubs/[clubId]/page.tsx
git commit -m "feat(frontend): 동아리 상세에 Tabs/Stats 통합 + Contact 위치·이메일 노출"
```

---

## Task 10: PR

- [ ] **Step 1: 최종 검증**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -10
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run 2>&1 | tail -10
```

- [ ] **Step 2: PR**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git push -u origin feat/club-detail-tabs-and-display
gh pr create --base develop --title "feat(frontend): 동아리 상세에 Underline Tabs 복원 + 메타 표시 활성화" --body "$(cat <<'EOF'
## 🚀 작업 내용
- 디자인 원본의 4탭(소개/활동/Q&A/동아리 상세정보) Underline Tabs 를 복원했습니다. 데이터가 없는 탭은 자동으로 숨겨져 빈 화면이 보이지 않습니다.
- Hero 아래 4열 Stats(활동·창설년·회비, 회원수는 본 spec 범위 외)를 추가했습니다.
- 모집 카드에 면접 일정·지원자 수 행, Contact 카드에 위치·이메일 행을 데이터 있을 때만 노출하도록 추가했습니다.
- 이전 spec 에서 미뤘던 누락 필드 8개가 학생 화면에 노출됩니다.

## 🤔 고민했던 내용
- 탭 상태를 useState 로만 관리해 새로고침 시 첫 탭으로 돌아갑니다. URL 쿼리 동기화는 사용 패턴이 명확해지면 추가하기로 했습니다.
- 빈 탭은 회색으로 비활성화하지 않고 아예 숨겼습니다. 디자인이 4탭을 가정한 자리를 잡고 있지만, 정보가 없는 탭을 누를 수 있게 두면 빈 영역이 노출돼 어색합니다.

## 💬 리뷰 중점사항
- 탭 전환이 자연스러운지 (활성 탭 하단 border, 비활성 hover) 확인 부탁드립니다.
- Contact 카드에 props 가 늘었습니다. 추후 카드 자체가 club 전체를 받게 리팩터링하는 게 좋을지 의견 부탁드립니다.
EOF
)"
```

---

## Self-Review

- [x] **스펙 커버리지** — §6 의 학생측 표시(Hero/Stats/Tabs/Card/Contact) 모두 Task 2~9. §1 Tabs 복원 Task 5/9.
- [x] **플레이스홀더 검사** — 모든 코드 블록 완성. 후속 작업으로 미뤄지는 "회원수 셀" 만 spec 에 명시된 대로 본 plan 범위 외.
- [x] **타입 일관성** — `ClubDayOfWeek` 사용, `activityFrequency: number | null` 사용. 탭 키 `'intro'|'activity'|'qna'|'info'` 사용. 모두 spec 과 일치.
- [x] **DRY** — `activityScheduleLabel` 헬퍼 한 곳에서만. 탭 콘텐츠는 sub-컴포넌트로 분리.
- [x] **TDD** — `activeDaysLabel` (Task 1) 과 `ClubDetailTabs` (Task 6) 단위 테스트.
- [x] **frequent commits** — 10 task / 10 commit.

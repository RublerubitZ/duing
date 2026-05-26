# PR-B (FE): /clubs 모집 상태 필터 UI + 카드 표시 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/clubs` 페이지의 모집 상태 필터를 `전체 / 지원가능 / 모집예정 / 모집마감` 4종으로 정비하고, ClubCard 가 BE 의 `activeRecruitment.displayStatus` 와 기간 데이터를 기반으로 정확한 상태·기간을 표시하도록 한다.

**Architecture:** `ClubSummary` 타입에 `activeRecruitment` 임베드 (BE 응답과 sync), `exploreParams` 의 `RecruitmentFilter` 를 새 union 으로 교체하고 `toApiParams` 에서 `recruitmentStatus` 파라미터로 매핑, `clubAdapter` 의 잘못된 `deriveStatus` 제거하고 `Club` 타입에 `displayStatus + recruitmentPeriod` 임베드, `ClubCard` 의 5개 상태 분기 렌더링.

**Tech Stack:** Next.js 15 + React 19 / TanStack Query / Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-05-25-clubs-recruitment-status-filter-design.md`

**의존:** PR-A (BE) 머지 후 분기 — `activeRecruitment` 응답 필드와 `recruitmentStatus` 파라미터가 BE 에 살아 있어야 함.

**브랜치:** `feat/clubs-recruitment-status-filter` (develop 에서 분기)

---

## File Structure

**Modify:**
- `frontend/packages/types/src/club.ts` — `ClubSummary.activeRecruitment` 추가 (StudentRecruitmentProjection 의 축약 버전 재사용 또는 신규 alias)
- `frontend/apps/web/app/clubs/_lib/exploreParams.ts` — `RecruitmentFilter` union 교체, `RECRUITMENT_LABEL` 갱신, `toApiParams` 매핑 변경
- `frontend/apps/web/app/clubs/_lib/clubs.ts` — `Club.activeRecruitment` 필드 추가, `ClubStatus` 제거 (대신 displayStatus 임베드)
- `frontend/apps/web/app/clubs/_lib/clubAdapter.ts` — 잘못된 `deriveStatus` 제거, `'—'` 하드코딩 제거, activeRecruitment 직매핑
- `frontend/apps/web/app/clubs/_components/ClubCard.tsx` — 5개 상태(OPEN/ALWAYS_OPEN/UPCOMING/CLOSED/null) 분기로 뱃지·기간 렌더링
- `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx` — 필터 칩 옵션 교체 (`available / upcoming / closed`)
- `frontend/apps/web/test/clubs/club-card-central-chip.test.tsx` — `Club` 타입 변경에 따른 fixture 업데이트

**Create:**
- `frontend/apps/web/test/clubs/club-card-recruitment-status.test.tsx` — 5개 displayStatus 케이스의 뱃지·기간 라벨 검증
- `frontend/apps/web/test/clubs/explore-params.test.ts` — `RecruitmentFilter` 라운드 트립(URL ↔ ExploreParams ↔ ApiParams)

---

### Task 1: ClubSummary 타입에 activeRecruitment 추가

**Files:**
- Modify: `frontend/packages/types/src/club.ts`

- [ ] **Step 1: ClubSummary 에 activeRecruitment 필드 추가**

`ClubSummary` 타입 위에 축약 모집 타입을 정의하고 ClubSummary 에 임베드한다. `ClubDetail` 의 `StudentRecruitmentProjection` 과 별개의 카드용 축약형 (필드 5개만 노출).

```ts
// 기존 import 아래에 추가
import type { RecruitmentDisplayStatus } from './recruitment';

/**
 * 카드 표시에 필요한 활성/대표 모집의 축약형.
 * BE: ClubSummaryResponse.ActiveRecruitmentSummaryResponse 와 1:1 매칭.
 */
export type ClubSummaryRecruitment = {
  recruitmentId: number;
  displayStatus: RecruitmentDisplayStatus;
  startDate: string;          // ISO yyyy-MM-dd
  endDate: string | null;     // null = 상시모집
};

// ClubSummary 에 필드 추가
export type ClubSummary = {
  id: number;
  name: string;
  category: ClubCategory;
  division: string | null;
  college: College | null;
  logoUrl: string | null;
  status: ClubStatus;
  tags: string[];
  centralClub: boolean;
  activeRecruitment: ClubSummaryRecruitment | null;
};
```

- [ ] **Step 2: ClubSearchParams 에 recruitmentStatus 추가, recruiting 은 유지(하위호환)**

```ts
export type ClubSearchParams = {
  category?: ClubCategory;
  division?: string;
  keyword?: string;
  tags?: string[];
  recruiting?: boolean;                                              // deprecated
  recruitmentStatus?: 'AVAILABLE' | 'UPCOMING' | 'CLOSED';
  centralClub?: boolean;
  college?: College;
  page?: number;
  size?: number;
  sort?: string;
};
```

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @duing/types typecheck` (또는 루트에서 `pnpm typecheck`)
Expected: 통과. ClubSummary 를 소비하는 사이트에서 `activeRecruitment` 미할당 에러가 다음 태스크들의 대상.

- [ ] **Step 4: 커밋**

```bash
git add frontend/packages/types/src/club.ts
git commit -m "feat(frontend): ClubSummary 에 activeRecruitment 필드 추가"
```

---

### Task 2: exploreParams — RecruitmentFilter union 교체 + toApiParams 매핑

**Files:**
- Modify: `frontend/apps/web/app/clubs/_lib/exploreParams.ts`

- [ ] **Step 1: 새 union 으로 교체**

```ts
// 기존 RecruitmentFilter / RECRUITMENT_LABEL / RECRUITMENTS / toApiParams 의 recruiting 매핑을 교체

export type RecruitmentFilter = 'all' | 'available' | 'upcoming' | 'closed';

export const RECRUITMENT_LABEL: Record<Exclude<RecruitmentFilter, 'all'>, string> = {
  available: '지원가능',
  upcoming: '모집예정',
  closed: '모집마감',
};

const RECRUITMENTS: readonly RecruitmentFilter[] = ['all', 'available', 'upcoming', 'closed'];
```

- [ ] **Step 2: toApiParams 매핑 교체 — recruitmentStatus 사용, recruiting 제거**

```ts
export function toApiParams(params: ExploreParams, pageSize: number): ClubSearchParams {
  const recruitmentStatus =
    params.recruitment === 'available' ? 'AVAILABLE'
      : params.recruitment === 'upcoming' ? 'UPCOMING'
      : params.recruitment === 'closed' ? 'CLOSED'
      : undefined;

  const centralClub =
    params.scope === '중앙' ? true
      : params.scope === '학과' ? false
      : undefined;

  return {
    keyword: params.keyword || undefined,
    division: params.division !== '전체' ? params.division : undefined,
    recruitmentStatus,
    centralClub,
    college: params.college ?? undefined,
    sort: params.sort,
    page: Math.max(0, params.page - 1),
    size: pageSize,
  };
}
```

- [ ] **Step 3: parseExploreParams 의 URL ↔ 필터 매핑 — 기존 'open' 값은 'available' 로 마이그레이션 (북마크 호환)**

```ts
export function parseExploreParams(search: URLSearchParams): ExploreParams {
  // ... (기존 scope/division/keyword 처리 유지)

  const rawRecruitment = search.get('recruitment');
  const recruitment: RecruitmentFilter =
    rawRecruitment === 'open' ? 'available'                          // 이전 URL 호환
      : RECRUITMENTS.find((option) => option === rawRecruitment) ?? 'all';

  // ... (나머지 동일)
}
```

- [ ] **Step 4: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: ClubExplorePage / clubAdapter / ClubCard 등 소비 사이트에서 컴파일 에러 (다음 태스크들에서 해결).

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/clubs/_lib/exploreParams.ts
git commit -m "feat(frontend): /clubs 모집 필터를 available/upcoming/closed 로 교체"
```

---

### Task 3: clubs.ts / clubAdapter.ts — Club 타입에 displayStatus + period 임베드

**Files:**
- Modify: `frontend/apps/web/app/clubs/_lib/clubs.ts`
- Modify: `frontend/apps/web/app/clubs/_lib/clubAdapter.ts`

- [ ] **Step 1: clubs.ts — Club 타입 갱신**

기존 `ClubStatus` union 과 `deadline/openDate/spots/gen` 필드의 의미가 모집 상태 표시와 충돌하므로 정리한다. 카드용 모집 정보를 단일 객체로 임베드.

```ts
import type { ClubSummaryRecruitment } from '@duing/types';

export const DIVISIONS = ['문화예술', '사회', '전시창작', '종교', '학술'] as const;
export type Division = (typeof DIVISIONS)[number];

export type ClubScope = '중앙' | '학과';

export type ClubCat =
  | '학술' | '운동' | '음악' | '공연' | '봉사'
  | '문화' | 'IT' | '창업' | '친목';

export type Club = {
  id: number;
  name: string;
  tag: string;
  cat: ClubCat;
  scope: ClubScope;
  division: string | null;
  color: string;
  logoUrl: string | null;
  /** 활성 또는 가장 최근 마감 모집 1건. null 이면 카드에 "모집 없음" 표시. */
  activeRecruitment: ClubSummaryRecruitment | null;
};

export const isDivision = (value: string | null | undefined): value is Division =>
  value !== null && value !== undefined && (DIVISIONS as readonly string[]).includes(value);

// CAT_COLORS 는 그대로 유지
```

기존 `ClubStatus` type 과 `gen / spots / deadline / openDate` 필드는 제거. 카드 컴포넌트는 `activeRecruitment` 만 본다.

- [ ] **Step 2: clubAdapter.ts — deriveStatus 제거, '—' 하드코딩 제거**

```ts
import type { ClubSummary } from '@duing/types';

import { type Club, type ClubCat, type ClubScope } from './clubs';

const CATEGORY_TO_CAT: Record<import('@duing/types').ClubCategory, ClubCat> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '문화',
  SPORTS: '운동',
  VOLUNTEER: '봉사',
  RELIGION: '친목',
  HOBBY: '친목',
  OTHER: '친목',
};

const COLOR_PALETTE = [
  '#1F4A36', '#143025', '#2E6149', '#B65672',
  '#9A3F23', '#2F557A', '#8E6620', '#7E2A45',
] as const;

const pickColor = (id: number): string =>
  COLOR_PALETTE[Math.abs(id) % COLOR_PALETTE.length] ?? '#1F4A36';

const deriveScope = (centralClub: boolean): ClubScope =>
  centralClub ? '중앙' : '학과';

export function summaryToClub(summary: ClubSummary): Club {
  const cat = CATEGORY_TO_CAT[summary.category];
  const scope = deriveScope(summary.centralClub);
  const division = summary.division ?? null;
  const tag = summary.tags.length > 0 ? summary.tags.slice(0, 3).join(' · ') : '소개 준비중';

  return {
    id: summary.id,
    name: summary.name,
    tag,
    cat,
    scope,
    division,
    color: pickColor(summary.id),
    logoUrl: summary.logoUrl,
    activeRecruitment: summary.activeRecruitment,
  };
}
```

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: ClubCard / 기존 테스트(`club-card-central-chip.test.tsx`) 에서 미정의 필드(`status`, `gen`, `spots`, `deadline`) 사용 에러 — 다음 태스크들에서 해결.

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/clubs/_lib/clubs.ts frontend/apps/web/app/clubs/_lib/clubAdapter.ts
git commit -m "feat(frontend): Club 타입에 activeRecruitment 임베드, deriveStatus 제거"
```

---

### Task 4: ClubCard — 5개 상태 분기 렌더링 (TDD)

**Files:**
- Create: `frontend/apps/web/test/clubs/club-card-recruitment-status.test.tsx`
- Modify: `frontend/apps/web/app/clubs/_components/ClubCard.tsx`
- Modify: `frontend/apps/web/test/clubs/club-card-central-chip.test.tsx` (fixture 갱신)

- [ ] **Step 1: 신규 테스트 작성 — 5개 상태 케이스**

```tsx
// club-card-recruitment-status.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Club } from '../../app/clubs/_lib/clubs';
import { ClubCard } from '../../app/clubs/_components/ClubCard';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const baseClub: Club = {
  id: 1,
  name: '테스트 동아리',
  tag: '소개',
  cat: '학술',
  scope: '중앙',
  division: null,
  color: '#1F4A36',
  logoUrl: null,
  activeRecruitment: null,
};

describe('ClubCard — 모집 상태 뱃지/기간 렌더링', () => {
  it('OPEN: "모집중" 뱃지 + "모집 03.15 - 04.20" 기간', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 10,
        displayStatus: 'OPEN',
        startDate: '2026-03-15',
        endDate: '2026-04-20',
      },
    }} />);
    expect(screen.getByText('모집중')).toBeInTheDocument();
    expect(screen.getByText('모집 03.15 - 04.20')).toBeInTheDocument();
  });

  it('ALWAYS_OPEN: "상시모집" 뱃지 + "상시모집" 기간 라벨', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 11,
        displayStatus: 'ALWAYS_OPEN',
        startDate: '2026-03-01',
        endDate: null,
      },
    }} />);
    expect(screen.getAllByText('상시모집').length).toBeGreaterThanOrEqual(1);
  });

  it('UPCOMING: "모집예정" 뱃지 + "03.20부터 모집"', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 12,
        displayStatus: 'UPCOMING',
        startDate: '2026-03-20',
        endDate: '2026-04-10',
      },
    }} />);
    expect(screen.getByText('모집예정')).toBeInTheDocument();
    expect(screen.getByText('03.20부터 모집')).toBeInTheDocument();
  });

  it('CLOSED: "모집마감" 뱃지 + "모집 종료"', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 13,
        displayStatus: 'CLOSED',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      },
    }} />);
    expect(screen.getByText('모집마감')).toBeInTheDocument();
    expect(screen.getByText('모집 종료')).toBeInTheDocument();
  });

  it('activeRecruitment=null: "모집 없음" 뱃지, 기간 영역에 텍스트 없음', () => {
    render(<ClubCard club={{ ...baseClub, activeRecruitment: null }} />);
    expect(screen.getByText('모집 없음')).toBeInTheDocument();
    expect(screen.queryByText(/모집 종료|상시모집|부터 모집|모집 \d{2}\.\d{2}/)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web vitest run test/clubs/club-card-recruitment-status.test.tsx`
Expected: 5개 모두 FAIL — ClubCard 가 아직 활성 모집을 읽지 않음. 또는 컴파일 에러 (Club.activeRecruitment 가 ClubCard 에서 사용 안 됨).

- [ ] **Step 3: ClubCard 구현**

```tsx
// frontend/apps/web/app/clubs/_components/ClubCard.tsx
'use client';

import Link from 'next/link';

import { SparkleFull } from '../../_components/Sparkle';
import { toRoute } from '../../_lib/route';
import { CAT_COLORS, type Club } from '../_lib/clubs';
import type { RecruitmentDisplayStatus } from '@duing/types';

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return filled ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 21s-7.5-4.5-9.5-9.5C1 7 4.5 4 8 5c1.6.4 2.8 1.4 4 3 1.2-1.6 2.4-2.6 4-3 3.5-1 7 2 5.5 6.5C19.5 16.5 12 21 12 21z" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

type Props = {
  club: Club;
  size?: 'md' | 'lg';
  liked?: boolean;
  isLikeBusy?: boolean;
  onLikeToggle?: (id: number) => void;
};

type StatusKey = RecruitmentDisplayStatus | 'NONE';

type StatusStyle = {
  label: string;
  dotColor: string;
  chipClass: string;
};

const STATUS_STYLES: Record<StatusKey, StatusStyle> = {
  OPEN:        { label: '모집중',    dotColor: '#9DB6A0', chipClass: 'bg-sage-mist text-ink-deep' },
  ALWAYS_OPEN: { label: '상시모집',  dotColor: '#9DB6A0', chipClass: 'bg-sage-mist text-ink-deep' },
  UPCOMING:    { label: '모집예정',  dotColor: '#E8B968', chipClass: 'bg-[#FBEFD7] text-[#8E6620]' },
  CLOSED:      { label: '모집마감',  dotColor: '#6F7574', chipClass: 'bg-graysoft text-charcoal-2' },
  NONE:        { label: '모집 없음', dotColor: '#6F7574', chipClass: 'bg-graysoft text-charcoal-2' },
};

function formatMonthDay(isoDate: string): string {
  const parts = isoDate.split('-');
  const month = parts[1] ?? '';
  const day = parts[2] ?? '';
  return `${month}.${day}`;
}

function renderPeriod(club: Club): React.ReactNode {
  const recruitment = club.activeRecruitment;
  if (recruitment === null) {
    return null;
  }
  switch (recruitment.displayStatus) {
    case 'OPEN':
      if (recruitment.endDate === null) return null;
      return (
        <span className="font-bold text-ink">
          모집 {formatMonthDay(recruitment.startDate)} - {formatMonthDay(recruitment.endDate)}
        </span>
      );
    case 'ALWAYS_OPEN':
      return <span className="font-bold text-ink">상시모집</span>;
    case 'UPCOMING':
      return (
        <span className="font-bold text-[#8E6620]">
          {formatMonthDay(recruitment.startDate)}부터 모집
        </span>
      );
    case 'CLOSED':
      return <span className="text-charcoal-3">모집 종료</span>;
  }
}

export function ClubCard({ club, size = 'md', liked = false, isLikeBusy = false, onLikeToggle }: Props) {
  const cat = CAT_COLORS[club.cat];
  const statusKey: StatusKey = club.activeRecruitment?.displayStatus ?? 'NONE';
  const statusStyle = STATUS_STYLES[statusKey];
  const isDimmed = statusKey === 'CLOSED' || statusKey === 'NONE';
  const logoSize = size === 'lg' ? 96 : 64;
  const initial = (club.name || '?').trim().charAt(0);

  return (
    <Link
      href={toRoute(`/clubs/${club.id}`)}
      className={`relative flex flex-col gap-3.5 overflow-hidden bg-paper border border-line rounded-[18px] p-[18px] cursor-pointer transition hover:shadow-2 ${isDimmed ? 'opacity-[0.85]' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`relative grid place-items-center shrink-0 text-white font-display font-bold leading-none shadow-1 overflow-hidden ${size === 'lg' ? 'rounded-[22px]' : 'rounded-[16px]'}`}
          style={{
            width: logoSize,
            height: logoSize,
            background: club.logoUrl
              ? undefined
              : `linear-gradient(135deg, ${club.color} 0%, ${club.color}CC 100%)`,
            fontSize: size === 'lg' ? 44 : 30,
            letterSpacing: '-0.03em',
            filter: isDimmed ? 'saturate(0.6)' : undefined,
          }}
          aria-label={`${club.name} 로고`}
        >
          {club.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club.logoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            initial
          )}
          <SparkleFull size={12} color="#9DB6A0" className="absolute -top-1 -right-1" />
        </div>

        <button
          type="button"
          aria-label={liked ? '찜 해제' : '찜 추가'}
          aria-pressed={liked}
          disabled={isLikeBusy}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onLikeToggle?.(club.id);
          }}
          className={`grid place-items-center w-8 h-8 rounded-full shrink-0 disabled:opacity-50 ${liked ? 'bg-[#FFE8E5] text-coral' : 'bg-transparent text-charcoal-3'}`}
        >
          <HeartIcon filled={liked} />
        </button>
      </div>

      <div>
        <h3 className="text-[19px] mb-1.5 leading-[1.25]">{club.name}</h3>
        <p className="text-[13.5px] text-charcoal-3 leading-[1.45]">{club.tag}</p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-charcoal-3">
        <span className={cat.pill}>{club.cat}</span>
        {club.scope && (
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide04 ${club.scope === '중앙' ? 'bg-sage-mist text-ink-deep' : 'bg-graysoft text-charcoal-2'}`}
          >
            {club.scope === '중앙' ? '🏛️ 중앙' : '🎓 학과'}
            {club.division ? ` · ${club.division}` : ''}
          </span>
        )}
      </div>

      <div className="mt-1 pt-3 border-t border-dashed border-line flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-[11.5px] font-bold tracking-[0.02em] ${statusStyle.chipClass}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: statusStyle.dotColor,
              boxShadow: statusKey === 'OPEN' || statusKey === 'ALWAYS_OPEN'
                ? `0 0 0 3px ${statusStyle.dotColor}33`
                : undefined,
            }}
          />
          {statusStyle.label}
        </span>

        <span className="text-[12.5px] text-charcoal-2 inline-flex items-center gap-1.5">
          {renderPeriod(club)}
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: 기존 테스트 fixture 갱신**

`frontend/apps/web/test/clubs/club-card-central-chip.test.tsx` 의 `baseClub` 에서 제거된 필드(`status`, `gen`, `spots`, `deadline`)를 빼고 `activeRecruitment: null` 추가.

```ts
const baseClub: Club = {
  id: 1,
  name: '테스트 동아리',
  tag: '소개',
  cat: '학술',
  scope: '중앙',
  division: null,
  color: '#1F4A36',
  logoUrl: null,
  activeRecruitment: null,
};
```

- [ ] **Step 5: 신규 + 기존 카드 테스트 전부 통과 확인**

Run: `pnpm --filter web vitest run test/clubs/club-card-recruitment-status.test.tsx test/clubs/club-card-central-chip.test.tsx`
Expected: 모두 PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/clubs/_components/ClubCard.tsx \
        frontend/apps/web/test/clubs/club-card-recruitment-status.test.tsx \
        frontend/apps/web/test/clubs/club-card-central-chip.test.tsx
git commit -m "feat(frontend): ClubCard 가 activeRecruitment.displayStatus 기반으로 상태/기간 표시"
```

---

### Task 5: ClubExplorePage — 필터 칩 옵션 교체

**Files:**
- Modify: `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx`

- [ ] **Step 1: 필터 칩 옵션 배열 교체**

253~262 라인의 모집 상태 FilterGroup 을 새 옵션으로 교체. handleRecruitmentSelect 의 토글 비교값은 그대로 유지 (이미 'all' 로 토글).

```tsx
<FilterGroup title="모집 상태">
  {(['available', 'upcoming', 'closed'] as const).map((value) => (
    <FilterRow
      key={value}
      label={RECRUITMENT_LABEL[value]}
      checked={params.recruitment === value}
      onChange={() => handleRecruitmentSelect(value)}
    />
  ))}
</FilterGroup>
```

- [ ] **Step 2: 활성 필터 칩 영역(ActiveFilterChip) — `recruitment !== 'all'` 표시 라벨 매핑**

기존 코드가 `RECRUITMENT_LABEL[params.recruitment]` 를 참조하는 곳이 있으면 새 union 으로 컴파일되는지 확인. (예: 333~343 라인 근처의 활성 필터 칩 영역.) `params.recruitment !== 'all'` 분기 안에서 `RECRUITMENT_LABEL[params.recruitment]` 로 접근하는데, TypeScript narrowing 으로 `'available' | 'upcoming' | 'closed'` 가 되어야 자동 통과.

- [ ] **Step 3: 타입체크 + 빌드**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: 모두 통과

- [ ] **Step 4: 로컬 dev 서버에서 시각 확인 (선택)**

Run: `pnpm --filter web dev`
브라우저에서 `http://localhost:3000/clubs` 열어:
- 필터 사이드바 모집 상태 칸에 `지원가능 / 모집예정 / 모집마감` 3개 옵션 노출
- 각 칩 클릭 → URL `?recruitment=available` 등으로 갱신
- 카드 각각의 뱃지가 활성 모집 상태(OPEN/ALWAYS_OPEN/UPCOMING/CLOSED/null)에 맞게 표시
- 기본 정렬에서 OPEN/ALWAYS_OPEN 동아리가 상단에 모이는지 확인

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx
git commit -m "feat(frontend): /clubs 필터 칩에 지원가능/모집예정/모집마감 옵션 적용"
```

---

### Task 6: exploreParams 라운드 트립 테스트

**Files:**
- Create: `frontend/apps/web/test/clubs/explore-params.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPLORE_PARAMS,
  parseExploreParams,
  serializeExploreParams,
  toApiParams,
} from '../../app/clubs/_lib/exploreParams';

describe('exploreParams — RecruitmentFilter 라운드 트립', () => {
  it("recruitment='available' 은 URL 직렬화 후 다시 같은 값으로 파싱된다", () => {
    const query = serializeExploreParams({ ...DEFAULT_EXPLORE_PARAMS, recruitment: 'available' });
    const parsed = parseExploreParams(new URLSearchParams(query));
    expect(parsed.recruitment).toBe('available');
  });

  it("이전 URL 의 recruitment='open' 은 'available' 로 마이그레이션된다", () => {
    const parsed = parseExploreParams(new URLSearchParams('recruitment=open'));
    expect(parsed.recruitment).toBe('available');
  });

  it("recruitment='available' → API recruitmentStatus=AVAILABLE", () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, recruitment: 'available' }, 20);
    expect(api.recruitmentStatus).toBe('AVAILABLE');
    expect(api.recruiting).toBeUndefined();
  });

  it("recruitment='upcoming' → API recruitmentStatus=UPCOMING", () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, recruitment: 'upcoming' }, 20);
    expect(api.recruitmentStatus).toBe('UPCOMING');
  });

  it("recruitment='closed' → API recruitmentStatus=CLOSED", () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, recruitment: 'closed' }, 20);
    expect(api.recruitmentStatus).toBe('CLOSED');
  });

  it("recruitment='all' → API recruitmentStatus 미전송", () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, recruitment: 'all' }, 20);
    expect(api.recruitmentStatus).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `pnpm --filter web vitest run test/clubs/explore-params.test.ts`
Expected: 6개 PASS

- [ ] **Step 3: 전체 테스트 + 타입체크 + 빌드 회귀 확인**

Run: `pnpm --filter web typecheck && pnpm --filter web vitest run && pnpm --filter web build`
Expected: 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/test/clubs/explore-params.test.ts
git commit -m "test(frontend): exploreParams 의 RecruitmentFilter 라운드 트립 검증"
```

---

### Task 7: PR self-check 및 생성

- [ ] 시크릿 미포함
- [ ] 의사코드 없음 — 모든 단계 완전 구현
- [ ] 변수명 명확 (`data`, `e` 등 모호한 축약 없음)
- [ ] TanStack Query 외 서버 상태 관리 없음
- [ ] `as` 타입 단언 / `any` 사용 없음
- [ ] `function` 키워드 + `type` 선언 컨벤션
- [ ] 커밋 메시지 Conventional Commits (`feat(frontend): ...`, `test(frontend): ...`)
- [ ] PR 본문에 Co-Authored-By / Claude 어트리뷰션 없음

- [ ] **PR 생성**

```bash
git push -u origin feat/clubs-recruitment-status-filter
gh pr create --base develop --title "feat(frontend): /clubs 모집 상태 필터 UI + 카드 표시 정비" --body "$(cat <<'EOF'
## 🚀 작업 내용

- `/clubs` 모집 상태 필터를 `지원가능 / 모집예정 / 모집마감` 3종(+ 전체)으로 정비. 상시모집(ALWAYS_OPEN)은 "지원가능" 으로 통합 처리.
- ClubCard 의 모집 상태 뱃지·기간 표시를 BE 가 내려주는 `activeRecruitment.displayStatus` 기반의 5개 케이스(OPEN/ALWAYS_OPEN/UPCOMING/CLOSED/null) 분기로 교체.
- `ClubSummary` 타입에 `activeRecruitment` 임베드, `clubAdapter` 의 잘못된 status 매핑(`ACTIVE → open`) 제거.
- 이전 북마크 호환을 위해 URL `?recruitment=open` 은 `available` 로 자동 마이그레이션.

## 🤔 고민했던 내용

기존에는 동아리 카드의 모집 상태가 동아리 승인 상태(`ClubStatus.ACTIVE`)를 모집 상태로 잘못 매핑해 항상 "모집중" 으로 노출되고 있었다. BE 의 displayStatus 가 이미 도입되어 있었으므로 카드 응답에 임베드해서 카드는 displayStatus 만 분기 렌더링하도록 정리했다.

## 💬 리뷰 중점사항

- "지원가능" 필터에 OPEN + ALWAYS_OPEN 이 모두 들어오는지 (시각 확인)
- 활성 모집 없는 동아리가 기본 정렬에서 가장 뒤에 노출되는지
- 이전 URL `?recruitment=open` 호환

Spec: `docs/superpowers/specs/2026-05-25-clubs-recruitment-status-filter-design.md`
EOF
)"
```

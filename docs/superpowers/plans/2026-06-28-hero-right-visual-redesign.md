# Hero 우측 비주얼 리디자인 (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 Hero 우측의 목업 3카드를 제거하고 브랜드 일러스트 중심으로 재구성하되, "이번 학기 모집중" 실데이터 카드는 유지하고 활동 토스트 2개(Phase A 는 폴백)를 얹는다.

**Architecture:** `HomeHero` 는 Server Component 로 유지한다. 토스트 도메인 로직은 DOM 비의존 순수 모듈(`hero-activity.ts`)로 분리해 단위 테스트하고, 화면은 동기 프레젠테이션 컴포넌트(`HeroRightVisual`/`HeroActivityToast`)로 그린다. 애니메이션은 `tailwindcss-animate` 의 CSS 유틸만 쓴다(framer-motion 미사용 → `'use client'` 불필요). 실활동 데이터 조회/연동은 본 계획 범위 밖(Phase B/C).

**Tech Stack:** Next.js 15 App Router(Server Component), React 19, TypeScript, Tailwind + `tailwindcss-animate`, `next/image`, Vitest + Testing Library(jsdom).

**스펙:** `docs/superpowers/specs/2026-06-28-hero-right-visual-redesign-design.md`

---

## 보정 노트 (코드 리뷰 반영)

이 레포는 `tsconfig.base.json` 에 `noUncheckedIndexedAccess: true` 가 켜져 있다. 배열 인덱싱이 `T | undefined` 가 되므로:

- **`resolveHeroToasts` 는 `HeroToast[]` 가 아니라 튜플 `[HeroToast, HeroToast]` 를 반환**한다. 슬롯별 폴백 상수 `FALLBACK_LIGHT`/`FALLBACK_DARK` + `toHeroToast(activity, fallback, now)` 헬퍼로 구성한다. 튜플 반환이라 호출부 `toasts[0]`/`toasts[1]` 접근이 `noUncheckedIndexedAccess` 에서도 안전하다(`as`/`!` 단언 불필요). → 아래 Task 1 코드의 `FALLBACK_TOASTS` 배열/`MAX_TOASTS`/`Array.from` 버전은 이 **튜플 버전으로 대체**되었다.
- **Task 2 `HeroRightVisual` 의 prop 타입은 `toasts: [HeroToast, HeroToast]`** (배열 아님). 그래야 내부 `toasts[0]`/`toasts[1]` 가 타입 에러 없이 정의된다.
- 각 Task 검증에 **`pnpm typecheck` 통과를 필수**로 포함한다. vitest(esbuild)는 타입 에러를 못 잡으므로 typecheck 를 별도로 돌려야 한다.

## File Structure

- **Create** `frontend/apps/web/app/_components/sections/hero-activity.ts` — 토스트 순수 로직: 타입(`HeroActivityType`/`HeroActivity`/`HeroToastVariant`/`HeroToast`), 매핑/폴백 상수, `formatRelativeTime`, `resolveHeroToasts`. React/DOM 비의존.
- **Modify** `frontend/apps/web/app/_components/sections/HomeHero.tsx` — `HeroCardStack`(목업) 제거, `HeroActivityToast`·`HeroRightVisual`(둘 다 test-only export) 추가, `HomeHero` 본문에서 `resolveHeroToasts([], now)` 주입. 좌측 컬럼·모바일 통계 칩은 무변경.
- **Create** `frontend/apps/web/test/home/hero-activity.test.ts` — 순수 로직 단위 테스트.
- **Create** `frontend/apps/web/test/home/home-hero.test.tsx` — `HeroRightVisual`/`HeroActivityToast` 렌더 테스트.
- **Track** `frontend/apps/web/public/duing-illustration.png` — 이미 작업트리에 존재(staged). Task 2 에서 코드와 함께 커밋.

> ⚠️ **사전 staged png 주의:** `frontend/apps/web/public/duing-illustration.png` 가 이미 `git add` 된 상태다. Task 0/1 커밋에 딸려가면 안 되므로 **pathspec 커밋**(`git commit -m "..." -- <지정 경로>`)을 써서 해당 경로만 커밋한다. 이 png 는 **Task 2** 에서 코드와 함께 커밋한다.

> **명령 cwd:** 테스트/타입체크/dev 는 모두 `frontend/apps/web` 에서 실행한다. git 명령은 레포 루트에서 실행한다.

---

## Task 0: 브랜치 생성 + 문서 커밋

**Files:** (git only)

- [ ] **Step 1: develop 최신 확인 후 작업 브랜치 분기**

```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing checkout develop
git -C /Users/ksy/Desktop/BASIC/Coding/Duing fetch origin && git -C /Users/ksy/Desktop/BASIC/Coding/Duing status -sb
git -C /Users/ksy/Desktop/BASIC/Coding/Duing checkout -b feat/hero-right-visual-redesign
```

Expected: `develop` 은 `origin/develop` 과 동일(ahead/behind 0), 새 브랜치 `feat/hero-right-visual-redesign` 로 전환. (작업트리에 staged `duing-illustration.png` 가 보이는 것은 정상 — 건드리지 않는다.)

- [ ] **Step 2: 스펙·플랜 문서만 pathspec 커밋**

문서 2개는 아직 untracked 이므로 먼저 인덱스에 추가한 뒤(이미 staged 된 png 와 무관), pathspec 커밋으로 **docs 만** 커밋한다 → png 는 staged 로 남는다.

```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add \
  docs/superpowers/specs/2026-06-28-hero-right-visual-redesign-design.md \
  docs/superpowers/plans/2026-06-28-hero-right-visual-redesign.md
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "docs(web): Hero 우측 비주얼 리디자인 스펙·플랜 추가" -- \
  docs/superpowers/specs/2026-06-28-hero-right-visual-redesign-design.md \
  docs/superpowers/plans/2026-06-28-hero-right-visual-redesign.md
```

Expected: 2개 파일만 커밋. `git show --stat HEAD` 에 png·코드가 **없어야** 한다(문서 2개만). png 는 여전히 staged 로 남는다(`git status` 로 확인).

---

## Task 1: 토스트 순수 로직 모듈 (`hero-activity.ts`)

**Files:**
- Create: `frontend/apps/web/app/_components/sections/hero-activity.ts`
- Test: `frontend/apps/web/test/home/hero-activity.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `frontend/apps/web/test/home/hero-activity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  formatRelativeTime,
  resolveHeroToasts,
  type HeroActivity,
} from '../../app/_components/sections/hero-activity';

// 고정 기준 시각 — 결정적 테스트.
const NOW = new Date('2026-06-28T12:00:00.000Z');

function isoAgo(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe('formatRelativeTime', () => {
  it('1분 미만은 "방금 전"', () => {
    expect(formatRelativeTime(isoAgo(30_000), NOW)).toBe('방금 전');
  });
  it('분 단위', () => {
    expect(formatRelativeTime(isoAgo(3 * 60_000), NOW)).toBe('3분 전');
  });
  it('시간 단위', () => {
    expect(formatRelativeTime(isoAgo(2 * 60 * 60_000), NOW)).toBe('2시간 전');
  });
  it('일 단위', () => {
    expect(formatRelativeTime(isoAgo(3 * 24 * 60 * 60_000), NOW)).toBe('3일 전');
  });
  it('파싱 실패 시 "방금 전"', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('방금 전');
  });
});

describe('resolveHeroToasts', () => {
  it('실활동 2개 → 실제 토스트 2개(매핑된 문구·variant·시간)', () => {
    const activities: HeroActivity[] = [
      { type: 'RECRUIT_OPEN', clubName: '소울비트', occurredAt: isoAgo(3 * 60_000) },
      { type: 'INTERVIEW_RESULT', clubName: '대구대 봉사단', occurredAt: isoAgo(10 * 60_000) },
    ];
    const toasts = resolveHeroToasts(activities, NOW);
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toEqual({
      variant: 'light',
      clubName: '소울비트',
      message: '신규 모집 오픈',
      timeAgo: '3분 전',
    });
    expect(toasts[1]).toEqual({
      variant: 'dark',
      clubName: '대구대 봉사단',
      message: '합격자 발표',
      timeAgo: '10분 전',
    });
  });

  it('실활동 1개 → 실제 1개 + 폴백 1개(slot1 dark)', () => {
    const activities: HeroActivity[] = [
      { type: 'NOTICE_CREATED', clubName: '두잉코드', occurredAt: isoAgo(60_000) },
    ];
    const toasts = resolveHeroToasts(activities, NOW);
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toEqual({
      variant: 'light',
      clubName: '두잉코드',
      message: '새 공지 등록',
      timeAgo: '1분 전',
    });
    expect(toasts[1]).toEqual({
      variant: 'dark',
      clubName: '캠퍼스 동아리',
      message: '합격자 발표',
      timeAgo: '방금 전',
    });
  });

  it('실활동 0개 → 폴백 2개(slot0 light, slot1 dark)', () => {
    const toasts = resolveHeroToasts([], NOW);
    expect(toasts).toHaveLength(2);
    expect(toasts[0].variant).toBe('light');
    expect(toasts[0].clubName).toBe('캠퍼스 동아리');
    expect(toasts[0].message).toBe('신규 모집 오픈');
    expect(toasts[1].variant).toBe('dark');
    expect(toasts[1].message).toBe('합격자 발표');
  });

  it('실활동 2개 초과 → 앞 2개만 사용', () => {
    const activities: HeroActivity[] = [
      { type: 'RECRUIT_OPEN', clubName: 'A', occurredAt: isoAgo(60_000) },
      { type: 'FEE_OPEN', clubName: 'B', occurredAt: isoAgo(60_000) },
      { type: 'EVENT_CREATED', clubName: 'C', occurredAt: isoAgo(60_000) },
    ];
    const toasts = resolveHeroToasts(activities, NOW);
    expect(toasts).toHaveLength(2);
    expect(toasts.map((toast) => toast.clubName)).toEqual(['A', 'B']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run (cwd `frontend/apps/web`): `pnpm exec vitest run test/home/hero-activity.test.ts`
Expected: FAIL — `hero-activity` 모듈/함수 미존재로 import 에러.

- [ ] **Step 3: 순수 로직 구현**

Create `frontend/apps/web/app/_components/sections/hero-activity.ts`:

```ts
// Hero 우측 활동 토스트의 순수 도메인 로직. Server Component 와 분리해 단위 테스트 가능하게 둔다.
// React/DOM 에 의존하지 않는다. Phase C 가 API 응답을 HeroActivity[] 로 매핑해 resolveHeroToasts 에 넘긴다.

export type HeroActivityType =
  | 'RECRUIT_OPEN'
  | 'RECRUIT_CLOSE'
  | 'NOTICE_CREATED'
  | 'INTERVIEW_CREATED'
  | 'INTERVIEW_RESULT'
  | 'EVENT_CREATED'
  | 'FEE_OPEN';

// occurredAt: "이벤트 발생 시각"(ISO 8601). 생성 시각이 아니라 발생 시각 의미.
export type HeroActivity = {
  type: HeroActivityType;
  clubName: string;
  occurredAt: string;
};

export type HeroToastVariant = 'light' | 'dark';

// 프레젠테이션 모델 — HeroActivityToast 가 그대로 받는다.
export type HeroToast = {
  variant: HeroToastVariant;
  clubName: string;
  message: string;
  timeAgo: string;
};

const ACTIVITY_PRESETS: Record<HeroActivityType, { message: string; variant: HeroToastVariant }> = {
  RECRUIT_OPEN: { message: '신규 모집 오픈', variant: 'light' },
  RECRUIT_CLOSE: { message: '모집 마감', variant: 'light' },
  NOTICE_CREATED: { message: '새 공지 등록', variant: 'light' },
  INTERVIEW_CREATED: { message: '면접 일정 등록', variant: 'dark' },
  INTERVIEW_RESULT: { message: '합격자 발표', variant: 'dark' },
  EVENT_CREATED: { message: '행사 등록', variant: 'light' },
  FEE_OPEN: { message: '회비 납부 시작', variant: 'dark' },
};

// 실활동이 부족할 때 채우는 기본 토스트. 슬롯 기준(slot0=light, slot1=dark)으로 시각 균형을 유지하고,
// 실제 동아리명 대신 일반 명칭을 써 초기 서비스에서도 어색하지 않게 한다.
const FALLBACK_TOASTS: readonly HeroToast[] = [
  { variant: 'light', clubName: '캠퍼스 동아리', message: '신규 모집 오픈', timeAgo: '방금 전' },
  { variant: 'dark', clubName: '캠퍼스 동아리', message: '합격자 발표', timeAgo: '방금 전' },
];

const MAX_TOASTS = 2;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// ISO 시각을 now 기준 상대 표현으로. now 를 주입받아 결정적으로 테스트 가능하게 한다.
export function formatRelativeTime(iso: string, now: Date): string {
  const occurred = new Date(iso).getTime();
  if (Number.isNaN(occurred)) return '방금 전';
  const diff = now.getTime() - occurred;
  if (diff < MINUTE_MS) return '방금 전';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}분 전`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}시간 전`;
  return `${Math.floor(diff / DAY_MS)}일 전`;
}

// 실활동 최대 2개를 토스트로 매핑하고, 부족한 슬롯은 폴백으로 채워 항상 정확히 2개를 반환한다.
export function resolveHeroToasts(activities: HeroActivity[], now: Date): HeroToast[] {
  return Array.from({ length: MAX_TOASTS }, (_unused, slot): HeroToast => {
    const activity = activities[slot];
    if (!activity) return FALLBACK_TOASTS[slot];
    const preset = ACTIVITY_PRESETS[activity.type];
    return {
      variant: preset.variant,
      clubName: activity.clubName,
      message: preset.message,
      timeAgo: formatRelativeTime(activity.occurredAt, now),
    };
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run (cwd `frontend/apps/web`): `pnpm exec vitest run test/home/hero-activity.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: 커밋 (pathspec — png 미포함)**

```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "feat(web): Hero 활동 토스트 순수 로직(resolveHeroToasts·formatRelativeTime) 추가" -- \
  frontend/apps/web/app/_components/sections/hero-activity.ts \
  frontend/apps/web/test/home/hero-activity.test.ts
```

Expected: `git show --stat HEAD` 에 2개 파일만(png 미포함).

---

## Task 2: Hero 우측 비주얼 재구성 (`HomeHero.tsx`)

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/HomeHero.tsx`
- Test: `frontend/apps/web/test/home/home-hero.test.tsx`
- Track: `frontend/apps/web/public/duing-illustration.png`

- [ ] **Step 1: 실패하는 렌더 테스트 작성**

Create `frontend/apps/web/test/home/home-hero.test.tsx` (mock 패턴은 기존 `test/home/categories-render.test.tsx` 와 동일):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

import { HeroActivityToast, HeroRightVisual } from '../../app/_components/sections/HomeHero';
import { resolveHeroToasts } from '../../app/_components/sections/hero-activity';

const NOW = new Date('2026-06-28T12:00:00.000Z');
const fallbackToasts = resolveHeroToasts([], NOW);

describe('HeroRightVisual', () => {
  it('목업 카드 카피(트레몰로/두잉코드/면접 확정!)를 렌더하지 않는다', () => {
    render(<HeroRightVisual recruitingCount={1} toasts={fallbackToasts} />);
    expect(screen.queryByText('트레몰로')).not.toBeInTheDocument();
    expect(screen.queryByText('두잉코드')).not.toBeInTheDocument();
    expect(screen.queryByText('면접 확정!')).not.toBeInTheDocument();
  });

  it('일러스트를 alt 와 함께 렌더한다', () => {
    render(<HeroRightVisual recruitingCount={1} toasts={fallbackToasts} />);
    expect(
      screen.getByRole('img', { name: '두잉 — 캠퍼스 동아리 활동 일러스트레이션' }),
    ).toBeInTheDocument();
  });

  it('recruitingCount 분기: number 는 그대로, 0 은 "0", null 은 "—"', () => {
    const { rerender } = render(<HeroRightVisual recruitingCount={5} toasts={fallbackToasts} />);
    expect(screen.getByText('5')).toBeInTheDocument();

    rerender(<HeroRightVisual recruitingCount={0} toasts={fallbackToasts} />);
    expect(screen.getByText('0')).toBeInTheDocument();

    rerender(<HeroRightVisual recruitingCount={null} toasts={fallbackToasts} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('폴백 토스트 2개(캠퍼스 동아리)와 문구를 렌더한다', () => {
    render(<HeroRightVisual recruitingCount={1} toasts={fallbackToasts} />);
    expect(screen.getAllByText('캠퍼스 동아리')).toHaveLength(2);
    expect(screen.getByText('신규 모집 오픈')).toBeInTheDocument();
    expect(screen.getByText('합격자 발표')).toBeInTheDocument();
  });
});

describe('HeroActivityToast', () => {
  it('variant=dark 는 bg-ink-deep, light 는 bg-paper 클래스를 갖는다', () => {
    const { container, rerender } = render(
      <HeroActivityToast variant="dark" clubName="A" message="m" timeAgo="방금 전" />,
    );
    expect(container.firstChild).toHaveClass('bg-ink-deep');

    rerender(<HeroActivityToast variant="light" clubName="A" message="m" timeAgo="방금 전" />);
    expect(container.firstChild).toHaveClass('bg-paper');
  });
});
```

> 참고: Testing Library 의 `getByText` 는 요소의 **직접 텍스트 노드만** 비교하므로, `5`/`0`/`—` 는 `<span className="text-lg">곳</span>` 을 자식으로 가진 div 의 직접 텍스트로 매칭된다("곳" 은 별도 span 이라 무시됨).

- [ ] **Step 2: 테스트 실패 확인**

Run (cwd `frontend/apps/web`): `pnpm exec vitest run test/home/home-hero.test.tsx`
Expected: FAIL — `HeroRightVisual`/`HeroActivityToast` export 미존재.

- [ ] **Step 3-a: import 3줄 추가**

`HomeHero.tsx` 상단 import 블록(기존 4줄) 바로 아래에 추가:

```ts
import Image from 'next/image';
import { cn } from '@/app/_lib/cn';
import { resolveHeroToasts, type HeroToast } from './hero-activity';
```

- [ ] **Step 3-b: `HomeHero` 본문에 토스트 주입 + 우측 렌더 교체**

`const stats = await fetchClubStats();` 바로 다음 줄에 추가:

```ts
  // Phase A: 실활동 미조회 → 빈 입력으로 폴백 토스트 2개. Phase C 에서 [] 를 실데이터로 교체.
  const now = new Date();
  const toasts = resolveHeroToasts([], now);
```

그리고 우측 렌더를 교체한다.
- 기존: `        <HeroCardStack recruitingCount={stats?.recruitingCount ?? null} />`
- 변경: `        <HeroRightVisual recruitingCount={stats?.recruitingCount ?? null} toasts={toasts} />`

- [ ] **Step 3-c: `HeroCardStack` 함수 전체 삭제 후 신규 두 컴포넌트로 교체**

`function HeroCardStack({ recruitingCount }: ...) { ... }` **함수 전체**(목업 음악/두잉코드/STAT 카드 + 회전 모집중 카드)를 삭제하고 아래로 교체:

```tsx
// Test-only export — 테스트에서 직접 렌더하기 위해 노출(런타임은 HomeHero 만 사용).
export function HeroActivityToast({ variant, clubName, message, timeAgo }: HeroToast) {
  const isDark = variant === 'dark';
  return (
    <div
      className={cn(
        'w-[230px] rounded-md px-4 py-3 shadow-3 transition duration-250 ease-duing hover:-translate-y-0.5 hover:shadow-4 motion-reduce:transition-none',
        isDark ? 'bg-ink-deep text-cream' : 'border border-line bg-paper text-ink',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn('h-2 w-2 shrink-0 rounded-full', isDark ? 'bg-warm' : 'bg-sage')}
        />
        <span className={cn('text-[13px] font-bold', isDark ? 'text-cream' : 'text-ink')}>
          {clubName}
        </span>
        <span className={cn('ml-auto text-[11px]', isDark ? 'text-cream/60' : 'text-charcoal-3')}>
          {timeAgo}
        </span>
      </div>
      <div className={cn('mt-1 text-[12.5px]', isDark ? 'text-cream/85' : 'text-charcoal-2')}>
        {message}
      </div>
    </div>
  );
}

// Test-only export — 테스트에서 직접 렌더하기 위해 노출(런타임은 HomeHero 만 사용).
export function HeroRightVisual({
  recruitingCount,
  toasts,
}: {
  recruitingCount: number | null;
  toasts: HeroToast[];
}) {
  return (
    <div className="relative hidden h-[540px] md:block lg:h-[560px]">
      {/* 모집중 카드 — flow 상단(회전·absolute 제거). null="—곳"(중립), 0="0곳"(정당한 0). */}
      <div className="inline-block rounded-md border border-sage-soft bg-sage-mist px-5 py-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-150 motion-reduce:animate-none">
        <div className="font-display text-[36px] font-bold leading-none text-ink">
          {recruitingCount === null ? '—' : recruitingCount}
          <span className="text-lg">곳</span>
        </div>
        <div className="mt-1 text-[11.5px] text-ink/70">이번 학기 모집중</div>
      </div>

      {/* 브랜드 일러스트 — 우측 메인 비주얼. drop-shadow 없음, 드래그 방지. */}
      <Image
        src="/duing-illustration.png"
        alt="두잉 — 캠퍼스 동아리 활동 일러스트레이션"
        width={1536}
        height={1024}
        priority
        fetchPriority="high"
        draggable={false}
        className="mx-auto mt-4 h-auto w-full max-w-[480px] object-contain animate-in fade-in-0 zoom-in-95 duration-700 motion-reduce:animate-none md:max-w-[400px] lg:max-w-[480px]"
      />

      {/* Toast 1 (좌하단) — offset 은 기준값, 최종은 Task 3 실브라우저 QA 로 확정. */}
      <div className="absolute bottom-6 left-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-300 motion-reduce:animate-none md:bottom-4 md:left-2">
        <HeroActivityToast {...toasts[0]} />
      </div>

      {/* Toast 2 (우중단) — offset 은 기준값, 최종은 Task 3 실브라우저 QA 로 확정. */}
      <div className="absolute right-0 top-28 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-500 motion-reduce:animate-none md:right-2 md:top-20">
        <HeroActivityToast {...toasts[1]} />
      </div>
    </div>
  );
}
```

> `Sparkle` import 는 좌측 헤드라인 배지에서 계속 쓰이므로 그대로 둔다(삭제 금지). `SparkleFull` 도 헤드라인에서 사용 중.
> 만약 `pnpm typecheck` 가 `<Image>` 의 `fetchPriority` prop 을 거부하면(타입 미허용), `priority` 가 이미 `fetchpriority="high"` 를 내보내므로 `fetchPriority="high"` 한 줄만 제거한다(기능 동일).

- [ ] **Step 4: 렌더 테스트 통과 확인**

Run (cwd `frontend/apps/web`): `pnpm exec vitest run test/home/home-hero.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: 타입체크 + 전체 테스트 + 린트**

Run (cwd `frontend/apps/web`):
```bash
pnpm typecheck
pnpm exec vitest run
pnpm lint
```
Expected: typecheck 0 에러, 전체 테스트 GREEN, lint 통과. (출력에서 직접 PASS/0 errors 를 확인 — `| tail` 등으로 exit code 를 가리지 말 것.)

- [ ] **Step 6: 커밋 (코드 + png 함께)**

```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add \
  frontend/apps/web/app/_components/sections/HomeHero.tsx \
  frontend/apps/web/test/home/home-hero.test.tsx \
  frontend/apps/web/public/duing-illustration.png
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "feat(web): Hero 우측 비주얼 일러스트 중심 재구성 + 활동 토스트"
```

Expected: `git show --stat HEAD` 에 HomeHero.tsx · home-hero.test.tsx · duing-illustration.png 3개. `git status` 클린.

---

## Task 3: 실브라우저 시각 QA + 토스트 offset 미세조정

> 토스트 offset 은 **기준값**이다. 일러스트의 캐릭터(얼굴/손)를 가리지 않는 최종 위치는 실브라우저로 확인해 확정한다. jsdom 은 시각적 겹침을 못 잡는다.

**Files:** (필요 시) `frontend/apps/web/app/_components/sections/HomeHero.tsx`

- [ ] **Step 1: dev 서버 기동(백그라운드)**

Run (cwd `frontend/apps/web`, 백그라운드): `pnpm dev`
Expected: `http://localhost:3000` 기동.

- [ ] **Step 2: 데스크탑·태블릿 폭에서 우측 비주얼 확인**

Playwright MCP(또는 수동 브라우저)로 `http://localhost:3000` 접속 후:
- 데스크탑 폭 **1280** 과 태블릿 폭 **900** 에서 Hero 우측 스크린샷.
- 확인: ① 목업 3카드 사라짐 ② 모집중 카드가 상단 flow 에 정상 표시 ③ 일러스트가 우측 메인 비주얼 ④ **토스트 2개가 캐릭터(얼굴/손)를 가리지 않음** ⑤ 등장 모션이 일러스트→카드→토스트 순으로 자연스러움.

- [ ] **Step 3: (겹치면) offset 조정**

토스트가 캐릭터를 가리면 `HeroRightVisual` 의 Toast 1/2 래퍼 offset(`bottom-6`/`left-0`/`top-28` 및 `md:*`)을 Tailwind spacing 단위로 조정하고 Step 2 재확인. 안 가리면 변경 없음.

- [ ] **Step 4: reduced-motion 동작 확인**

브라우저 devtools 에서 `prefers-reduced-motion: reduce` 에뮬레이트 후 새로고침 → 등장 애니메이션 없이 모든 요소가 즉시 보이는지 확인(`motion-reduce:animate-none` 검증).

- [ ] **Step 5: dev 서버 종료**

백그라운드 dev 프로세스를 종료한다(시각 QA 종료 시 함께 정리).

- [ ] **Step 6: (offset 변경 시) 커밋**

offset 을 바꿨을 때만:
```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add frontend/apps/web/app/_components/sections/HomeHero.tsx
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "style(web): Hero 토스트 offset 실QA 미세조정"
```
변경이 없으면 이 단계는 건너뛴다.

---

## 리뷰 (구현 완료 후)

FE 표현 계층 단독 변경(권한·상태전이·동시성·Migration·API contract 없음) → 기본 리뷰 `duing-code-reviewer` + `codex:review`. adversarial-review 불요. **리뷰 통과 전 push/PR 금지**(머지·PR 은 사용자 명시 지시 후).

---

## Self-Review (계획 작성자 점검)

- **스펙 커버리지:** 목업 제거·모집중 카드 유지(null="—"/0="0")·일러스트(`next/image`,`object-contain`,`draggable=false`,`priority`+`fetchPriority`)·토스트 2개(variant-only)·폴백 fill(2/1/0)·`occurredAt`·단일 `now`·CSS-only 애니메이션·기존 토큰·CLS 예약·offset QA — 모두 Task 1~3 에 매핑됨. Out of Scope(Phase B/C, 좌측 칩, 새 토큰)는 미구현으로 유지.
- **타입 일관성:** `HeroActivity.occurredAt`, `HeroToast{variant,clubName,message,timeAgo}`, `resolveHeroToasts(activities, now)`, `HeroRightVisual{recruitingCount,toasts}` 가 Task 1·2·테스트 전반에서 동일 시그니처.
- **플레이스홀더:** 모든 코드/명령/기대출력이 구체값. TODO/TBD 없음.

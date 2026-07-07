# 정보(Information) 메뉴 구조 개편 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GNB(PC/태블릿/모바일)의 "공지" 메뉴를 "정보" 메뉴로 바꾸고, 4개 정보성 페이지(/notices, /faq, /terms, /introduce)를 공용 InfoTabs 로 묶는다. URL·SEO 는 그대로 유지한다.

**Architecture:** 단일 정의(SoT) `infoMenu.ts` 를 신설해 InfoTabs·ExploreNav·HomeNav(클라이언트 슬롯)·BottomNav 4곳이 공유한다. 새 라우트/Route Group 없이 공용 `InfoTabs` 컴포넌트를 허브 4페이지에 각각 삽입한다. "정보" 클릭 시 마지막 방문 허브 페이지로 이동(localStorage, `/notices` 폴백)한다.

**Tech Stack:** Next.js 15 App Router(typedRoutes) + React 19, Tailwind(두잉 토큰), next-view-transitions Link, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-07-info-menu-restructure-design.md` — 구현 중 판단이 갈리면 스펙이 우선.

**작업 규칙 (frontend/CLAUDE.md 준수):**
- `any`·`as` 단언 금지(타입 가드/타입 술어 사용), `type` 사용(`interface` 금지)
- 커밋 메시지: Conventional Commits 한국어 (`feat(web): ...`), Co-Authored-By/Generated 라인 금지
- 모든 명령은 `frontend/` cwd 에서 실행. `| tail` 은 exit code 를 가리므로 사용 금지
- push·PR 생성 금지 — 로컬 커밋까지만

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| Create `apps/web/app/_lib/infoMenu.ts` | 정보 섹션 단일 정의: INFO_MENU_ITEMS·isInfoSection·isInfoHubPage·rememberInfoPath·getLastInfoPath |
| Create `apps/web/app/_lib/useLastInfoPath.ts` | "정보" 링크 목적지 훅(초기 기본값 → 마운트 후 localStorage 값, 하이드레이션 안전) |
| Create `apps/web/app/_components/InfoTabs.tsx` | 공용 정보 탭 스트립(링크 내비게이션, 모바일 sticky+가로 스크롤) |
| Create `apps/web/app/_components/InfoNavLink.tsx` | HomeNav(Server Component)용 "정보" 링크 클라이언트 슬롯 |
| Modify `apps/web/app/_components/ExploreNav.tsx` | NAV_ITEMS 공지→정보, 다중 경로 매칭, 마지막 방문 href |
| Modify `apps/web/app/_components/HomeNav.tsx` | 공지 li→InfoNavLink, 최상위 "서비스 소개" li 제거 |
| Modify `apps/web/app/_components/BottomNav.tsx` | 공지 탭→정보 탭(Info 아이콘), 4경로 노출/active, 마지막 방문 href |
| Modify `apps/web/components/duing/Icon.tsx` | `Info` 아이콘 추가 |
| Modify `apps/web/app/notices/_pages/NoticePage.tsx` | active prop 제거 + InfoTabs 삽입 |
| Modify `apps/web/app/notices/[noticeId]/page.tsx` | active prop 제거(3분기, InfoTabs 없음) |
| Modify `apps/web/app/faq/_pages/FaqPage.tsx` | InfoTabs 삽입 |
| Modify `apps/web/app/terms/page.tsx` | 미니 헤더→ExploreNav+InfoTabs |
| Modify `apps/web/app/introduce/page.tsx` | HomeNav→ExploreNav+InfoTabs |
| Modify `apps/web/app/_components/sections/HomeQnaSection.tsx` | "FAQ 전체 보기"→"자주 묻는 질문 전체 보기" |
| Test Create `apps/web/test/lib/info-menu.test.ts`, `apps/web/test/lib/use-last-info-path.test.tsx`, `apps/web/test/components/info-tabs.test.tsx`, `apps/web/test/components/info-nav-link.test.tsx` | 신규 테스트 |
| Test Modify `apps/web/test/components/explore-nav.test.tsx`, `apps/web/test/components/bottom-nav.test.tsx`, `apps/web/test/notices/notices-page.test.tsx`, `apps/web/test/faq/faq-page.test.tsx` | 기존 테스트 갱신 |

브랜치: `feat/info-menu-tabs` (이미 생성, 스펙 커밋 포함). 모든 커밋은 이 브랜치에 쌓는다.

---

### Task 1: infoMenu.ts — 정보 섹션 단일 정의

**Files:**
- Create: `frontend/apps/web/app/_lib/infoMenu.ts`
- Test: `frontend/apps/web/test/lib/info-menu.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/lib/info-menu.test.ts`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_INFO_PATH,
  getLastInfoPath,
  isInfoHubPage,
  isInfoSection,
  rememberInfoPath,
} from '../../app/_lib/infoMenu';

const STORAGE_KEY = 'duing:info-last-path';

beforeEach(() => {
  window.localStorage.clear();
});

describe('isInfoSection — GNB·BottomNav active 판정(섹션 전체)', () => {
  it.each(['/notices', '/faq', '/terms', '/introduce'])(
    '허브 페이지 %s 는 정보 섹션이다',
    (path) => {
      expect(isInfoSection(path)).toBe(true);
    },
  );

  it('공지 상세(/notices/123)도 정보 섹션이다', () => {
    expect(isInfoSection('/notices/123')).toBe(true);
  });

  it('유사 접두 경로(/notifications)는 정보 섹션이 아니다', () => {
    expect(isInfoSection('/notifications')).toBe(false);
  });

  it('무관 경로(/clubs)는 정보 섹션이 아니다', () => {
    expect(isInfoSection('/clubs')).toBe(false);
  });
});

describe('isInfoHubPage — InfoTabs 허브 페이지 판정(상세 제외)', () => {
  it.each(['/notices', '/faq', '/terms', '/introduce'])('%s 는 허브 페이지다', (path) => {
    expect(isInfoHubPage(path)).toBe(true);
  });

  it('상세 페이지(/notices/123)는 허브가 아니다', () => {
    expect(isInfoHubPage('/notices/123')).toBe(false);
  });
});

describe('rememberInfoPath / getLastInfoPath — 마지막 방문 기억', () => {
  it('허브 페이지 방문을 기록하고 그대로 돌려준다', () => {
    rememberInfoPath('/faq');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('/faq');
    expect(getLastInfoPath()).toBe('/faq');
  });

  it('허브가 아닌 경로(/notices/123)는 기록하지 않는다', () => {
    rememberInfoPath('/faq');
    rememberInfoPath('/notices/123');
    expect(getLastInfoPath()).toBe('/faq');
  });

  it('기록이 없으면 기본 경로(/notices)를 반환한다', () => {
    expect(getLastInfoPath()).toBe(DEFAULT_INFO_PATH);
  });

  it('저장값이 유효한 허브 경로가 아니면 기본 경로로 폴백한다', () => {
    window.localStorage.setItem(STORAGE_KEY, '/evil');
    expect(getLastInfoPath()).toBe(DEFAULT_INFO_PATH);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run (cwd `frontend/`): `pnpm --filter @duing/web test -- --run test/lib/info-menu.test.ts`
Expected: FAIL — `Cannot find module '../../app/_lib/infoMenu'`

- [ ] **Step 3: 구현**

`frontend/apps/web/app/_lib/infoMenu.ts`:

```ts
// 정보(Information) 섹션 단일 정의(SoT) — InfoTabs·ExploreNav·InfoNavLink(HomeNav)·BottomNav 가 공유한다.
// 새 정보 페이지 추가 = INFO_MENU_ITEMS 에 1줄 추가(탭 노출·GNB/탭바 active·저장값 검증이 함께 따라온다).
export const INFO_MENU_ITEMS = [
  { label: '공지', href: '/notices' },
  { label: '자주 묻는 질문', href: '/faq' },
  { label: '운영정책', href: '/terms' },
  { label: '서비스 소개', href: '/introduce' },
] as const;

export type InfoPath = (typeof INFO_MENU_ITEMS)[number]['href'];

export const DEFAULT_INFO_PATH: InfoPath = '/notices';

const LAST_INFO_PATH_STORAGE_KEY = 'duing:info-last-path';

/**
 * 정보 섹션 여부(상세 포함 — /notices/123 도 true).
 * GNB·BottomNav 의 "정보" active 판정 전용. InfoTabs 노출 판단에는 쓰지 않는다
 * (노출은 조건부 렌더링이 아니라 허브 4페이지에 대한 수동 배치로 결정).
 */
export function isInfoSection(pathname: string): boolean {
  return INFO_MENU_ITEMS.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
  );
}

/**
 * InfoTabs 를 표시하는 허브 페이지 여부(exact 매칭 — 상세 페이지는 false).
 * 방문 기록 가드·저장값 검증 전용.
 */
export function isInfoHubPage(pathname: string): pathname is InfoPath {
  return INFO_MENU_ITEMS.some((item) => item.href === pathname);
}

/** 마지막 방문 허브 경로를 기록한다. 허브 페이지가 아니면 무시. SSR·localStorage 차단 환경도 무시. */
export function rememberInfoPath(pathname: string): void {
  if (typeof window === 'undefined') return;
  if (!isInfoHubPage(pathname)) return;
  try {
    window.localStorage.setItem(LAST_INFO_PATH_STORAGE_KEY, pathname);
  } catch {
    // localStorage 차단 — 기억 기능만 저하(기본 /notices 진입), 탐색 자체는 정상이라 조용히 무시.
  }
}

/**
 * GNB·BottomNav "정보" 메뉴의 이동 정책 단일 지점 — 항상 유효한 허브 경로를 반환한다.
 * 저장값이 없거나 허브 경로가 아니면(손상 포함) DEFAULT_INFO_PATH(/notices) 폴백.
 */
export function getLastInfoPath(): InfoPath {
  if (typeof window === 'undefined') return DEFAULT_INFO_PATH;
  try {
    const stored = window.localStorage.getItem(LAST_INFO_PATH_STORAGE_KEY);
    if (stored !== null && isInfoHubPage(stored)) return stored;
    return DEFAULT_INFO_PATH;
  } catch {
    return DEFAULT_INFO_PATH;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/lib/info-menu.test.ts`
Expected: PASS (16 tests — it.each 전개 포함)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/_lib/infoMenu.ts apps/web/test/lib/info-menu.test.ts
git commit -m "feat(web): 정보 섹션 단일 정의 infoMenu 유틸 추가"
```

---

### Task 2: useLastInfoPath — "정보" 링크 목적지 훅

**Files:**
- Create: `frontend/apps/web/app/_lib/useLastInfoPath.ts`
- Test: `frontend/apps/web/test/lib/use-last-info-path.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/lib/use-last-info-path.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLastInfoPath } from '../../app/_lib/useLastInfoPath';

const STORAGE_KEY = 'duing:info-last-path';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useLastInfoPath', () => {
  it('기록이 없으면 기본 경로(/notices)를 반환한다', () => {
    const { result } = renderHook(() => useLastInfoPath('/clubs'));
    expect(result.current).toBe('/notices');
  });

  it('마운트 후 저장된 허브 경로로 교체된다', () => {
    window.localStorage.setItem(STORAGE_KEY, '/terms');
    const { result } = renderHook(() => useLastInfoPath('/clubs'));
    expect(result.current).toBe('/terms');
  });

  it('pathname 이 바뀌면 저장값을 다시 읽는다 (root layout 상주 컴포넌트 대응)', () => {
    const { result, rerender } = renderHook(({ pathname }) => useLastInfoPath(pathname), {
      initialProps: { pathname: '/clubs' },
    });
    expect(result.current).toBe('/notices');

    window.localStorage.setItem(STORAGE_KEY, '/faq');
    rerender({ pathname: '/faq' });
    expect(result.current).toBe('/faq');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test -- --run test/lib/use-last-info-path.test.tsx`
Expected: FAIL — `Cannot find module '../../app/_lib/useLastInfoPath'`

- [ ] **Step 3: 구현**

`frontend/apps/web/app/_lib/useLastInfoPath.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

import { DEFAULT_INFO_PATH, getLastInfoPath, type InfoPath } from './infoMenu';

/**
 * GNB·하단 탭바 "정보" 링크의 목적지(마지막 방문 허브 경로, 없으면 /notices).
 * 초기 렌더는 기본 경로로 서버 렌더와 일치시키고(하이드레이션 mismatch 방지) 마운트 후 교체한다.
 * pathname 을 deps 로 받는 이유: BottomNav 는 root layout 에 1회 마운트되어 내비게이션 간
 * 인스턴스가 유지되므로, 경로가 바뀔 때마다 다시 읽지 않으면 이전 저장값이 남는다.
 */
export function useLastInfoPath(pathname: string): InfoPath {
  const [lastInfoPath, setLastInfoPath] = useState<InfoPath>(DEFAULT_INFO_PATH);

  useEffect(() => {
    setLastInfoPath(getLastInfoPath());
  }, [pathname]);

  return lastInfoPath;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/lib/use-last-info-path.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/_lib/useLastInfoPath.ts apps/web/test/lib/use-last-info-path.test.tsx
git commit -m "feat(web): 정보 메뉴 마지막 방문 경로 훅 useLastInfoPath 추가"
```

---

### Task 3: InfoTabs — 공용 정보 탭 스트립

**Files:**
- Create: `frontend/apps/web/app/_components/InfoTabs.tsx`
- Test: `frontend/apps/web/test/components/info-tabs.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/components/info-tabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn<() => string>();
vi.mock('next/navigation', () => ({ usePathname: () => mockUsePathname() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { InfoTabs } from '../../app/_components/InfoTabs';

beforeEach(() => {
  window.localStorage.clear();
});

describe('InfoTabs', () => {
  it('탭 4개(공지·자주 묻는 질문·운영정책·서비스 소개)를 기존 URL 로 렌더한다', () => {
    mockUsePathname.mockReturnValue('/notices');
    render(<InfoTabs />);

    expect(screen.getByRole('navigation', { name: '정보' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: '공지' })).toHaveAttribute('href', '/notices');
    expect(screen.getByRole('link', { name: '자주 묻는 질문' })).toHaveAttribute('href', '/faq');
    expect(screen.getByRole('link', { name: '운영정책' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: '서비스 소개' })).toHaveAttribute('href', '/introduce');
  });

  it('현재 경로 탭에만 aria-current="page" 를 표시한다', () => {
    mockUsePathname.mockReturnValue('/terms');
    render(<InfoTabs />);

    expect(screen.getByRole('link', { name: '운영정책' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '공지' })).not.toHaveAttribute('aria-current');
  });

  it('허브 방문 시 마지막 방문 경로를 기록한다', () => {
    mockUsePathname.mockReturnValue('/faq');
    render(<InfoTabs />);
    expect(window.localStorage.getItem('duing:info-last-path')).toBe('/faq');
  });

  it('모바일 sticky, 데스크탑 static 이 의도된 UX — nav 에 sticky·md:static 클래스', () => {
    mockUsePathname.mockReturnValue('/notices');
    render(<InfoTabs />);
    const nav = screen.getByRole('navigation', { name: '정보' });
    expect(nav).toHaveClass('sticky');
    expect(nav).toHaveClass('md:static');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test -- --run test/components/info-tabs.test.tsx`
Expected: FAIL — `Cannot find module '../../app/_components/InfoTabs'`

- [ ] **Step 3: 구현**

`frontend/apps/web/app/_components/InfoTabs.tsx`:

```tsx
'use client';

// 정보 섹션 공용 탭 스트립 — 허브 4페이지(/notices·/faq·/terms·/introduce)의 GNB 바로 아래에
// 수동 배치한다(조건부 렌더링 아님 — 상세 페이지에는 배치하지 않는 것이 정책, 스펙 결정 10).
// 페이지 이동 링크이므로 Radix Tabs(인페이지 상태 위젯)가 아니라 nav+Link 시맨틱을 쓴다.
// sticky 는 모바일 전용이 의도된 UX(md+ 는 static) — 전역 헤더가 sticky 가 아닌 구조와 일관.

import { useEffect } from 'react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { cn } from '@/app/_lib/cn';
import { INFO_MENU_ITEMS, rememberInfoPath } from '@/app/_lib/infoMenu';

export function InfoTabs() {
  const pathname = usePathname();

  // 마운트 1회가 아니라 pathname 변경마다 기록 — 인스턴스가 유지된 채 경로만 바뀌는 경우 대응.
  useEffect(() => {
    rememberInfoPath(pathname);
  }, [pathname]);

  return (
    <nav
      aria-label="정보"
      className="sticky top-0 z-40 border-b border-line bg-cream/95 backdrop-blur md:static"
    >
      {/* overflow 래퍼의 pb-px: 활성 탭 언더라인(-mb-px)이 세로로 잘리는 것을 방지(ClubDetailTabs 함정) */}
      <div className="max-w-layout mx-auto overflow-x-auto px-4 pb-px sm:px-6 md:overflow-visible md:px-10 md:pb-0">
        <ul className="flex w-max min-w-full gap-6 md:gap-8">
          {INFO_MENU_ITEMS.map((item) => {
            const on = pathname === item.href;
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex min-h-[44px] items-center whitespace-nowrap border-b-[2.5px] text-[14px] font-semibold transition-colors',
                    on ? 'border-ink text-ink' : 'border-transparent text-charcoal-3 hover:text-ink',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/components/info-tabs.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/_components/InfoTabs.tsx apps/web/test/components/info-tabs.test.tsx
git commit -m "feat(web): 정보 섹션 공용 InfoTabs 컴포넌트 추가"
```

---

### Task 4: ExploreNav — 공지 항목을 정보로 전환

**Files:**
- Modify: `frontend/apps/web/app/_components/ExploreNav.tsx`
- Test: `frontend/apps/web/test/components/explore-nav.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가/갱신**

`test/components/explore-nav.test.tsx` 전체를 아래로 교체
(기존 파일은 4번째 테스트에서 `active="공지"` prop 을 쓰는데, 사용처가 사라지므로 prop 없이 pathname 매칭으로 검증한다):

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn<() => string>();
vi.mock('next/navigation', () => ({ usePathname: () => mockUsePathname() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('../../app/_components/BrandMark', () => ({ BrandMark: () => <span>두잉</span> }));
vi.mock('../../app/_components/NotificationBell', () => ({ NotificationBell: () => <button>알림</button> }));
vi.mock('../../app/_components/HomeNavAuthSlot', () => ({ HomeNavAuthSlot: () => <span>인증</span> }));

import { ExploreNav } from '../../app/_components/ExploreNav';

beforeEach(() => {
  window.localStorage.clear();
});

describe('ExploreNav — 동아리·공지 상세 모바일 숨김', () => {
  it('동아리 목록(/clubs)에서는 브랜드 바가 모바일에서도 노출(hidden 아님)', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav slimOnMobile />);
    expect(screen.getByRole('banner')).not.toHaveClass('hidden');
  });

  it('동아리 상세(/clubs/123)에서는 모바일에서 브랜드 바를 숨긴다(hidden md:block)', () => {
    mockUsePathname.mockReturnValue('/clubs/123');
    render(<ExploreNav slimOnMobile />);
    const banner = screen.getByRole('banner');
    expect(banner).toHaveClass('hidden');
    expect(banner).toHaveClass('md:block');
  });

  it('상세 하위 경로(/clubs/123/sub)는 숨기지 않는다', () => {
    mockUsePathname.mockReturnValue('/clubs/123/sub');
    render(<ExploreNav slimOnMobile />);
    expect(screen.getByRole('banner')).not.toHaveClass('hidden');
  });

  it('공지 상세(/notices/123)에서도 모바일에서 브랜드 바를 숨긴다', () => {
    mockUsePathname.mockReturnValue('/notices/123');
    render(<ExploreNav slimOnMobile />);
    const banner = screen.getByRole('banner');
    expect(banner).toHaveClass('hidden');
    expect(banner).toHaveClass('md:block');
  });
});

describe('ExploreNav — 정보 메뉴', () => {
  it('메뉴 라벨은 공지가 아니라 정보다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav />);
    expect(screen.getByRole('link', { name: '정보' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '공지' })).not.toBeInTheDocument();
  });

  it.each(['/notices', '/faq', '/terms', '/introduce', '/notices/123'])(
    '%s 에서 정보 메뉴가 활성이다',
    (path) => {
      mockUsePathname.mockReturnValue(path);
      render(<ExploreNav />);
      expect(screen.getByRole('link', { name: '정보' })).toHaveClass('text-ink-deep');
    },
  );

  it('정보 섹션 밖(/clubs)에서는 정보 메뉴가 비활성이다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav />);
    expect(screen.getByRole('link', { name: '정보' })).not.toHaveClass('text-ink-deep');
  });

  it('정보 메뉴는 마지막 방문 허브 경로로 이동한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/faq');
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/faq');
  });

  it('방문 이력이 없으면 정보 메뉴는 /notices 로 이동한다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/notices');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test -- --run test/components/explore-nav.test.tsx`
Expected: FAIL — "정보 메뉴" describe 의 테스트들이 `Unable to find role="link" name="정보"` 로 실패 (상세 숨김 4건은 PASS 유지)

- [ ] **Step 3: 구현**

`apps/web/app/_components/ExploreNav.tsx` 에서 아래 3곳을 수정한다.

(a) import 추가 (기존 `import { cn } ...` 아래):

```tsx
import { cn } from '@/app/_lib/cn';
import { DEFAULT_INFO_PATH, isInfoSection, type InfoPath } from '@/app/_lib/infoMenu';
import { useLastInfoPath } from '@/app/_lib/useLastInfoPath';
```

(b) NAV_ITEMS 정의부(기존 L12-20)를 교체:

```tsx
type NavItem = {
  label: string;
  href: '/' | '/clubs' | '/facilities' | '/calendar' | InfoPath;
  /** 단일 prefix 로 판정할 수 없는 항목(정보)만 지정 — 있으면 기본 exact+prefix 규칙 대신 사용. */
  match?: (pathname: string) => boolean;
};

const NAV_ITEMS: readonly NavItem[] = [
  { label: '홈', href: '/' },
  { label: '탐색', href: '/clubs' },
  { label: '시설', href: '/facilities' },
  { label: '캘린더', href: '/calendar' },
  // 정보: /notices·/faq·/terms·/introduce 전체에서 활성, 이동은 마지막 방문 허브 경로(아래 참고).
  { label: '정보', href: DEFAULT_INFO_PATH, match: isInfoSection },
];
```

(c) 컴포넌트 본문 — `isActive` 에 match 분기 추가, 렌더에서 정보 항목 href 를 마지막 방문 경로로:

```tsx
export function ExploreNav({ active, floating = false, slimOnMobile = false }: Props) {
  const pathname = usePathname();
  const lastInfoPath = useLastInfoPath(pathname);

  // 동아리·공지 상세(/clubs/{id}, /notices/{id})는 자체 상단 액션바를 쓰는 포커스 뷰라 모바일에서 이 브랜드 바를 숨긴다.
  // 시설 상세(/facilities/{id})는 자체 액션바가 없는 유틸리티 뷰라 브랜드 바를 유지한다.
  const isDetailFocus = /^\/(clubs|notices)\/\d+$/.test(pathname);

  const isActive = (item: NavItem): boolean => {
    if (active) return item.label === active;
    if (item.match) return item.match(pathname);
    if (item.href === '/') return pathname === '/';
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };
```

렌더 map 내부(기존 L62-77) — Link href 만 변경:

```tsx
          {NAV_ITEMS.map((item) => {
            const on = isActive(item);
            // match 가 있는 항목(정보)은 고정 href 대신 마지막 방문 허브 경로로 이동한다(getLastInfoPath 단일 정책).
            const linkHref = item.match ? lastInfoPath : item.href;
            return (
              <li key={item.label}>
                <Link
                  href={linkHref}
                  className={`relative py-1 ${on ? 'text-ink-deep' : 'text-charcoal-3 hover:text-charcoal'}`}
                >
                  {item.label}
                  {on && (
                    <span className="absolute -bottom-1 left-0 right-0 h-[2px] rounded-full bg-ink" />
                  )}
                </Link>
              </li>
            );
          })}
```

`type NavItem = (typeof NAV_ITEMS)[number];` 라인(기존 L20)은 삭제한다(명시 타입으로 대체됨).
`active` prop 과 관련 로직은 유지한다(스펙 결정 — 사용처만 제거).

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/components/explore-nav.test.tsx`
Expected: PASS (13 tests — it.each 전개 포함)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/_components/ExploreNav.tsx apps/web/test/components/explore-nav.test.tsx
git commit -m "feat(web): ExploreNav 공지 메뉴를 정보 메뉴로 전환(다중 경로 활성·마지막 방문 이동)"
```

---

### Task 5: Icon(Info) 추가 + BottomNav 정보 탭 전환

**Files:**
- Modify: `frontend/apps/web/components/duing/Icon.tsx` (Megaphone 함수 아래에 Info 추가)
- Modify: `frontend/apps/web/app/_components/BottomNav.tsx`
- Test: `frontend/apps/web/test/components/bottom-nav.test.tsx`

- [ ] **Step 1: 실패하는 테스트 갱신**

`test/components/bottom-nav.test.tsx` 에서 아래를 수정한다.
localStorage 초기화를 위해 상단 import 에 `beforeEach` 를 추가하고 describe 안 첫 줄에 넣는다:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
```

```tsx
describe('BottomNav', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
```

기존 테스트 중 4건을 교체하고 3건을 추가한다:

(1) 첫 테스트(L12-21)의 라벨 교체:

```tsx
  it('공개 탭 영역(/clubs)에서 5탭(홈·탐색·시설·캘린더·정보)이 노출되고 탐색이 활성이다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<BottomNav />);

    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('link', { name: '정보' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '공지' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '탐색' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
  });
```

(2) `공지 목록(/notices)에서는 공지 탭이 활성이다` (L60-64) 교체:

```tsx
  it('공지 목록(/notices)에서는 정보 탭이 활성이다', () => {
    mockUsePathname.mockReturnValue('/notices');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-current', 'page');
  });
```

(3) `비-탭 공개 경로(/introduce)에서도 미노출이다` (L72-76) — 노출로 반전:

```tsx
  it('서비스 소개(/introduce)는 정보 섹션이라 탭바가 노출되고 정보 탭이 활성이다', () => {
    mockUsePathname.mockReturnValue('/introduce');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-current', 'page');
  });
```

(4) `총동연 FAQ(/faq)에서도 탭바가 미노출이다` (L78-82) — 노출로 반전:

```tsx
  it('자주 묻는 질문(/faq)은 정보 섹션이라 탭바가 노출되고 정보 탭이 활성이다', () => {
    mockUsePathname.mockReturnValue('/faq');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-current', 'page');
  });
```

(5) 마지막에 테스트 3건 추가 (`/notifications` 테스트 뒤):

```tsx
  it('운영정책(/terms)도 정보 섹션이라 탭바가 노출되고 정보 탭이 활성이다', () => {
    mockUsePathname.mockReturnValue('/terms');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-current', 'page');
  });

  it('정보 탭은 마지막 방문 허브 경로로 이동한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/terms');
    mockUsePathname.mockReturnValue('/clubs');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/terms');
  });

  it('방문 이력이 없으면 정보 탭은 /notices 로 이동한다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/notices');
  });
```

유지되는 기존 테스트: `/facilities`·`/facilities/12`·`/`·`/clubs/123`(미노출)·`/clubs/123/sub`·
`/notices/123`(미노출 — 상세 정책 유지)·`/me`(미노출)·`/notifications`(오매칭 방지).
`next/link` mock 이 없는 파일이므로 BottomNav 의 next-view-transitions Link 렌더를 위해 기존 그대로 둔다
(현재도 mock 없이 통과 중 — next-view-transitions 가 jsdom 에서 일반 앵커로 렌더된다).

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test -- --run test/components/bottom-nav.test.tsx`
Expected: FAIL — 정보 라벨/노출 관련 테스트들 실패, 기존 유지 테스트는 PASS

- [ ] **Step 3: Info 아이콘 추가**

`apps/web/components/duing/Icon.tsx` 의 `Megaphone` 함수(L212-230) 바로 아래에 추가
(파일 내 다른 아이콘과 동일한 stroke 스타일):

```tsx
export function Info({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}
```

- [ ] **Step 4: BottomNav 구현**

`apps/web/app/_components/BottomNav.tsx` 를 아래 전체 내용으로 교체:

```tsx
'use client';

// 공개 콘텐츠용 모바일 하단 탭바 (md:hidden) — 홈·탐색·시설·캘린더·정보 5탭.
// 5탭 모두 공개 라우트라 게스트도 동일 동작. 정보 탭은 정보 섹션 전체(/notices·/faq·/terms·/introduce)에
// 매칭되고, 이동은 마지막 방문 허브 경로(getLastInfoPath 단일 정책, 기본 /notices)다.
// 개인영역(/me)·도구 콘솔(/manage·/admin)·포커스 플로우(/apply)·인증에서는 미노출(activeHref === null → return null).
// root(layout.tsx)에 1회 마운트하고 usePathname 으로 가시성/활성을 판단한다.
// 데스크탑은 기존 상단 HomeNav/ExploreNav 유지(이 바는 md:hidden).

import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { cn } from '@/app/_lib/cn';
import { DEFAULT_INFO_PATH, isInfoSection } from '@/app/_lib/infoMenu';
import { useLastInfoPath } from '@/app/_lib/useLastInfoPath';
import { Building, Calendar, Compass, Home, Info } from '@/components/duing/Icon';

const TABS = [
  { label: '홈', href: '/', Icon: Home },
  { label: '탐색', href: '/clubs', Icon: Compass },
  { label: '시설', href: '/facilities', Icon: Building },
  { label: '캘린더', href: '/calendar', Icon: Calendar },
  { label: '정보', href: DEFAULT_INFO_PATH, Icon: Info },
] as const;

// 현재 경로가 어느 탭에 속하는지 — 홈은 정확히, 정보는 섹션 매칭, 나머지는 prefix(상세/하위 포함). 탭 밖이면 null.
function matchTabHref(pathname: string): string | null {
  if (pathname === '/') return '/';
  // 동아리·공지 상세(/clubs/{id}, /notices/{id})는 자체 상단 액션바를 쓰는 포커스 뷰라 탭바를 숨긴다.
  // 시설 상세(/facilities/{id})는 자체 액션바가 없는 유틸리티 뷰라 탭바를 유지한다(포커스 뷰 아님).
  // 정보 섹션 판정보다 먼저 — 공지 상세는 정보 섹션이지만 탭바를 숨기는 기존 정책을 유지한다.
  if (/^\/(clubs|notices)\/\d+$/.test(pathname)) return null;
  // 정보 탭은 단일 prefix 가 아니라 정보 섹션 전체에 매칭된다.
  if (isInfoSection(pathname)) return DEFAULT_INFO_PATH;
  const matched = TABS.find(
    (tab) => tab.href !== '/' && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)),
  );
  return matched ? matched.href : null;
}

export function BottomNav() {
  const pathname = usePathname();
  const activeHref = matchTabHref(pathname);
  const lastInfoPath = useLastInfoPath(pathname);

  if (activeHref === null) return null;

  return (
    <>
      {/* 고정 탭바가 콘텐츠를 가리지 않도록 스크롤 여유(탭바 높이 + 세이프에어리어) */}
      <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-cream/90 font-body backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex">
          {TABS.map(({ label, href, Icon }) => {
            const on = activeHref === href;
            // 정보 탭만 마지막 방문 허브 경로로 이동한다(다른 탭은 고정 href).
            const linkHref = href === DEFAULT_INFO_PATH ? lastInfoPath : href;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={linkHref}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'relative flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold motion-safe:transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink',
                    on ? 'text-ink' : 'text-charcoal-3',
                  )}
                >
                  {on && (
                    <span className="absolute top-0 left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full bg-ink" />
                  )}
                  <Icon size={22} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/components/bottom-nav.test.tsx`
Expected: PASS (15 tests)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/components/duing/Icon.tsx apps/web/app/_components/BottomNav.tsx apps/web/test/components/bottom-nav.test.tsx
git commit -m "feat(web): 모바일 하단 탭바 공지 탭을 정보 탭으로 전환(4경로 노출·Info 아이콘)"
```

---

### Task 6: InfoNavLink + HomeNav 정리

**Files:**
- Create: `frontend/apps/web/app/_components/InfoNavLink.tsx`
- Modify: `frontend/apps/web/app/_components/HomeNav.tsx`
- Test: `frontend/apps/web/test/components/info-nav-link.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/components/info-nav-link.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn<() => string>();
vi.mock('next/navigation', () => ({ usePathname: () => mockUsePathname() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { InfoNavLink } from '../../app/_components/InfoNavLink';

beforeEach(() => {
  window.localStorage.clear();
});

describe('InfoNavLink — HomeNav 용 정보 링크 슬롯', () => {
  it('방문 이력이 없으면 /notices 로 이동한다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/notices');
  });

  it('마지막 방문 허브 경로로 이동한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/introduce');
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/introduce');
  });

  it('className 을 링크에 전달한다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink className="text-charcoal-3" />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveClass('text-charcoal-3');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test -- --run test/components/info-nav-link.test.tsx`
Expected: FAIL — `Cannot find module '../../app/_components/InfoNavLink'`

- [ ] **Step 3: InfoNavLink 구현**

`frontend/apps/web/app/_components/InfoNavLink.tsx`:

```tsx
'use client';

import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { useLastInfoPath } from '@/app/_lib/useLastInfoPath';

/**
 * HomeNav(Server Component)용 "정보" 링크 — 마지막 방문 허브 경로 이동이 클라이언트 훅을
 * 요구해 HomeNavAdminLink/HomeNavAuthSlot 처럼 슬롯으로 분리했다. 이동 정책은 getLastInfoPath 단일 지점.
 */
export function InfoNavLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const lastInfoPath = useLastInfoPath(pathname);

  return (
    <Link href={lastInfoPath} className={className}>
      정보
    </Link>
  );
}
```

- [ ] **Step 4: HomeNav 수정**

`apps/web/app/_components/HomeNav.tsx` — import 추가:

```tsx
import { HomeNavAdminLink } from './HomeNavAdminLink';
import { HomeNavAuthSlot } from './HomeNavAuthSlot';
import { InfoNavLink } from './InfoNavLink';
```

공지 li(기존 L51-55)와 서비스 소개 li(기존 L56-60)를 아래 하나로 교체
(서비스 소개는 정보 → 서비스 소개로 진입 경로만 이동, 페이지는 유지):

```tsx
          <li>
            <InfoNavLink className={inactiveLink} />
          </li>
```

결과 메뉴: 홈 | 탐색 | 시설 | 캘린더 | 정보 | 총동연(ADMIN 전용).
`ml-6` 구분 클래스는 서비스 소개 li 와 함께 제거된다.

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/components/info-nav-link.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/app/_components/InfoNavLink.tsx apps/web/app/_components/HomeNav.tsx apps/web/test/components/info-nav-link.test.tsx
git commit -m "feat(web): HomeNav 공지·서비스 소개 메뉴를 정보 메뉴로 통합"
```

---

### Task 7: 허브 4페이지 통합 + FAQ 라벨 통일

**Files:**
- Modify: `frontend/apps/web/app/notices/_pages/NoticePage.tsx`
- Modify: `frontend/apps/web/app/notices/[noticeId]/page.tsx`
- Modify: `frontend/apps/web/app/faq/_pages/FaqPage.tsx`
- Modify: `frontend/apps/web/app/terms/page.tsx`
- Modify: `frontend/apps/web/app/introduce/page.tsx`
- Modify: `frontend/apps/web/app/_components/sections/HomeQnaSection.tsx`
- Test Modify: `frontend/apps/web/test/notices/notices-page.test.tsx`, `frontend/apps/web/test/faq/faq-page.test.tsx`

- [ ] **Step 1: 페이지 테스트에 InfoTabs 스텁 추가**

InfoTabs 는 usePathname·localStorage 를 사용하므로 페이지 테스트에서는 ExploreNav 스텁과
같은 방식으로 대체한다.

`test/notices/notices-page.test.tsx` — 기존 ExploreNav mock(L7-9) 아래에 추가:

```tsx
vi.mock('../../app/_components/InfoTabs', () => ({
  InfoTabs: () => <nav aria-label="정보" />,
}));
```

`test/faq/faq-page.test.tsx` — 기존 ExploreNav mock(L8-10) 아래에 동일하게 추가:

```tsx
vi.mock('../../app/_components/InfoTabs', () => ({
  InfoTabs: () => <nav aria-label="정보" />,
}));
```

- [ ] **Step 2: NoticePage — active prop 제거 + InfoTabs 삽입**

`apps/web/app/notices/_pages/NoticePage.tsx` import 추가(기존 ExploreNav import 아래):

```tsx
import { ExploreNav } from '../../_components/ExploreNav';
import { InfoTabs } from '../../_components/InfoTabs';
```

렌더(기존 L260)를 교체:

```tsx
      <ExploreNav slimOnMobile />
      <InfoTabs />
```

(pathname `/notices` 가 정보 메뉴 다중 매칭에 걸리므로 `active="공지"` 강제가 더는 필요 없다.)

- [ ] **Step 3: 공지 상세 — active prop 제거 (3분기)**

`apps/web/app/notices/[noticeId]/page.tsx` 의 세 렌더 분기(L44·L56·L69)에서 모두:

```tsx
        <ExploreNav slimOnMobile />
```

로 교체한다(`active="공지"` 제거만 — InfoTabs 는 삽입하지 않는다. 상세 정책: 스펙 결정 10).

- [ ] **Step 4: FaqPage — InfoTabs 삽입**

`apps/web/app/faq/_pages/FaqPage.tsx` import 추가(기존 L18 ExploreNav import 아래):

```tsx
import { ExploreNav } from '../../_components/ExploreNav';
import { InfoTabs } from '../../_components/InfoTabs';
```

렌더(기존 L151)를 교체:

```tsx
      <ExploreNav slimOnMobile />
      <InfoTabs />
```

`faq/page.tsx` 의 `<Suspense fallback={null}>` 경계는 그대로 둔다(제거 시 빌드 에러 — CSR bailout).

- [ ] **Step 5: terms — 미니 헤더를 ExploreNav + InfoTabs 로 교체**

`apps/web/app/terms/page.tsx`:

import 교체 — 기존:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';

import { BrandMark } from '@/components/duing/BrandMark';
import { HomeFooter } from '@/app/_components/HomeFooter';
```

새로:

```tsx
import type { Metadata } from 'next';

import { ExploreNav } from '@/app/_components/ExploreNav';
import { InfoTabs } from '@/app/_components/InfoTabs';
import { HomeFooter } from '@/app/_components/HomeFooter';
```

(교체 전 `grep -n "Link\|BrandMark" apps/web/app/terms/page.tsx` 로 헤더 외 사용처가 없는지
확인한다 — 본문 목차는 `<a href="#...">` 앵커라 Link 미사용이어야 정상. 남은 사용처가 있으면 import 유지.)

미니 헤더 블록(기존 L23-32, `<header>...</header>`)을 교체:

```tsx
      <ExploreNav slimOnMobile />
      <InfoTabs />
```

본문 `<main className="mx-auto max-w-3xl ...">`·약관 전문(RETENTION_PERIOD 문구 포함)·HomeFooter 는 그대로 유지.

- [ ] **Step 6: introduce — HomeNav 를 ExploreNav + InfoTabs 로 교체**

`apps/web/app/introduce/page.tsx`:

import 교체 — 기존 `import { HomeNav } from '../_components/HomeNav';` 를:

```tsx
import { ExploreNav } from '../_components/ExploreNav';
import { InfoTabs } from '../_components/InfoTabs';
```

렌더 교체 — 기존:

```tsx
      {/* 모바일에선 글로벌 링크를 슬림화 — 소개 페이지는 자체 CTA(둘러보기·등록)가 주 동선. */}
      <HomeNav slimOnMobile />
```

새로:

```tsx
      {/* 모바일에선 글로벌 링크를 슬림화 — 소개 페이지는 자체 CTA(둘러보기·등록)가 주 동선.
          ExploreNav 사용: pathname 기반 active 로 정보 메뉴에 밑줄이 잡힌다(HomeNav 는 홈 고정 active). */}
      <ExploreNav slimOnMobile />
      <InfoTabs />
```

루트 div 의 `overflow-x-clip` 은 유지한다(overflow-x: clip 은 sticky 를 깨지 않는다 —
hidden 과 달리 스크롤 컨테이너를 만들지 않음).

- [ ] **Step 7: HomeQnaSection — FAQ 라벨 통일**

`apps/web/app/_components/sections/HomeQnaSection.tsx` L34:

```tsx
            자주 묻는 질문 전체 보기
```

- [ ] **Step 8: 관련 테스트 일괄 실행**

Run: `pnpm --filter @duing/web test -- --run test/notices test/faq test/components test/lib test/home test/sections`
Expected: PASS (전부). 실패 시 실패 테스트가 참조하는 라벨/스텁을 이 계획 기준으로 수정.

- [ ] **Step 9: 커밋**

```bash
git add apps/web/app/notices apps/web/app/faq apps/web/app/terms/page.tsx apps/web/app/introduce/page.tsx apps/web/app/_components/sections/HomeQnaSection.tsx apps/web/test/notices/notices-page.test.tsx apps/web/test/faq/faq-page.test.tsx
git commit -m "feat(web): 정보 허브 4페이지에 InfoTabs 적용 및 상단 GNB ExploreNav 통일"
```

---

### Task 8: 전체 검증 + 실브라우저 QA

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 정적 검증 (cwd `frontend/`)**

```bash
pnpm --filter @duing/web lint
pnpm --filter @duing/web typecheck
pnpm test
pnpm build
```

Expected: 4개 모두 성공. `pnpm build` 는 `✓ Compiled successfully` 와 4개 라우트
(/notices·/faq·/terms·/introduce) 정상 출력 확인. `| tail` 로 출력을 자르지 말 것(exit code 가림).

- [ ] **Step 2: dev 서버 기동 (:3000)**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm dev
```

백그라운드 실행 후 로그에서 `Local: http://localhost:3000` 확인 — :3001 로 밀리면
좀비 워커가 :3000 을 점유한 것이므로 부모(`next dev`)→워커(`next-server`)→포트 순으로 kill 후 재기동.

- [ ] **Step 3: 실브라우저 QA (Playwright MCP)**

jsdom 이 못 잡는 스크롤/sticky/포인터 동작 검증. 확인 항목:

데스크탑(1280×800):
1. `/` — GNB 가 "홈 | 탐색 | 시설 | 캘린더 | 정보 (| 총동연)" 인지, "서비스 소개"가 없는지
2. `/notices` — GNB 정보에 밑줄, 그 아래 InfoTabs(공지 active), 기존 필터·목록 정상
3. InfoTabs 로 `/faq` → `/terms` → `/introduce` 순회 — 각 탭 active 전환, 페이지 콘텐츠 정상
4. `/terms` — 미니 헤더가 사라지고 ExploreNav+InfoTabs 표시, 본문 max-w-3xl 유지
5. `/introduce` — 랜딩 히어로 위에 GNB+InfoTabs, 가로 스크롤바 없음(overflow-x-clip 동작)
6. `/terms` 방문 후 `/clubs` 이동 → GNB "정보" 클릭 → `/terms` 로 이동(마지막 방문 기억)
7. 공지 상세(`/notices/{id}`) — InfoTabs 없음, GNB 정보 active

모바일(390×844):
8. `/notices` — InfoTabs 가로 스크롤(4탭), 터치 영역, 스크롤 다운 시 sticky 로 상단 고정
9. `/faq`·`/terms`·`/introduce` — 하단 탭바 노출 + 정보 탭 active (기존엔 미노출이던 페이지들)
10. 하단 탭바 정보 아이콘이 Info(원+i)로 표시
11. 공지 상세 — 하단 탭바 미노출 유지

- [ ] **Step 4: dev 서버 종료**

QA 완료 후 dev 서버 프로세스를 종료한다(부모 `next dev` → 워커 `next-server` 순, :3000 해제 확인):

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null; lsof -ti:3000 || echo "port 3000 free"
```

- [ ] **Step 5: 스크린샷/발견 사항 정리**

시각 QA 에서 어긋난 부분(언더라인 클립, sticky 겹침, 크림 띠 등)이 있으면 수정 후
해당 Task 의 테스트를 다시 돌리고 `fix(web): ...` 커밋.

---

### Task 9: InfoNavLink Hover Quick Menu (스펙 결정 11 — 후속 추가)

**Files:**
- Modify: `frontend/apps/web/app/_components/InfoNavLink.tsx`
- Test: `frontend/apps/web/test/components/info-nav-link.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`test/components/info-nav-link.test.tsx` 의 import 에 `fireEvent` 를 추가하고, 파일 끝에
새 describe 를 추가한다:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
```

```tsx
describe('InfoNavLink — Hover Quick Menu', () => {
  it('기본 상태에서는 Quick Menu 가 닫혀 있다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('마우스 hover 시 허브 4개로 직행하는 Quick Menu 를 펼친다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    fireEvent.mouseOver(screen.getByRole('link', { name: '정보' }));

    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: '공지' })).toHaveAttribute('href', '/notices');
    expect(screen.getByRole('link', { name: '자주 묻는 질문' })).toHaveAttribute('href', '/faq');
    expect(screen.getByRole('link', { name: '운영정책' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: '서비스 소개' })).toHaveAttribute('href', '/introduce');
  });

  it('Quick Menu 항목은 마지막 방문 경로가 아니라 각자 URL 로 직행한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/terms');
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    fireEvent.mouseOver(screen.getByRole('link', { name: '정보' }));

    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: '공지' })).toHaveAttribute('href', '/notices');
  });

  it('마우스가 떠나면 Quick Menu 를 닫는다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    const trigger = screen.getByRole('link', { name: '정보' });
    fireEvent.mouseOver(trigger);
    expect(screen.getAllByRole('link')).toHaveLength(5);

    fireEvent.mouseOut(trigger, { relatedTarget: document.body });
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('Escape 로 Quick Menu 를 닫는다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    const trigger = screen.getByRole('link', { name: '정보' });
    fireEvent.mouseOver(trigger);
    expect(screen.getAllByRole('link')).toHaveLength(5);

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('키보드 포커스 진입으로도 열리고, 포커스가 밖으로 나가면 닫힌다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    const trigger = screen.getByRole('link', { name: '정보' });

    fireEvent.focus(trigger);
    expect(screen.getAllByRole('link')).toHaveLength(5);

    fireEvent.blur(trigger, { relatedTarget: document.body });
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
```

(React 는 mouseenter/leave 를 mouseover/mouseout + relatedTarget 으로 합성하므로
`fireEvent.mouseOver`/`mouseOut(relatedTarget)` 으로 래퍼의 onMouseEnter/Leave 가 트리거된다.
onFocus/onBlur 는 focusin/focusout 기반이라 트리거 링크 이벤트가 래퍼로 버블된다.)

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test -- --run test/components/info-nav-link.test.tsx`
Expected: 기존 3건 PASS, 신규 6건 FAIL (aria-expanded 부재, Quick Menu 링크 부재)

- [ ] **Step 3: 구현**

`frontend/apps/web/app/_components/InfoNavLink.tsx` 를 아래 전체 내용으로 교체:

```tsx
'use client';

import { useState } from 'react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { INFO_MENU_ITEMS } from '@/app/_lib/infoMenu';
import { useLastInfoPath } from '@/app/_lib/useLastInfoPath';

/**
 * HomeNav(Server Component)용 "정보" 링크 + PC Hover Quick Menu.
 * - "정보" 클릭: 마지막 방문 허브 경로(getLastInfoPath 단일 정책, 기본 /notices)로 이동.
 * - hover(또는 키보드 포커스 진입) 시 허브 4개로 직행하는 Quick Menu 를 펼친다 — HomeNav 가
 *   렌더되는 모든 화면에서 동작(스펙 결정 11, 컴포넌트 단위 적용). 터치 기기는 hover 이벤트가
 *   없어 메뉴 없이 클릭 이동만 동작한다(모바일·태블릿 제외는 자연 충족).
 * - ExploreNav/정보 섹션 내부에는 이 메뉴를 두지 않는다 — 섹션 내비게이션은 InfoTabs 담당.
 */
export function InfoNavLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const lastInfoPath = useLastInfoPath(pathname);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setQuickMenuOpen(true)}
      onMouseLeave={() => setQuickMenuOpen(false)}
      onFocus={() => setQuickMenuOpen(true)}
      onBlur={(blurEvent) => {
        // 포커스가 래퍼 밖으로 나갈 때만 닫는다 — 패널 내부 링크로의 탭 이동은 유지.
        const nextFocused = blurEvent.relatedTarget;
        if (!(nextFocused instanceof Node) || !blurEvent.currentTarget.contains(nextFocused)) {
          setQuickMenuOpen(false);
        }
      }}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === 'Escape') setQuickMenuOpen(false);
      }}
    >
      <Link href={lastInfoPath} className={className} aria-expanded={quickMenuOpen}>
        정보
      </Link>
      {quickMenuOpen && (
        {/* pt-2 가 트리거와 패널 사이 hover 브리지 역할 — 마진이면 데드존이 생겨 메뉴가 깜빡인다 */}
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2">
          <ul className="w-[160px] rounded-md border border-line bg-paper py-1 shadow-2">
            {INFO_MENU_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block px-4 py-2.5 text-[13px] font-medium text-charcoal-2 hover:bg-cream hover:text-ink"
                  onClick={() => setQuickMenuOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

주의: JSX 조건부 블록 안에 주석을 두는 위 표기는 유사코드다 — 실제 구현에서는 주석을
조건부 렌더 바깥 줄 또는 `<div>` 위 일반 위치에 배치해 문법 오류가 없게 하라.
`rounded-md`(14px)·`shadow-2`·`bg-paper`·`border-line`·`bg-cream` 토큰이 tailwind.config.ts
에 존재하는지 확인하고, 없으면 UserMenu 드롭다운이 실제로 쓰는 클래스로 대체하라.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/components/info-nav-link.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 5: typecheck + 전체 스위트**

Run: `pnpm --filter @duing/web typecheck` 및 `pnpm --filter @duing/web test -- --run`
Expected: 에러 없음 / 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add apps/web/app/_components/InfoNavLink.tsx apps/web/test/components/info-nav-link.test.tsx
git commit -m "feat(web): HomeNav 정보 메뉴에 PC Hover Quick Menu 추가"
```

---

## 계획 밖 주의사항 (실행자용)

- **push·PR 생성 금지** — 로컬 커밋까지만. PR 은 사용자 지시 후 별도 진행.
- ExploreNav 의 `active` prop 은 기능을 유지하되 사용처는 모두 제거된 상태가 정상이다.
- `duing:info-last-path` 키/컴포넌트 구조를 바꾸면 스펙 문서와 어긋난다 — 변경 필요 시 중단하고 보고.
- NoticePage 는 인라인 style 페이지다 — InfoTabs 삽입 위치(ExploreNav 바로 아래, 그리드 컨테이너 밖)만 건드리고 내부 인라인 스타일은 손대지 않는다.
- 데드코드(NavDropdown.tsx, NoticeFilterBar.tsx)는 참조·수정·삭제 모두 하지 않는다(Out of Scope).

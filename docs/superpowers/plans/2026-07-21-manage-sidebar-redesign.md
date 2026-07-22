# 운영진 콘솔 사이드바 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/manage` 운영진 콘솔 사이드바를 다크 그린 그라데이션 + 플로팅 카드형 디자인으로 교체한다 (스펙: `docs/superpowers/specs/2026-07-21-manage-sidebar-redesign-design.md`).

**Architecture:** 기존 3개 컴포넌트 제자리 리스타일 — `ManageNav`(데이터 배열 + lucide 아이콘 + collapsed), `ClubSelector`→`ClubSwitcher` rename(DropdownMenu 기반), `ManageShell`(플로팅 카드·접기·푸터). admin 콘솔의 접기/localStorage 패턴 재사용.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind, lucide-react, shadcn/ui DropdownMenu·Sheet, vitest + testing-library.

## Global Constraints

- 커밋 메시지: Conventional Commits 한국어 (`feat(frontend): ...`), Co-Authored-By/🤖 라인 금지
- **push·PR 생성 금지** — 로컬 커밋까지만
- `type` 사용(`interface` 금지), `any`·`as` 단언 금지
- 테스트에서 TanStack Query 내부(useQuery 자체) 모킹 금지 — 커스텀 훅(`@duing/hooks`) 모킹은 기존 전례(ManagePage.test.tsx) 따름
- 모든 명령은 `frontend/` cwd 에서 실행, `| tail`/`| head` 로 exit code 가리지 않기
- 사이드바 신규 API 호출 추가 금지 — `useManagedClubsQuery`·`useMeQuery`·`useLogout`만 사용
- 접근성: 아이콘 전용 버튼·링크에 aria-label, `title`은 접힘 보조 수단
- lucide 아이콘은 동일 의미 범위 내 교체 허용

---

### Task 1: ManageNav 리디자인 (데이터 배열 + lucide + collapsed)

**Files:**
- Modify: `frontend/apps/web/app/manage/_components/ManageNav.tsx` (전체 교체)
- Test: `frontend/apps/web/test/manage/manage-nav.test.tsx` (기존 케이스 무수정 통과 + 접힘 케이스 추가)

**Interfaces:**
- Consumes: `toRoute`(`../../_lib/route`), `cn`(`../../_lib/cn`), `usePathname`
- Produces: `ManageNav({ currentClubId: number; collapsed?: boolean })` — Task 3 의 ManageShell 이 `collapsed` prop 을 전달한다. 루트 요소는 `<nav aria-label="운영 메뉴">` 이며 자체적으로 `flex-1 overflow-y-auto` 스크롤을 담당한다.

- [ ] **Step 1: 접힘 상태 실패 테스트 추가**

`frontend/apps/web/test/manage/manage-nav.test.tsx` 파일 끝에 추가:

```tsx
describe('ManageNav — 접힘 상태', () => {
  it('접힘 시 링크의 접근 가능한 이름은 유지되고 title 툴팁이 제공되며, 비활성 안내문은 숨겨진다', () => {
    mockUsePathname.mockReturnValue(`/manage/clubs/${CLUB_ID}`);
    render(<ManageNav currentClubId={CLUB_ID} collapsed />);

    const dashboardLink = screen.getByRole('link', { name: '대시보드' });
    expect(dashboardLink).toHaveAttribute('title', '대시보드');
    expect(screen.queryByText('모집을 먼저 선택하세요')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/manage/manage-nav.test.tsx`
Expected: 신규 케이스 FAIL (`collapsed` prop 없음 — title 미존재), 기존 케이스는 PASS

- [ ] **Step 3: ManageNav.tsx 전체 교체**

```tsx
'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  Image as ImageIcon,
  Info,
  LayoutDashboard,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../_lib/cn';
import { toRoute } from '../../_lib/route';

type ManageNavProps = {
  currentClubId: number;
  /** 데스크탑 사이드바 접힘 상태 — 아이콘만 표시하고 라벨은 sr-only + title 로 옮긴다. */
  collapsed?: boolean;
};

type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** null 이면 비활성 안내 항목 (지원자/통계 — 모집 미선택). typedRoutes 이므로 Route 타입. */
  href: Route | null;
  active: boolean;
};

type NavGroup = {
  /** null 이면 라벨 없는 최상단 그룹 (대시보드) */
  label: string | null;
  items: NavItem[];
};

const DISABLED_HINT = '모집을 먼저 선택하세요';

export function ManageNav({ currentClubId, collapsed = false }: ManageNavProps) {
  const pathname = usePathname();

  const dashboardPath = toRoute(`/manage/clubs/${currentClubId}`);
  const recruitmentsPath = toRoute(`/manage/clubs/${currentClubId}/recruitments`);
  const photosPath = toRoute(`/manage/clubs/${currentClubId}/photos`);
  const membersPath = toRoute(`/manage/clubs/${currentClubId}/members`);
  const feesPath = toRoute(`/manage/clubs/${currentClubId}/fees`);
  const infoPath = toRoute(`/manage/clubs/${currentClubId}/info`);
  const facilityBookingsPath = toRoute(`/manage/clubs/${currentClubId}/facility-bookings`);

  // 모집 하위 페이지(상세/지원자/통계/면접 등)를 보는 중이면 해당 모집 컨텍스트로
  // 지원자·통계 진입을 활성화한다. 모집을 선택하지 않은 목록·신규 작성 화면에서는 비활성 안내를 유지한다.
  const recruitmentSubPath = pathname.startsWith(`${recruitmentsPath}/`)
    ? pathname.slice(recruitmentsPath.length + 1).split('/')[0]
    : undefined;
  const activeRecruitmentId =
    recruitmentSubPath && /^\d+$/.test(recruitmentSubPath) ? recruitmentSubPath : undefined;

  const applicantsPath = activeRecruitmentId
    ? toRoute(`/manage/clubs/${currentClubId}/recruitments/${activeRecruitmentId}/applicants`)
    : null;
  const statsPath = activeRecruitmentId
    ? toRoute(`/manage/clubs/${currentClubId}/recruitments/${activeRecruitmentId}/stats`)
    : null;

  const isApplicantsActive = applicantsPath !== null && pathname.startsWith(applicantsPath);
  const isStatsActive = statsPath !== null && pathname.startsWith(statsPath);
  // 지원자/통계 하위 페이지에서는 그 항목이 활성이므로 "모집 관리" 중복 강조를 끈다.
  const isRecruitmentsActive =
    pathname.startsWith(recruitmentsPath) && !isApplicantsActive && !isStatsActive;

  const groups: NavGroup[] = [
    {
      label: null,
      items: [
        {
          key: 'dashboard',
          label: '대시보드',
          icon: LayoutDashboard,
          href: dashboardPath,
          active: pathname === dashboardPath,
        },
      ],
    },
    {
      label: '모집',
      items: [
        {
          key: 'recruitments',
          label: '모집 관리',
          icon: ClipboardList,
          href: recruitmentsPath,
          active: isRecruitmentsActive,
        },
        { key: 'applicants', label: '지원자', icon: Users, href: applicantsPath, active: isApplicantsActive },
        { key: 'stats', label: '통계', icon: BarChart3, href: statsPath, active: isStatsActive },
      ],
    },
    {
      label: '운영',
      items: [
        {
          key: 'members',
          label: '멤버 관리',
          icon: UsersRound,
          href: membersPath,
          active: pathname.startsWith(membersPath),
        },
        { key: 'fees', label: '회비 관리', icon: Wallet, href: feesPath, active: pathname.startsWith(feesPath) },
        {
          key: 'facility-bookings',
          label: '시설 예약',
          icon: CalendarCheck,
          href: facilityBookingsPath,
          active: pathname.startsWith(facilityBookingsPath),
        },
        { key: 'photos', label: '활동사진', icon: ImageIcon, href: photosPath, active: pathname.startsWith(photosPath) },
      ],
    },
    {
      label: '설정',
      items: [
        { key: 'info', label: '동아리 정보', icon: Info, href: infoPath, active: pathname.startsWith(infoPath) },
      ],
    },
  ];

  return (
    <nav
      aria-label="운영 메뉴"
      className={cn('min-h-0 flex-1 overflow-y-auto pb-2', collapsed ? 'px-3.5' : 'px-4')}
    >
      {groups.map((group, groupIndex) => (
        <div key={group.label ?? 'top'} className="mb-1.5">
          {group.label &&
            (collapsed ? (
              groupIndex > 0 && <div aria-hidden className="mx-2 my-2 h-px bg-white/10" />
            ) : (
              <p className="px-3 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/35">
                {group.label}
              </p>
            ))}
          {group.items.map((item) => (
            <ManageNavItem key={item.key} item={item} collapsed={collapsed} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function ManageNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;

  if (item.href === null) {
    // 지원자/통계 — 모집 컨텍스트가 없을 때의 비활성 안내
    if (collapsed) {
      return (
        <span
          title={`${item.label} — ${DISABLED_HINT}`}
          className="my-0.5 flex cursor-not-allowed select-none justify-center rounded-md py-2.5 text-white/25"
        >
          <Icon size={19} aria-hidden className="shrink-0" />
          <span className="sr-only">{`${item.label} — ${DISABLED_HINT}`}</span>
        </span>
      );
    }
    return (
      <span className="my-0.5 block cursor-not-allowed select-none rounded-md px-3 py-2.5 text-[13.5px] text-white/35">
        <span className="flex items-center gap-3">
          <Icon size={19} aria-hidden className="shrink-0 text-white/25" />
          {item.label}
        </span>
        <span className="mt-0.5 block pl-8 text-[11px] leading-tight text-white/30">{DISABLED_HINT}</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={item.active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'relative my-0.5 flex items-center gap-3 rounded-md py-2.5 text-[13.5px] font-semibold outline-none',
        'focus-visible:ring-2 focus-visible:ring-sage motion-safe:transition-colors motion-safe:duration-200',
        collapsed ? 'justify-center px-0' : 'px-3',
        item.active ? 'bg-white/10 font-bold text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
      )}
    >
      {item.active && (
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 h-[26px] w-[5px] -translate-y-1/2 rounded-full bg-sage',
            collapsed ? '-left-3.5' : '-left-4',
          )}
        />
      )}
      <Icon size={19} aria-hidden className={cn('shrink-0', item.active && 'text-sage')} />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      )}
    </Link>
  );
}
```

참고: `toRoute`(`app/_lib/route.ts`)는 Next typedRoutes 의 `Route` 를 반환하므로 `NavItem.href` 는 `Route | null` 이다(위 코드에 반영됨). 런타임에서는 문자열이라 테스트의 `toHaveBeenCalledWith('/manage/clubs/2')` 단언은 그대로 유효하다.

- [ ] **Step 4: 테스트 통과 확인 (기존 + 신규 전부)**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/manage/manage-nav.test.tsx`
Expected: 전부 PASS (기존 케이스 무수정)

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/manage/_components/ManageNav.tsx frontend/apps/web/test/manage/manage-nav.test.tsx
git commit -m "feat(frontend): 운영진 사이드바 내비를 데이터 기반·lucide 아이콘·접힘 지원으로 리디자인"
```

---

### Task 2: ClubSelector → ClubSwitcher (DropdownMenu 기반)

**Files:**
- Rename+rewrite: `frontend/apps/web/app/manage/_components/ClubSelector.tsx` → `ClubSwitcher.tsx` (`git mv` 후 전체 재작성)
- Modify: `frontend/apps/web/app/manage/_components/ManageShell.tsx` (import 교체 + onNavigate 연결 — 최소 변경, 전체 리디자인은 Task 3)
- Test: `frontend/apps/web/test/manage/club-switcher.test.tsx` (신규)

**Interfaces:**
- Consumes: `ClubLogo`(`@/app/_components/ClubLogo` — logoUrl 렌더+onError 폴백, 컨테이너가 relative/사이즈/모양/배경 책임), `useGuardedRouter`, shadcn `dropdown-menu`, `ManagedClub`(`clubId·clubName·logoUrl·myRole·activeRecruitmentCount`)
- Produces: `ClubSwitcher({ managedClubs: ManagedClub[]; currentClubId: number | null; onNavigate?: () => void })` — Task 3 의 ManageShell 이 사용. 트리거 aria-label 은 `` `동아리 전환 — 현재 ${clubName}` ``.

- [ ] **Step 1: 실패 테스트 작성** — `frontend/apps/web/test/manage/club-switcher.test.tsx` 신규:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedClub } from '@duing/types';

const pushSpy = vi.fn();
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: pushSpy, replace: vi.fn() }),
}));

import { ClubSwitcher } from '@/app/manage/_components/ClubSwitcher';

const CLUBS: ManagedClub[] = [
  { clubId: 1, clubName: 'AI 동아리', logoUrl: null, myRole: 'LEADER', centralClub: true, activeRecruitmentCount: 2 },
  { clubId: 2, clubName: '컴공 동아리', logoUrl: null, myRole: 'OFFICER', centralClub: true, activeRecruitmentCount: 0 },
];

describe('ClubSwitcher', () => {
  beforeEach(() => {
    pushSpy.mockReset();
  });

  it('트리거에 현재 클럽명·역할 배지·모집 상태 칩이 표시된다', () => {
    render(<ClubSwitcher managedClubs={CLUBS} currentClubId={1} />);

    const trigger = screen.getByRole('button', { name: /동아리 전환/ });
    expect(trigger).toHaveTextContent('AI 동아리');
    expect(trigger).toHaveTextContent('회장');
    expect(trigger).toHaveTextContent('모집중');
  });

  it('모집이 없는 클럽은 모집종료 칩이 항상 표시된다', () => {
    render(<ClubSwitcher managedClubs={CLUBS} currentClubId={2} />);

    const trigger = screen.getByRole('button', { name: /동아리 전환/ });
    expect(trigger).toHaveTextContent('운영진');
    expect(trigger).toHaveTextContent('모집종료');
  });

  it('드롭다운에 내 동아리 목록이 역할·모집 상태와 함께 뜨고, 현재 클럽에 체크가 표시된다', async () => {
    const user = userEvent.setup();
    render(<ClubSwitcher managedClubs={CLUBS} currentClubId={1} />);

    await user.click(screen.getByRole('button', { name: /동아리 전환/ }));
    const menuItems = await screen.findAllByRole('menuitem');

    expect(menuItems).toHaveLength(2);
    expect(menuItems[0]).toHaveTextContent('AI 동아리');
    expect(menuItems[0]).toHaveTextContent('회장 · 모집중');
    expect(menuItems[1]).toHaveTextContent('컴공 동아리');
    expect(menuItems[1]).toHaveTextContent('운영진 · 모집종료');
    expect(within(menuItems[0]!).getByText('현재 선택됨')).toBeInTheDocument();
    expect(within(menuItems[1]!).queryByText('현재 선택됨')).not.toBeInTheDocument();
  });

  it('다른 클럽 선택 시 해당 클럽 관리로 이동하고 onNavigate 를 호출한다', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ClubSwitcher managedClubs={CLUBS} currentClubId={1} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /동아리 전환/ }));
    await user.click(await screen.findByRole('menuitem', { name: /컴공 동아리/ }));

    expect(pushSpy).toHaveBeenCalledWith('/manage/clubs/2');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('현재 클럽을 다시 선택하면 라우팅 없이 onNavigate 만 호출한다', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ClubSwitcher managedClubs={CLUBS} currentClubId={1} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /동아리 전환/ }));
    await user.click(await screen.findByRole('menuitem', { name: /AI 동아리/ }));

    expect(pushSpy).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/manage/club-switcher.test.tsx`
Expected: FAIL — `ClubSwitcher` 모듈 없음

- [ ] **Step 3: rename + 전체 재작성**

```bash
cd frontend && git mv apps/web/app/manage/_components/ClubSelector.tsx apps/web/app/manage/_components/ClubSwitcher.tsx
```

`ClubSwitcher.tsx` 전체 내용:

```tsx
'use client';

import { Check, ChevronDown } from 'lucide-react';
import type { ManagedClub } from '@duing/types';
import { ClubLogo } from '@/app/_components/ClubLogo';
import { cn } from '@/app/_lib/cn';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toRoute } from '../../_lib/route';

type ClubSwitcherProps = {
  managedClubs: ManagedClub[];
  currentClubId: number | null;
  /** 클럽 선택 직후 호출 — 모바일 드로어 닫기용. 드롭다운은 포털로 렌더되어 Sheet 의 anchor 클릭 감지가 닿지 않는다. */
  onNavigate?: () => void;
};

function roleLabel(myRole: ManagedClub['myRole']) {
  return myRole === 'LEADER' ? '회장' : '운영진';
}

function recruitLabel(activeRecruitmentCount: number) {
  return activeRecruitmentCount > 0 ? '모집중' : '모집종료';
}

/** 클럽 로고(실패 시 첫 글자 폴백). ClubLogo 규약대로 컨테이너가 relative·사이즈·모양·배경을 책임진다. */
function ClubAvatar({
  club,
  className,
  textClassName,
}: {
  club: ManagedClub;
  className: string;
  textClassName: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-ink to-ink-soft font-extrabold text-white',
        className,
      )}
    >
      <ClubLogo logoUrl={club.logoUrl}>
        <span className={textClassName}>{club.clubName.charAt(0)}</span>
      </ClubLogo>
    </span>
  );
}

export function ClubSwitcher({ managedClubs, currentClubId, onNavigate }: ClubSwitcherProps) {
  const router = useGuardedRouter();
  const currentClub = managedClubs.find((club) => club.clubId === currentClubId) ?? managedClubs[0];
  if (!currentClub) {
    return null;
  }

  const recruiting = currentClub.activeRecruitmentCount > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`동아리 전환 — 현재 ${currentClub.clubName}`}
          className={cn(
            'group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none',
            'hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-sage data-[state=open]:bg-white/10',
            'motion-safe:transition-colors motion-safe:duration-200',
          )}
        >
          <ClubAvatar club={currentClub} className="h-10 w-10 rounded-[13px]" textClassName="text-[17px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold text-white">{currentClub.clubName}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <span className="shrink-0 rounded-full bg-sage px-1.5 py-px text-[9.5px] font-extrabold text-ink-deep">
                {roleLabel(currentClub.myRole)}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-bold',
                  recruiting ? 'bg-sage/20 text-sage-soft' : 'bg-white/10 text-white/50',
                )}
              >
                {recruitLabel(currentClub.activeRecruitmentCount)}
              </span>
            </span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden
            className="shrink-0 text-white/55 motion-safe:transition-transform motion-safe:duration-200 group-data-[state=open]:rotate-180"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-[248px] border-white/10 bg-[#2A382F] p-1.5 text-white shadow-4"
      >
        <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">
          내 동아리 {managedClubs.length}
        </DropdownMenuLabel>
        {managedClubs.map((club) => {
          const isCurrent = club.clubId === currentClub.clubId;
          return (
            <DropdownMenuItem
              key={club.clubId}
              onSelect={() => {
                if (!isCurrent) {
                  router.push(toRoute(`/manage/clubs/${club.clubId}`));
                }
                onNavigate?.();
              }}
              className="cursor-pointer gap-2.5 rounded-sm px-2.5 py-2 focus:bg-white/10 focus:text-white"
            >
              <ClubAvatar club={club} className="h-[30px] w-[30px] rounded-[9px]" textClassName="text-[13px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-white">{club.clubName}</span>
                <span className="block text-[11px] text-white/50">
                  {roleLabel(club.myRole)} ·{' '}
                  <span className={club.activeRecruitmentCount > 0 ? 'text-sage-soft' : 'text-white/50'}>
                    {recruitLabel(club.activeRecruitmentCount)}
                  </span>
                </span>
              </span>
              {isCurrent && (
                <>
                  <Check size={15} aria-hidden className="shrink-0 text-sage" />
                  <span className="sr-only">현재 선택됨</span>
                </>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: ManageShell 최소 연결 변경** (전체 리디자인은 Task 3 — 여기서는 빌드가 깨지지 않게만)

`ManageShell.tsx` 에서:

1. import 교체: `import { ClubSelector } from './ClubSelector';` → `import { ClubSwitcher } from './ClubSwitcher';`
2. `ManageSidebarContent` 시그니처에 `onNavigate` 추가:

```tsx
function ManageSidebarContent({
  managedClubs,
  currentClubId,
  onNavigate,
}: {
  managedClubs: ManagedClub[] | undefined;
  currentClubId: number | null;
  onNavigate?: () => void;
}) {
```

3. 본문에서 `<ClubSelector ... />` 를 다음으로 교체:

```tsx
      {managedClubs && managedClubs.length > 0 && (
        <>
          <div className="px-2">
            <ClubSwitcher
              managedClubs={managedClubs}
              currentClubId={currentClubId}
              onNavigate={onNavigate}
            />
          </div>
          {currentClubId !== null && <ManageNav currentClubId={currentClubId} />}
        </>
      )}
```

4. 모바일 Sheet 쪽 `<ManageSidebarContent ...>` 호출에 `onNavigate={() => setDrawerOpen(false)}` 전달, 감싸는 div 의 `onChange={() => setDrawerOpen(false)}` 핸들러 제거(select 가 사라졌으므로), 데스크탑 aside 쪽은 onNavigate 미전달.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/manage/club-switcher.test.tsx test/manage/manage-nav.test.tsx`
Expected: 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add -A frontend/apps/web/app/manage/_components frontend/apps/web/test/manage/club-switcher.test.tsx
git commit -m "feat(frontend): ClubSelector 를 드롭다운 기반 ClubSwitcher 로 교체 — 역할·모집 상태·현재 클럽 체크 표시"
```

---

### Task 3: ManageShell 리디자인 (플로팅 카드·접기·푸터)

**Files:**
- Modify: `frontend/apps/web/app/manage/_components/ManageShell.tsx` (전체 교체)
- Test: `frontend/apps/web/test/manage/manage-shell.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 1 `ManageNav({ currentClubId, collapsed })`, Task 2 `ClubSwitcher({ managedClubs, currentClubId, onNavigate })`, `BrandMark({ size, light })`, `useManagedClubsQuery`·`useMeQuery`·`useLogout`(`@duing/hooks`), `useToast`, `useGuardedRouter`, `ManageGuard`, shadcn `Sheet`
- Produces: `ManageShell({ currentClubId: number | null; children: ReactNode })` — 시그니처 불변(호출부 수정 없음). localStorage 키 `duing:manage:sidebar-collapsed`.

- [ ] **Step 1: 실패 테스트 작성** — `frontend/apps/web/test/manage/manage-shell.test.tsx` 신규:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedClub, User } from '@duing/types';

const pushSpy = vi.fn();
const replaceSpy = vi.fn();
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: pushSpy, replace: replaceSpy }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/manage/clubs/1',
}));

vi.mock('@/components/duing/BrandMark', () => ({
  BrandMark: () => <span>Duing</span>,
}));

const addToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast }),
}));

const CLUBS: ManagedClub[] = [
  { clubId: 1, clubName: 'AI 동아리', logoUrl: null, myRole: 'LEADER', centralClub: true, activeRecruitmentCount: 2 },
];

const ME: User = {
  id: 7,
  studentId: '20240001',
  name: '김도윤',
  phone: '01000000000',
  grade: 'JUNIOR',
  role: 'STUDENT',
};

const logoutSpy = vi.fn(async () => {});
vi.mock('@duing/hooks', () => ({
  useManagedClubsQuery: () => ({ data: CLUBS, isLoading: false }),
  useMeQuery: () => ({ data: ME }),
  useLogout: () => logoutSpy,
}));

import { ManageShell } from '@/app/manage/_components/ManageShell';

describe('ManageShell — 접기·푸터', () => {
  beforeEach(() => {
    window.localStorage.clear();
    pushSpy.mockReset();
    replaceSpy.mockReset();
    logoutSpy.mockClear();
  });

  it('접기 토글 시 localStorage 에 저장되고, 재마운트(새로고침) 후에도 접힘이 유지된다', async () => {
    const user = userEvent.setup();
    render(<ManageShell currentClubId={1}>본문</ManageShell>);

    await user.click(screen.getByRole('button', { name: '사이드바 접기' }));
    expect(window.localStorage.getItem('duing:manage:sidebar-collapsed')).toBe('1');

    cleanup();
    render(<ManageShell currentClubId={1}>본문</ManageShell>);
    expect(await screen.findByRole('button', { name: '사이드바 펼치기' })).toBeInTheDocument();
  });

  it('접힘 상태에서 내비 링크의 title 툴팁·접근 가능한 이름이 유지되고, 클럽 전환 헤더는 숨는다', async () => {
    window.localStorage.setItem('duing:manage:sidebar-collapsed', '1');
    render(<ManageShell currentClubId={1}>본문</ManageShell>);

    const dashboardLink = await screen.findByRole('link', { name: '대시보드' });
    expect(dashboardLink).toHaveAttribute('title', '대시보드');
    expect(screen.queryByRole('button', { name: /동아리 전환/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('펼침 상태에서 클럽 전환 트리거·내 이름·로그아웃이 표시된다', () => {
    render(<ManageShell currentClubId={1}>본문</ManageShell>);

    expect(screen.getByRole('button', { name: /동아리 전환/ })).toBeInTheDocument();
    expect(screen.getByText('김도윤')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('로그아웃 클릭 시 logout 후 홈으로 replace 한다', async () => {
    const user = userEvent.setup();
    render(<ManageShell currentClubId={1}>본문</ManageShell>);

    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith('/');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/manage/manage-shell.test.tsx`
Expected: FAIL — '사이드바 접기' 버튼 없음 (현 셸에는 접기 없음)

- [ ] **Step 3: ManageShell.tsx 전체 교체**

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ManagedClub } from '@duing/types';
import { useLogout, useManagedClubsQuery, useMeQuery } from '@duing/hooks';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { cn } from '@/app/_lib/cn';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { BrandMark } from '@/components/duing/BrandMark';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ClubSwitcher } from './ClubSwitcher';
import { ManageGuard } from './ManageGuard';
import { ManageNav } from './ManageNav';

type ManageShellProps = {
  currentClubId: number | null;
  children: ReactNode;
};

/** 사이드바 폭 — 디자인 변경 시 여기 한 곳만 수정한다. */
const SIDEBAR_WIDTH = { expanded: 280, collapsed: 84 } as const;
const COLLAPSED_STORAGE_KEY = 'duing:manage:sidebar-collapsed';
/** 다크 그린 그라데이션 표면 — 데스크탑 aside 와 모바일 Sheet 드로어가 공유한다. */
const SIDEBAR_SURFACE_CLASS = 'bg-[linear-gradient(180deg,#34463E_0%,#2A382F_100%)]';

// 사이드바 내용(로고·클럽 전환·내비·푸터) — 데스크탑 aside 와 모바일 Sheet 드로어가 공유한다.
// 접기 토글은 데스크탑 전용(onToggleCollapse 미전달 시 숨김), 드로어는 항상 펼침 구성.
function ManageSidebarContent({
  managedClubs,
  currentClubId,
  collapsed,
  onToggleCollapse,
  onNavigate,
}: {
  managedClubs: ManagedClub[] | undefined;
  currentClubId: number | null;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* 상단 행 — 로고(홈 링크)와 접기 토글. 아래 클럽 전환 블록과 클릭 영역을 분리한다. */}
      <div
        className={cn(
          'flex shrink-0 items-center pb-1.5 pt-4',
          collapsed ? 'flex-col gap-2.5 px-0' : 'justify-between px-4',
        )}
      >
        <Link
          href="/"
          aria-label="두잉 홈으로"
          title="두잉 홈으로"
          className="rounded-sm px-1 outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          <BrandMark size={collapsed ? 19 : 21} light />
        </Link>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
            aria-pressed={collapsed}
            title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-white/15 bg-white/5 text-white/80',
              'outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-sage',
              'motion-safe:transition-colors',
            )}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        )}
      </div>

      {/* 클럽 전환 헤더 — 접힘 시 숨김(목업 기준) */}
      {!collapsed && managedClubs && managedClubs.length > 0 && (
        <div className="shrink-0 px-4 pb-2 pt-1.5">
          <ClubSwitcher managedClubs={managedClubs} currentClubId={currentClubId} onNavigate={onNavigate} />
        </div>
      )}

      {currentClubId !== null ? (
        <ManageNav currentClubId={currentClubId} collapsed={collapsed} />
      ) : (
        <div aria-hidden className="flex-1" />
      )}

      <ManageSidebarFooter collapsed={collapsed} />
    </>
  );
}

/** 푸터 — 내 이름 + 로그아웃. 역할은 헤더 배지가 담당하므로 여기서는 표시하지 않는다. */
function ManageSidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { data: me } = useMeQuery();
  const logout = useLogout();
  const router = useGuardedRouter();
  const { addToast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.replace('/');
    } catch {
      addToast('로그아웃하지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.', {
        variant: 'error',
      });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div
      className={cn(
        'mt-1 flex shrink-0 items-center gap-2.5 border-t border-white/10 py-3',
        collapsed ? 'justify-center px-3' : 'px-4',
      )}
    >
      {!collapsed &&
        (me ? (
          <>
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-[13px] font-extrabold text-white"
            >
              {me.name.charAt(0)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-white">{me.name}</span>
          </>
        ) : (
          // me 로딩/실패 — 이름 없이 로그아웃만 남긴다 (fail-soft)
          <span aria-hidden className="flex-1" />
        ))}
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        aria-label="로그아웃"
        title="로그아웃"
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white/55 outline-none',
          'hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-sage',
          'disabled:opacity-60 motion-safe:transition-colors',
        )}
      >
        <LogOut size={17} />
      </button>
    </div>
  );
}

export function ManageShell({ currentClubId, children }: ManageShellProps) {
  const { data: managedClubs, isLoading } = useManagedClubsQuery();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 서버 렌더와 첫 페인트는 항상 펼친 상태로 맞추고 저장값은 마운트 후 반영한다
  // (localStorage 를 초기값으로 읽으면 하이드레이션 불일치가 난다).
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1');
    } catch {
      // 저장소를 못 쓰는 환경 — 접힘 기억만 포기하고 기본(펼침)으로 둔다.
    }
  }, []);

  const applyCollapsed = (next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // 저장 실패가 이번 세션의 접힘 동작을 막지는 않는다.
    }
  };

  const currentClubName = managedClubs?.find((club) => club.clubId === currentClubId)?.clubName;

  return (
    <ManageGuard managedClubs={managedClubs} isLoading={isLoading}>
      <div className="duing flex min-h-dvh bg-cream">
        {/* 데스크탑 플로팅 카드 사이드바 (모바일은 드로어로 대체) */}
        <aside
          aria-label="운영진 콘솔 사이드바"
          style={{ width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded }}
          className={cn(
            'sticky top-0 hidden max-h-dvh shrink-0 flex-col self-start overflow-hidden md:flex',
            'm-3 rounded-xl shadow-4',
            SIDEBAR_SURFACE_CLASS,
            'motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out',
          )}
        >
          <ManageSidebarContent
            managedClubs={managedClubs}
            currentClubId={currentClubId}
            collapsed={collapsed}
            onToggleCollapse={() => applyCollapsed(!collapsed)}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-cream">
          {/* 모바일 상단바 — 햄버거로 드로어 열기 */}
          <div className="sticky top-0 z-30 flex items-center gap-3 bg-[#34463E] px-4 py-2.5 md:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="메뉴 열기"
              className="-ml-1 rounded-md p-1 text-cream"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <div className="min-w-0 leading-tight">
              <div className="text-[10.5px] text-cream/50">운영진 콘솔</div>
              <div className="truncate text-[14px] font-semibold text-cream">{currentClubName ?? 'Du·ing'}</div>
            </div>
          </div>

          {children}
        </main>
      </div>

      {/* 모바일 메뉴 드로어 — 데스크탑 펼침 상태와 동일한 정보 구조. 내비 링크 클릭(앵커)은 아래 div 로 감지해
          닫고, 클럽 전환은 포털 드롭다운이라 anchor 감지가 안 닿아 onNavigate 콜백으로 닫는다. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          hideClose
          aria-describedby={undefined}
          className={cn('flex w-[82%] max-w-[300px] flex-col gap-0 border-white/10 p-0', SIDEBAR_SURFACE_CLASS)}
        >
          <SheetTitle className="sr-only">운영진 콘솔 메뉴</SheetTitle>
          <div
            className="contents"
            onClick={(event) => {
              if (event.target instanceof HTMLElement && event.target.closest('a')) {
                setDrawerOpen(false);
              }
            }}
          >
            <ManageSidebarContent
              managedClubs={managedClubs}
              currentClubId={currentClubId}
              collapsed={false}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </ManageGuard>
  );
}
```

주의: 기존 파일의 `v1.0.0 / 회장 모드` 푸터는 삭제된 것이 맞다(스펙의 새 푸터로 대체).

- [ ] **Step 4: 테스트 통과 확인 (manage 전체)**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/manage`
Expected: 전부 PASS (manage-shell 신규 4케이스 포함, 기존 manage 하위 테스트 회귀 없음)

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/manage/_components/ManageShell.tsx frontend/apps/web/test/manage/manage-shell.test.tsx
git commit -m "feat(frontend): 운영진 사이드바를 다크 그라데이션 플로팅 카드로 리디자인 — 접기·클럽 브랜딩·푸터"
```

---

### Task 4: 전체 검증 + 시각 QA

**Files:** 수정 없음(발견된 문제만 고침)

- [ ] **Step 1: 전체 테스트·정적 검사**

Run (각각 `frontend/` cwd, exit code 확인):

```bash
cd frontend && pnpm --filter @duing/web exec vitest run
cd frontend && pnpm --filter @duing/web lint
cd frontend && pnpm --filter @duing/web typecheck
cd frontend && pnpm --filter @duing/web build
```

Expected: 전부 성공. build 출력에서 실패 여부를 직접 확인(`| tail` 금지).

- [ ] **Step 2: 시각 QA (스펙 엣지 케이스 체크리스트)**

dev 서버를 `:3000` 에서 기동(로그는 파일 리다이렉트 — 파이프 금지, stale next-server 좀비 주의: 부모→워커→포트 순 kill 후 `Local:` 포트 검증). Playwright 브라우저로 `/manage/clubs/{clubId}` 접속(로그인 필요 — 로컬 백엔드가 죽어 있으면 이 항목은 Vercel Preview 에서 검증하고 그 사실을 보고에 남긴다):

- 펼침/접힘 전환(폭 애니메이션, 아이콘 정렬, 툴팁)
- 클럽 전환 드롭다운(체크 표시, 역할·모집 상태 서브라인)
- 매우 긴 클럽명·사용자 이름 truncate (개발자도구로 텍스트 치환해 확인)
- logoUrl 없음(첫 글자 폴백) / 있음(로고 렌더)
- 운영 동아리 1개·여러 개
- 모집중·모집종료 칩
- 모바일 뷰포트(375px) — 상단바 톤, Sheet 드로어, 드롭다운 선택 시 드로어 닫힘
- 새로고침 후 접힘 유지
- 콘솔에 신규 접근성 경고 0건

- [ ] **Step 3: dev 서버 종료** (부모 프로세스와 워커 모두 종료 확인)

- [ ] **Step 4: 발견된 문제 수정 후 커밋** (있을 경우 — `fix(frontend): ...`)

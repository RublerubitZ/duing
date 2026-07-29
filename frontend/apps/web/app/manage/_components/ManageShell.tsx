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
        'mt-1 flex shrink-0 items-center gap-2.5 py-3',
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
            'sticky top-0 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col self-start overflow-hidden md:flex',
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

        {/* overflow-y-auto 금지 — min-h-dvh 윈도우 스크롤 레이아웃에서 스크롤 없는 컨테이너가
            sticky 기준만 가로채 하위 sticky(미리보기·모바일 상단바)를 죽인다 */}
        <main className="min-w-0 flex-1 bg-cream">
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

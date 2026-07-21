'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { useLogout } from '@duing/hooks';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { cn } from '@/app/_lib/cn';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { BrandMark } from '@/components/duing/BrandMark';
import { AdminNavContent } from './AdminNavContent';

/**
 * 어드민 영역 좌측 사이드바. md 이상 화면에서만 표시되고, 모바일에서는 AdminMobileBar 의
 * 햄버거 → 좌측 Sheet 드로어로 동일한 내비(AdminNavContent)에 접근한다.
 *
 * 접힘 상태는 localStorage 에 남긴다 — 운영자는 콘솔에 오래 머물며 표를 넓게 보고 싶어하는데,
 * 페이지를 옮길 때마다 원래 폭으로 돌아오면 매번 다시 접어야 한다.
 */
const COLLAPSED_STORAGE_KEY = 'duing:admin:sidebar-collapsed';

export function AdminSidebar() {
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

  return (
    <aside
      aria-label="관리자 메뉴"
      className={cn(
        'sticky top-0 hidden max-h-dvh shrink-0 flex-col self-start overflow-hidden md:flex',
        'm-3 rounded-lg border border-line bg-paper-warm shadow-1',
        'motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out',
        collapsed ? 'w-[84px]' : 'w-[248px]',
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center pb-3 pt-5',
          collapsed ? 'flex-col gap-3 px-0' : 'justify-between px-4',
        )}
      >
        <Link
          href="/admin"
          aria-label="총동연 관리자 대시보드"
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <BrandMark size={collapsed ? 20 : 24} />
        </Link>
        <button
          type="button"
          onClick={() => applyCollapsed(!collapsed)}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-pressed={collapsed}
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-line bg-cream text-charcoal-2',
            'outline-none hover:bg-sage-tint hover:text-ink-deep focus-visible:ring-2 focus-visible:ring-ink',
            'motion-safe:transition-colors',
          )}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <nav aria-label="관리 영역" className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <AdminNavContent collapsed={collapsed} onRequestExpand={() => applyCollapsed(false)} />
      </nav>

      <SidebarActions collapsed={collapsed} />
    </aside>
  );
}

/** 콘솔을 벗어나는 두 동작을 한 영역으로 묶는다 — 서비스로 돌아가기와 세션 종료. */
function SidebarActions({ collapsed }: { collapsed: boolean }) {
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

  const actionClass = cn(
    'flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-semibold text-charcoal-2 outline-none',
    'hover:bg-sage-tint hover:text-ink-deep focus-visible:ring-2 focus-visible:ring-ink',
    'motion-safe:transition-colors',
    collapsed && 'justify-center px-0',
  );

  return (
    <div className="shrink-0 border-t border-line px-3 pb-4 pt-3">
      <Link href="/" title={collapsed ? '홈으로' : undefined} className={actionClass}>
        <Home size={19} className="shrink-0" />
        {collapsed ? <span className="sr-only">홈으로</span> : <span>홈으로</span>}
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        title={collapsed ? '로그아웃' : undefined}
        className={cn(
          actionClass,
          'w-full text-left hover:bg-coral/10 hover:text-coral disabled:opacity-60',
        )}
      >
        <LogOut size={19} className="shrink-0" />
        {collapsed ? (
          <span className="sr-only">로그아웃</span>
        ) : (
          <span>{loggingOut ? '로그아웃 중' : '로그아웃'}</span>
        )}
      </button>
    </div>
  );
}

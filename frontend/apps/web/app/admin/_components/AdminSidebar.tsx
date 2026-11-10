'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { useLogout, useMeQuery } from '@duing/hooks';

import { NotificationBell } from '@/app/_components/NotificationBell';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { skipNextOverlayReclaim } from '@/app/_lib/backDismiss';
import { cn } from '@/app/_lib/cn';
import { clearOperatorLocalState } from '@/app/_lib/operatorLocalState';
import { useHydrated } from '@/app/_lib/useHydrated';
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
        // 사이트 상단바 없이 화면 맨 위에서 시작한다 — 위아래 여백(m-3)만큼 띄워 붙이고 그만큼 높이를 뺀다.
        'no-print sticky top-3 hidden max-h-[calc(100dvh-1.5rem)] shrink-0 flex-col self-start overflow-hidden md:flex',
        'm-3 rounded-lg border border-line bg-paper-warm shadow-1',
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
        {/* 알림 — 상단바가 맡던 자리. 접힌 폭에서는 로고 아래로 내려간다. */}
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-1')}>
          <NotificationBell />
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
      </div>

      <nav aria-label="관리 영역" className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <AdminNavContent collapsed={collapsed} onRequestExpand={() => applyCollapsed(false)} />
      </nav>

      <AdminSidebarActions collapsed={collapsed} />
    </aside>
  );
}

/**
 * 콘솔을 벗어나는 동작을 한 영역으로 묶는다 — 내 페이지, 서비스로 돌아가기, 세션 종료.
 * 데스크탑 사이드바와 모바일 드로어(AdminMobileBar)가 같이 쓴다.
 */
export function AdminSidebarActions({ collapsed = false }: { collapsed?: boolean }) {
  const logout = useLogout();
  // 서버 렌더는 me 없이 그려진다 — 하이드레이션 전에는 이름 줄을 그리지 않아 불일치를 피한다.
  const hydrated = useHydrated();
  const { data: me } = useMeQuery();
  const myName = hydrated ? me?.name : undefined;
  const { addToast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      clearOperatorLocalState();
      // 문서 하드 이동 — 라우터 캐시에 남은 인증 트리(/me·/manage, staleTimes.dynamic 180초)를 버리고
      // 메모리 상태를 통째로 비운다(공용 단말). router.replace 는 캐시를 남겨 로그아웃 직후 MY 탭이
      // 미들웨어 대신 옛 셸을 재생했다(#1225 의 반대 방향).
      // 하드 이동은 응답이 커밋될 때까지 문서가 살아 있다 — 그 사이 확인 모달·드로어가 닫히며 내보내는 회수
      // back() 이 진행 중인 이동을 취소할 수 있으므로(#855 실측 경합), 다음 닫힘 1회의 회수를 건너뛴다.
      skipNextOverlayReclaim();
      window.location.replace('/');
    } catch {
      addToast('로그아웃하지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.', {
        variant: 'error',
      });
    } finally {
      setLoggingOut(false);
    }
  };

  // 한 줄 — 왼쪽에 내 이름(마이페이지), 오른쪽에 홈으로·로그아웃 아이콘. 세 줄로 쌓으면 900px 높이에서 메뉴가 사이드바 안에서 스크롤된다.
  const iconActionClass = cn(
    'grid h-10 w-10 shrink-0 place-items-center rounded-md text-charcoal-2 outline-none',
    'hover:bg-sage-tint hover:text-ink-deep focus-visible:ring-2 focus-visible:ring-ink motion-safe:transition-colors',
  );

  return (
    <div className={cn('flex shrink-0 items-center gap-1 px-3 pb-3 pt-2', collapsed && 'flex-col')}>
      {/* me 로딩·실패면 이름 없이 나머지만 남긴다(fail-soft). */}
      {myName === undefined ? (
        <span aria-hidden className="flex-1" />
      ) : (
        <Link
          href="/me"
          title={collapsed ? `${myName} — 마이페이지` : '마이페이지'}
          className={cn(
            'flex min-h-10 min-w-0 items-center gap-2.5 rounded-md text-[13.5px] font-semibold text-charcoal-2 outline-none',
            'hover:bg-sage-tint hover:text-ink-deep focus-visible:ring-2 focus-visible:ring-ink motion-safe:transition-colors',
            collapsed ? 'w-10 justify-center' : 'flex-1 px-2',
          )}
        >
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-paper"
          >
            {myName.charAt(0)}
          </span>
          {collapsed ? (
            <span className="sr-only">{`${myName} — 마이페이지`}</span>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate">{myName}</span>
              <span className="sr-only"> — 마이페이지</span>
            </>
          )}
        </Link>
      )}
      <Link href="/" aria-label="홈으로" title="홈으로" className={iconActionClass}>
        <Home size={19} />
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        aria-label={loggingOut ? '로그아웃 중' : '로그아웃'}
        title="로그아웃"
        className={cn(iconActionClass, 'hover:bg-danger/10 hover:text-danger disabled:opacity-60')}
      >
        <LogOut size={19} />
      </button>
    </div>
  );
}

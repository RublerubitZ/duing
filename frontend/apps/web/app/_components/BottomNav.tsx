'use client';

// 공개 콘텐츠용 모바일 하단 탭바 (md:hidden) — 홈·탐색·캘린더·공지 4탭.
// 4탭 모두 공개 라우트라 게스트도 동일 동작. 개인영역(/me)·도구 콘솔(/manage·/admin)·
// 포커스 플로우(/apply)·인증·소개에서는 미노출(activeHref === null → return null).
// root(layout.tsx)에 1회 마운트하고 usePathname 으로 가시성/활성을 판단한다.
// 데스크탑은 기존 상단 HomeNav/ExploreNav 유지(이 바는 md:hidden).

import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { cn } from '@/app/_lib/cn';
import { Calendar, Compass, Home, Megaphone } from '@/components/duing/Icon';

const TABS = [
  { label: '홈', href: '/', Icon: Home },
  { label: '탐색', href: '/clubs', Icon: Compass },
  { label: '캘린더', href: '/calendar', Icon: Calendar },
  { label: '공지', href: '/notices', Icon: Megaphone },
] as const;

// 현재 경로가 어느 탭에 속하는지 — 홈은 정확히, 나머지는 prefix(상세/하위 포함). 탭 밖이면 null.
function matchTabHref(pathname: string): string | null {
  if (pathname === '/') return '/';
  // 동아리·공지 상세(/clubs/{id}, /notices/{id})는 자체 상단 액션바를 쓰는 포커스 뷰라 탭바를 숨긴다.
  if (/^\/(clubs|notices)\/\d+$/.test(pathname)) return null;
  const matched = TABS.find(
    (tab) => tab.href !== '/' && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)),
  );
  return matched ? matched.href : null;
}

export function BottomNav() {
  const pathname = usePathname();
  const activeHref = matchTabHref(pathname);

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
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
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

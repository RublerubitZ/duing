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

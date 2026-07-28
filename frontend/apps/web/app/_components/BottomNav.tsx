'use client';

// 공개 콘텐츠용 모바일 하단 탭바 (md:hidden) — 홈·탐색·시설·캘린더·정보 5탭.
// 5탭 모두 공개 라우트라 게스트도 동일 동작. 정보 탭은 정보 섹션 전체(/notices·/faq·/terms·/introduce)에
// 매칭되고, 이동은 마지막 방문 허브 경로(getLastInfoPath 단일 정책, 기본 /notices)다.
// 개인영역(/me)·도구 콘솔(/manage·/admin)·포커스 플로우(/apply)·인증에서는 미노출(activeHref === null → return null).
// root(layout.tsx)에 1회 마운트하고 usePathname 으로 가시성/활성을 판단한다.
// 데스크탑은 기존 상단 HomeNav/ExploreNav 유지(이 바는 md:hidden).

// 탭 전환은 View Transition 을 태우지 않는다(next/link) — 전역 크로스페이드는 전체 뷰포트를
// 스냅샷 이중 페인트해 유지되는 헤더·탭바·로고까지 깜빡여 보이게 한다(목록→상세 모핑 전용).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  PiBuilding, PiBuildingFill,
  PiCalendarBlank, PiCalendarBlankFill,
  PiCompass, PiCompassFill,
  PiHouse, PiHouseFill,
  PiInfo, PiInfoFill,
} from 'react-icons/pi';

import { cn } from '@/app/_lib/cn';
import { DEFAULT_INFO_PATH, isInfoSection } from '@/app/_lib/infoMenu';
import { useLastInfoPath } from '@/app/_lib/useLastInfoPath';

// 아이콘은 이 탭바에서만 Phosphor(react-icons/pi) 를 쓴다 — 비활성 Regular / 활성 Fill 이
// 같은 디자인 패밀리로 짝지어 제공되는 세트라 활성 표현에 억지 fill 이 필요 없다.
// lucide 는 아웃라인 전용이라 fill 을 씌우면 내부 디테일이 뭉개진다(다른 화면의 커스텀 아이콘은 그대로 유지).
// Phosphor 는 stroke 가 아니라 패스로 아웃라인을 그리므로 strokeWidth 는 의미가 없다.
const TABS = [
  { label: '홈', href: '/', Icon: PiHouse, ActiveIcon: PiHouseFill },
  { label: '탐색', href: '/clubs', Icon: PiCompass, ActiveIcon: PiCompassFill },
  // 2동짜리 PiBuildings 는 22px 에서 창문이 잘게 부서져 1동짜리를 골랐다.
  { label: '시설', href: '/facilities', Icon: PiBuilding, ActiveIcon: PiBuildingFill },
  { label: '캘린더', href: '/calendar', Icon: PiCalendarBlank, ActiveIcon: PiCalendarBlankFill },
  { label: '정보', href: DEFAULT_INFO_PATH, Icon: PiInfo, ActiveIcon: PiInfoFill },
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

  const activeIndex = TABS.findIndex((tab) => tab.href === activeHref);

  return (
    <>
      {/* 고정 탭바가 콘텐츠를 가리지 않도록 스크롤 여유(탭바 높이 + 세이프에어리어) */}
      <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden" />
      {/* overflow-hidden — 첫·마지막 탭의 focus-visible ring(inset, 사각)이 둥근 모서리 밖으로 새는 것을 막는다.
          바깥으로 그려지는 자체 그림자는 overflow 대상이 아니라 그대로 남는다. */}
      <nav
        aria-label="주요 메뉴"
        data-bottom-bar
        className="fixed inset-x-0 bottom-0 z-40 overflow-hidden rounded-t-lg border-t border-line/50 bg-paper/85 font-body shadow-[0_-6px_24px_rgb(31_74_54_/_0.07)] backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="relative flex">
          {/* 스포트라이트 — 탭 셀(w-1/5)을 가로질러 이동한다. 링크와 동일한 flex-col/gap/행 높이를
              그대로 복제해(라벨 자리는 invisible 텍스트로 확보) 아이콘 중심에 매직넘버 없이 정렬된다. */}
          {activeIndex >= 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 flex w-1/5 flex-col items-center justify-center gap-1 text-[10px] leading-none motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
              style={{ transform: `translateX(${activeIndex * 100}%)` }}
            >
              {/* closest-side — 좌우/상하 falloff 가 pill 비율 그대로라 위아래로 뭉치지 않는다. */}
              <span className="h-8 w-12 rounded-full bg-[radial-gradient(closest-side_at_50%_50%,rgb(157_182_160_/_0.55),rgb(157_182_160_/_0.18)_62%,rgb(157_182_160_/_0)_100%)]" />
              <span className="invisible">홈</span>
            </span>
          )}
          {TABS.map(({ label, href, Icon, ActiveIcon }) => {
            const on = activeHref === href;
            const TabIcon = on ? ActiveIcon : Icon;
            // 정보 탭만 마지막 방문 허브 경로로 이동한다(다른 탭은 고정 href).
            const linkHref = href === DEFAULT_INFO_PATH ? lastInfoPath : href;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={linkHref}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'relative flex h-14 flex-col items-center justify-center gap-1 text-[10px] leading-none motion-safe:transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink',
                    on ? 'font-extrabold text-ink-deep' : 'font-semibold text-charcoal-3',
                  )}
                >
                  {/* 스포트라이트 pill 과 같은 h-8 행을 차지해 정렬을 맞춘다. */}
                  <span className="grid h-8 w-12 place-items-center">
                    <TabIcon size={22} aria-hidden />
                  </span>
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

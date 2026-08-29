'use client';

// 공개 콘텐츠용 모바일 하단 탭바 (md:hidden) — 홈·탐색·시설·일정·소식 5탭.
// 5탭 모두 공개 라우트라 게스트도 동일 동작. '소식' 탭은 라벨만 시안을 따른 것이고 범위는 그대로
// 정보 섹션 전체(/notices·/faq·/terms·/introduce)다 — 이동은 마지막 방문 허브 경로
// (getLastInfoPath 단일 정책, 기본 /notices). 판정 함수 이름이 isInfoSection 인 이유이기도 하다.
// 개인영역(/me)·도구 콘솔(/manage·/admin)·포커스 플로우(/apply)·인증에서는 미노출(activeHref === null → return null).
// root(layout.tsx)에 1회 마운트하고 usePathname 으로 가시성/활성을 판단한다.
// 데스크탑은 기존 상단 HomeNav/ExploreNav 유지(이 바는 md:hidden).

// 탭 전환은 View Transition 을 태우지 않는다(next/link) — 전역 크로스페이드는 전체 뷰포트를
// 스냅샷 이중 페인트해 유지되는 헤더·탭바·로고까지 깜빡여 보이게 한다(목록→상세 모핑 전용).
import Link from 'next/link';

import { cn } from '@/app/_lib/cn';
import { DEFAULT_INFO_PATH, isInfoSection } from '@/app/_lib/infoMenu';
import { useLastInfoPath } from '@/app/_lib/useLastInfoPath';
import { useRoutePathname } from '@/app/_lib/useRoutePathname';

import {
  BinocularsFill, BinocularsRegular,
  BuildingFill, BuildingRegular,
  CalendarBlankFill, CalendarBlankRegular,
  HouseFill, HouseRegular,
  MegaphoneFill, MegaphoneRegular,
} from './BottomNavIcons';

// 아이콘은 시안(Figma 491:4527 "네비게이션 바")의 Phosphor 세트를 그대로 쓴다 — 홈 House · 탐색 Binoculars ·
// 일정 CalendarBlank · 소식 Megaphone, 시설만 시안에서 직접 그린 건물. 비활성은 Regular, 활성은 Fill 한 쌍이라
// 활성 표현에 억지 fill 이 필요 없다. 패스는 BottomNavIcons 에 시안 export 그대로 담겨 있어 새 의존성이 없다.
// (예전 Heroicons/lucide 혼용 세트는 시안이 확정되면서 걷어냈다.)
const TABS = [
  { label: '홈', href: '/', Icon: HouseRegular, ActiveIcon: HouseFill },
  { label: '탐색', href: '/clubs', Icon: BinocularsRegular, ActiveIcon: BinocularsFill },
  { label: '시설', href: '/facilities', Icon: BuildingRegular, ActiveIcon: BuildingFill },
  { label: '일정', href: '/calendar', Icon: CalendarBlankRegular, ActiveIcon: CalendarBlankFill },
  { label: '소식', href: DEFAULT_INFO_PATH, Icon: MegaphoneRegular, ActiveIcon: MegaphoneFill },
] as const;

// 현재 경로가 어느 탭에 속하는지 — 홈은 정확히, 소식은 정보 섹션 매칭, 나머지는 prefix(상세/하위 포함). 탭 밖이면 null.
function matchTabHref(pathname: string): string | null {
  if (pathname === '/') return '/';
  // 동아리·공지 상세(/clubs/{id}, /notices/{id})는 자체 상단 액션바를 쓰는 포커스 뷰라 탭바를 숨긴다.
  // 시설 상세(/facilities/{id})는 자체 액션바가 없는 유틸리티 뷰라 탭바를 유지한다(포커스 뷰 아님).
  // 정보 섹션 판정보다 먼저 — 공지 상세는 정보 섹션이지만 탭바를 숨기는 기존 정책을 유지한다.
  if (/^\/(clubs|notices)\/\d+$/.test(pathname)) return null;
  // 소식 탭은 단일 prefix 가 아니라 정보 섹션 전체에 매칭된다.
  if (isInfoSection(pathname)) return DEFAULT_INFO_PATH;
  const matched = TABS.find(
    (tab) => tab.href !== '/' && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)),
  );
  return matched ? matched.href : null;
}

export function BottomNav() {
  // usePathname 이 아니라 정규화 훅 — 홈(`/`)은 ISR 이라 재생성 중 `/index` 가 넘어오고,
  // 그러면 matchTabHref 가 null 을 돌려 탭바가 통째로 빠진 HTML 이 캐시된다(React #418).
  const pathname = useRoutePathname();
  const activeHref = matchTabHref(pathname);
  const lastInfoPath = useLastInfoPath(pathname);

  if (activeHref === null) return null;

  return (
    <>
      {/* 고정 탭바가 콘텐츠를 가리지 않도록 스크롤 여유(탭바 높이 60 + 세이프에어리어) */}
      <div aria-hidden className="h-[calc(60px+env(safe-area-inset-bottom))] md:hidden" />
      {/* 시안(모바일 프레임 509:9207): 흰 면, 상단 0.5px #E1E1E1 헤어라인, 위 모서리 10px, 그림자·블러 없음.
          바 높이 60 은 시안 93 에서 홈 인디케이터 영역 34 를 뺀 값이고, 그 34 는 env(safe-area-inset-bottom) 이 맡는다.
          overflow-hidden — 첫·마지막 탭의 focus-visible ring(inset, 사각)이 둥근 모서리 밖으로 새는 것을 막는다. */}
      <nav
        aria-label="주요 메뉴"
        data-bottom-bar
        className="fixed inset-x-0 bottom-0 z-40 overflow-hidden rounded-t-[10px] border-t-[0.5px] border-[#E1E1E1] bg-paper font-body pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex">
          {TABS.map(({ label, href, Icon, ActiveIcon }) => {
            const on = activeHref === href;
            const TabIcon = on ? ActiveIcon : Icon;
            // 정보 탭만 마지막 방문 허브 경로로 이동한다(다른 탭은 고정 href).
            const linkHref = href === DEFAULT_INFO_PATH ? lastInfoPath : href;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={linkHref}
                  // 홈 탭만 프리페치 제외(P0) — force-dynamic 시절 뷰포트 프리페치가 페이지뷰마다
                  // 서버리스 함수를 깨우던 조치. 홈이 ISR(#925)로 바뀌어 프리페치가 CDN HIT 이 될
                  // 수 있지만, 복원은 Active CPU 실측 후 별도 판단한다. prefetch={false} 는 hover·터치
                  // 프리페치까지 전부 꺼서 첫 탭 커밋이 RSC 응답 시작까지 지연될 수 있다 — 의도된 트레이드오프다.
                  prefetch={href === '/' ? false : undefined}
                  aria-current={on ? 'page' : undefined}
                  // 시안: 아이콘 26 바로 아래 라벨 11px(행간 1.5, 자간 -3%). 비활성 Medium #5A5A5A, 활성 SemiBold 딥그린.
                  // Font Guide 는 500 을 쓰지 않지만 시안이 Medium 이라 따른다 — Pretendard Variable 이라 500 이 실제로 렌더된다.
                  className={cn(
                    'flex h-[60px] flex-col items-center justify-center text-[11px] leading-[1.5] tracking-tightest motion-safe:transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink',
                    on ? 'font-semibold text-ink-deep' : 'font-medium text-[#5A5A5A]',
                  )}
                >
                  {/* 26px — 시안 export 그리드와 1:1 이라 패스가 반픽셀로 흐려지지 않는다. 채움 아이콘이라 stroke 옵션이 없다. */}
                  <TabIcon size={26} aria-hidden />
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

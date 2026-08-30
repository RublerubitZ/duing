'use client';

// GNB 탭 이동은 View Transition 제외(next/link) — 병렬 탭 전환에 전역 크로스페이드를 돌리면
// 화면 전체가 재구성되는 것처럼 깜빡인다. VT 는 목록→상세(로고 모핑) 전진 내비에만 쓴다.
import Link from 'next/link';

import { cn } from '@/app/_lib/cn';
import {
  NAV_LINK_ACTIVE,
  NAV_LINK_INACTIVE,
  NAV_LINK_UNDERLINE,
  NAV_LIST_BASE,
  NAV_ROW_BASE,
} from './navLinkStyles';
import { DEFAULT_INFO_PATH, isInfoSection, type InfoPath } from '@/app/_lib/infoMenu';

import { BrandMark } from '@/components/duing/BrandMark';
import { NotificationBell } from './NotificationBell';
import { HomeNavAuthSlot } from './HomeNavAuthSlot';
import { HomeNavAdminLink } from './HomeNavAdminLink';
import { InfoNavLink } from './InfoNavLink';
import { useRoutePathname } from '@/app/_lib/useRoutePathname';

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
  { label: '일정', href: '/calendar' },
  // 소식: 라벨만 시안을 따른 것이고 범위는 정보 섹션 전체(/notices·/faq·/terms·/introduce)다.
  // 이동은 마지막 방문 허브 경로(아래 참고).
  { label: '소식', href: DEFAULT_INFO_PATH, match: isInfoSection },
];

type Props = {
  /** pathname 대신 레이블로 강제 활성화할 때 사용. */
  active?: string;
  floating?: boolean;
  /** 하단 탭바가 같은 링크를 제공하는 라우트에서 true — 모바일 상단바를 슬림화하려 네비 링크를 md 미만에서 숨긴다. */
  slimOnMobile?: boolean;
};

export function ExploreNav({ active, floating = false, slimOnMobile = false }: Props) {
  // raw usePathname 은 트레일링 슬래시 URL 에서 프리렌더 셸과 갈린다 — 정규화 훅을 쓴다(#1021).
  const pathname = useRoutePathname();

  // 동아리·공지 상세(/clubs/{id}, /notices/{id})는 자체 상단 액션바를 쓰는 포커스 뷰라 모바일에서 이 브랜드 바를 숨긴다.
  // 시설 상세(/facilities/{id})는 자체 액션바가 없는 유틸리티 뷰라 브랜드 바를 유지한다.
  const isDetailFocus = /^\/(clubs|notices)\/\d+$/.test(pathname);

  const isActive = (item: NavItem): boolean => {
    if (active) return item.label === active;
    if (item.match) return item.match(pathname);
    if (item.href === '/') return pathname === '/';
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  return (
    <header
      className={cn(
        floating ? 'absolute inset-x-0 top-0' : 'relative',
        'z-50 bg-cream/90 backdrop-blur',
        isDetailFocus && 'hidden md:block',
      )}
    >
      <nav className={NAV_ROW_BASE}>
        {/* `/` 링크는 프리페치 제외(P0) — force-dynamic 시절 서버리스 비용 조치. 홈이 ISR(#925)로
            바뀐 뒤에도 복원은 Active CPU 실측 후 별도 판단한다. hover·터치 프리페치까지 꺼져
            첫 클릭 커밋이 RSC 응답 시작까지 지연될 수 있다 — 의도된 트레이드오프. */}
        <Link href="/" prefetch={false} aria-label="두잉 홈" className="translate-y-[3px]">
          <BrandMark size={32} />
        </Link>

        <ul
          className={cn(
            NAV_LIST_BASE,
            slimOnMobile ? 'hidden md:flex' : 'flex',
          )}
        >
          {NAV_ITEMS.map((item) => {
            const on = isActive(item);
            // match 가 있는 항목(소식)은 HomeNav 와 같은 InfoNavLink — 마지막 방문 허브 경로로 이동하고
            // PC hover 에 허브 퀵메뉴를 편다(어느 페이지에서든 같은 자리에서 같은 메뉴).
            if (item.match) {
              return (
                <li key={item.label}>
                  <InfoNavLink
                    className={on ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}
                    active={on}
                    underlineClassName={NAV_LINK_UNDERLINE}
                  />
                </li>
              );
            }
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  // 홈만 프리페치 제외 — 위 브랜드 링크와 같은 이유(P0 Active CPU 조치 유지).
                  prefetch={item.href === '/' ? false : undefined}
                  aria-current={on ? 'page' : undefined}
                  className={on ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}
                >
                  {item.label}
                  {on && (
                    <span className={NAV_LINK_UNDERLINE} />
                  )}
                </Link>
              </li>
            );
          })}
          {/* 총동연 콘솔 — ADMIN 에게만 렌더된다(HomeNav 와 동일). 홈이 아닌 페이지에서도 보이도록 여기에도 둔다. */}
          <li>
            <HomeNavAdminLink className={NAV_LINK_INACTIVE} />
          </li>
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <HomeNavAuthSlot />
        </div>
      </nav>
    </header>
  );
}

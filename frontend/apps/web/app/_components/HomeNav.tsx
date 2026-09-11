'use client';

// GNB 탭 이동은 View Transition 제외(next/link) — ExploreNav·BottomNav 와 동일 정책.
import Link from 'next/link';
import { BrandMark } from '@/components/duing/BrandMark';
import { cn } from '@/app/_lib/cn';
import { MAIN_NAV_ITEMS, isMainNavActive } from '@/app/_lib/mainNav';
import { useRoutePathname } from '@/app/_lib/useRoutePathname';
import {
  NAV_LINK_ACTIVE,
  NAV_LINK_INACTIVE,
  NAV_LINK_UNDERLINE,
  NAV_LIST_BASE,
  NAV_ROW_BASE,
} from './navLinkStyles';
import { HomeNavAdminLink } from './HomeNavAdminLink';
import { HomeNavAuthSlot } from './HomeNavAuthSlot';
import { InfoNavLink } from './InfoNavLink';
import { NotificationBell } from './NotificationBell';

// slimOnMobile: 모바일 상단바를 브랜드 + 알림 벨 + 유저메뉴/로그인 으로 슬림화하기 위해
// 네비 링크를 md 미만에서 숨긴다. 현재 모든 호출부가 이 옵션을 켜며, 모바일 내비게이션은
// 하단 탭바(BottomNav)·유저 메뉴 드롭다운·푸터가 대신한다. 끄면(false, 기본값) md 미만에서도
// 상단 네비 링크가 그대로 노출된다.
//
// 인증 UI(알림 벨·유저메뉴)는 서버 시드 없이 클라이언트 스토어로만 결정된다 — 호출부가 전부
// 정적/ISR 라우트라 쿠키를 읽을 수 없다(홈 ISR 전환 #925 로 A′ 서버 시드 전달자가 사라짐).
type Props = { slimOnMobile?: boolean };

export function HomeNav({ slimOnMobile = false }: Props) {
  // 홈은 ISR 이라 재생성 중 `/index` 가 넘어온다 — 경로로 렌더를 가르려면 정규화 훅이어야 한다(#950).
  const pathname = useRoutePathname();

  return (
    <header className="relative z-50 bg-cream/90 backdrop-blur">
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
          {MAIN_NAV_ITEMS.map((item) => {
            const on = isMainNavActive(item, pathname);
            // match 가 있는 항목(소식)은 ExploreNav 와 같은 InfoNavLink — 마지막 방문 허브 경로로 이동하고
            // PC hover 에 허브 퀵메뉴를 편다.
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
                  {on && <span className={NAV_LINK_UNDERLINE} />}
                </Link>
              </li>
            );
          })}
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

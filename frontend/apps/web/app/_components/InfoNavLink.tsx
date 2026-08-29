'use client';

import { useState } from 'react';
// GNB "정보" 탭 이동은 View Transition 제외(next/link) — ExploreNav·BottomNav 와 동일 정책.
import Link from 'next/link';

import { INFO_MENU_ITEMS } from '@/app/_lib/infoMenu';
import { useLastInfoPath } from '@/app/_lib/useLastInfoPath';
import { useRoutePathname } from '@/app/_lib/useRoutePathname';

/**
 * HomeNav(Server Component)용 "소식" 링크(범위는 정보 섹션 전체) + PC Hover Quick Menu.
 * - "소식" 클릭: 마지막 방문 허브 경로(getLastInfoPath 단일 정책, 기본 /notices)로 이동.
 * - hover(또는 키보드 포커스 진입) 시 허브 4개로 직행하는 Quick Menu 를 펼친다 — HomeNav 가
 *   렌더되는 모든 화면에서 동작(스펙 결정 11, 컴포넌트 단위 적용). 터치 기기는 첫 탭이 hover 를
 *   합성할 수 있어 matchMedia('(hover: hover)') 게이트로 막는다 — 탭은 곧바로 클릭 이동.
 * - ExploreNav/정보 섹션 내부에는 이 메뉴를 두지 않는다 — 섹션 내비게이션은 InfoTabs 담당.
 */
export function InfoNavLink({ className }: { className?: string }) {
  // 홈(ISR)에서 렌더되므로 usePathname 이 아니라 정규화 훅을 쓴다 — 재생성 중에는 `/index` 가
  // 넘어오고, 경로로 렌더를 가르는 순간 서버/클라이언트가 갈린다(#950 과 동일 함정).
  const pathname = useRoutePathname();
  const lastInfoPath = useLastInfoPath(pathname);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  // 터치 기기는 첫 탭에 hover 합성 이벤트(ghost-hover)를 만들 수 있어, hover 지원 기기에서만
  // 메뉴를 연다 — 터치의 탭은 곧바로 클릭 이동이어야 한다(스펙 결정 11). 키보드 포커스 열림은 유지.
  const openIfHoverCapable = () => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches) {
      setQuickMenuOpen(true);
    }
  };

  return (
    <div
      className="relative"
      onMouseEnter={openIfHoverCapable}
      onMouseLeave={() => setQuickMenuOpen(false)}
      onFocus={() => setQuickMenuOpen(true)}
      onBlur={(blurEvent) => {
        // 포커스가 래퍼 밖으로 나갈 때만 닫는다 — 패널 내부 링크로의 탭 이동은 유지.
        const nextFocused = blurEvent.relatedTarget;
        if (!(nextFocused instanceof Node) || !blurEvent.currentTarget.contains(nextFocused)) {
          setQuickMenuOpen(false);
        }
      }}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === 'Escape') setQuickMenuOpen(false);
      }}
    >
      <Link href={lastInfoPath} className={className} aria-expanded={quickMenuOpen}>
        소식
      </Link>
      {quickMenuOpen && (
        // pt-2 가 트리거와 패널 사이 hover 브리지 — 마진이면 데드존이 생겨 메뉴가 깜빡인다.
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2">
          <ul className="w-[160px] rounded-md border border-line bg-paper py-1 shadow-2">
            {INFO_MENU_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block px-4 py-2.5 text-[13px] font-medium text-charcoal-2 hover:bg-cream hover:text-ink"
                  onClick={() => setQuickMenuOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

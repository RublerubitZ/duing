'use client';

import { useState } from 'react';
// GNB "정보" 탭 이동은 View Transition 제외(next/link) — ExploreNav·BottomNav 와 동일 정책.
import Link from 'next/link';

import { INFO_MENU_ITEMS } from '@/app/_lib/infoMenu';
import { useLastInfoPath } from '@/app/_lib/useLastInfoPath';
import { useRoutePathname } from '@/app/_lib/useRoutePathname';

/**
 * 상단바 "소식" 링크(범위는 정보 섹션 전체) + PC Hover Quick Menu. HomeNav(Server Component)와
 * ExploreNav 가 같이 쓴다 — 예전엔 홈에만 있었는데, 어느 페이지에서든 같은 자리에서 같은 메뉴가
 * 나와야 한다는 요청으로 전 화면 공통이 됐다(정보 섹션 안에서도 InfoTabs 와 함께 노출).
 * - "소식" 클릭: 마지막 방문 허브 경로(getLastInfoPath 단일 정책, 기본 /notices)로 이동.
 * - hover(또는 키보드 포커스 진입) 시 허브 4개로 직행하는 Quick Menu 를 펼친다. 터치 기기는 첫 탭이
 *   hover 를 합성할 수 있어 matchMedia('(hover: hover)') 게이트로 막는다 — 탭은 곧바로 클릭 이동.
 * - active: 정보 섹션 안에 있을 때 aria-current 와 밑줄 바(ExploreNav 의 다른 항목과 같은 표시).
 */
export function InfoNavLink({
  className,
  active = false,
  underlineClassName,
}: {
  className?: string;
  active?: boolean;
  /** active 일 때 링크 안에 얹는 밑줄 바 클래스(navLinkStyles.NAV_LINK_UNDERLINE). */
  underlineClassName?: string;
}) {
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
      <Link
        href={lastInfoPath}
        className={className}
        aria-expanded={quickMenuOpen}
        aria-current={active ? 'page' : undefined}
      >
        소식
        {active && underlineClassName && <span className={underlineClassName} />}
      </Link>
      {quickMenuOpen && (
        // pt-3 가 트리거와 패널 사이 hover 브리지 — 마진이면 데드존이 생겨 메뉴가 깜빡인다.
        // 패널은 DESIGN.md 드롭다운 규격(16px 라운드·shadow-3·항목 hover sage-tint)을 따르고, 열릴 때
        // 150ms 페이드+살짝 내려앉는 진입 모션을 준다 — 즉시 튀어나오면 딱딱하게 보인다(motion-reduce 는 정지).
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3">
          <ul className="w-[172px] rounded-[16px] border border-line bg-paper p-1.5 shadow-3 animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out motion-reduce:animate-none">
            {INFO_MENU_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-[10px] px-3 py-2 text-[13.5px] font-semibold tracking-tightest text-charcoal-2 transition-colors duration-150 hover:bg-sage-tint hover:text-ink-deep focus-visible:bg-sage-tint focus-visible:text-ink-deep focus-visible:outline-none motion-reduce:transition-none"
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

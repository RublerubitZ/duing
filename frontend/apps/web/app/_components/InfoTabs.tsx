'use client';

// 정보 섹션 공용 탭 스트립 — 허브 4페이지(/notices·/faq·/terms·/introduce)의 GNB 바로 아래에
// 수동 배치한다(조건부 렌더링 아님 — 상세 페이지에는 배치하지 않는 것이 정책, 스펙 결정 10).
// 페이지 이동 링크이므로 Radix Tabs(인페이지 상태 위젯)가 아니라 nav+Link 시맨틱을 쓴다.
// sticky 는 모바일 전용이 의도된 UX(md+ 는 static) — 전역 헤더가 sticky 가 아닌 구조와 일관.

import { useEffect } from 'react';
// 허브 간 탭 이동도 View Transition 제외(next/link) — GNB 탭과 동일 정책(전역 크로스페이드 깜빡임).
import Link from 'next/link';

import { cn } from '@/app/_lib/cn';
import { INFO_MENU_ITEMS, rememberInfoPath } from '@/app/_lib/infoMenu';
import { useRoutePathname } from '@/app/_lib/useRoutePathname';

export function InfoTabs() {
  // 정확 일치 비교(aria-current)라 트레일링 슬래시가 붙으면 프리렌더 셸과 갈린다 — 정규화 훅을 쓴다(#1021).
  const pathname = useRoutePathname();

  // 마운트 1회가 아니라 pathname 변경마다 기록 — 인스턴스가 유지된 채 경로만 바뀌는 경우 대응.
  useEffect(() => {
    rememberInfoPath(pathname);
  }, [pathname]);

  // 하단 헤어라인은 모바일에서만 둔다 — 여기서는 sticky 라 본문이 바 뒤로 지나가 가를 여백이 없고,
  // bg-cream/95 가 페이지 배경과 거의 같은 색이라 선이 유일한 경계다. md 이상은 md:static 이라
  // 겹침이 없고, 그때의 받침선은 순수 섹션 구분선이므로 두지 않는다.
  return (
    <nav
      aria-label="정보"
      className="sticky top-0 z-40 max-md:border-b max-md:border-line bg-cream/95 backdrop-blur md:static"
    >
      {/* overflow 래퍼의 pb-px: 활성 탭 언더라인(max-md:-mb-px)이 세로로 잘리는 것을 방지 */}
      <div className="max-w-layout mx-auto overflow-x-auto px-4 pb-px sm:px-6 md:overflow-visible md:px-10 md:pb-0">
        <ul className="flex w-max min-w-full gap-6 md:gap-8">
          {INFO_MENU_ITEMS.map((item) => {
            const on = pathname === item.href;
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'max-md:-mb-px inline-flex min-h-[44px] items-center whitespace-nowrap border-b-[2.5px] text-[14px] font-semibold transition-colors',
                    on ? 'border-ink text-ink' : 'border-transparent text-charcoal-3 hover:text-ink',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

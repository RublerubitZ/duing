'use client';

// 정보 섹션 공용 탭 스트립 — 허브 4페이지(/notices·/faq·/terms·/introduce)의 GNB 바로 아래에
// 수동 배치한다(조건부 렌더링 아님 — 상세 페이지에는 배치하지 않는 것이 정책, 스펙 결정 10).
// 페이지 이동 링크이므로 Radix Tabs(인페이지 상태 위젯)가 아니라 nav+Link 시맨틱을 쓴다.
// sticky 는 모바일 전용이 의도된 UX(md+ 는 static) — 전역 헤더가 sticky 가 아닌 구조와 일관.

import { useEffect } from 'react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { cn } from '@/app/_lib/cn';
import { INFO_MENU_ITEMS, rememberInfoPath } from '@/app/_lib/infoMenu';

export function InfoTabs() {
  const pathname = usePathname();

  // 마운트 1회가 아니라 pathname 변경마다 기록 — 인스턴스가 유지된 채 경로만 바뀌는 경우 대응.
  useEffect(() => {
    rememberInfoPath(pathname);
  }, [pathname]);

  return (
    <nav
      aria-label="정보"
      className="sticky top-0 z-40 border-b border-line bg-cream/95 backdrop-blur md:static"
    >
      {/* overflow 래퍼의 pb-px: 활성 탭 언더라인(-mb-px)이 세로로 잘리는 것을 방지(ClubDetailTabs 함정) */}
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
                    '-mb-px inline-flex min-h-[44px] items-center whitespace-nowrap border-b-[2.5px] text-[14px] font-semibold transition-colors',
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

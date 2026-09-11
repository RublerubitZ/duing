'use client';

// 형제 페이지 간 전환(일정 ↔ 시설 예약) — 페이지 이동이므로 Radix Tabs 가 아니라 nav+Link(InfoTabs 와 같은 정책, VT 제외).
// 모바일 전용(md 미만): 하단 탭이 '일정·시설' 한 탭이라 형제로 건너갈 길이 필요하지만, PC 상단바는 시설·일정이
// 각각 항목이라 세그먼트가 중복이다(2026-09-11 사용자 결정). BottomNav 의 md:hidden 과 같은 경계를 쓴다.
import Link from 'next/link';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { useRoutePathname } from '@/app/_lib/useRoutePathname';

type Item = { label: string; href: `/${string}` };

export function PageSegment({ label, items }: { label: string; items: readonly Item[] }) {
  const pathname = useRoutePathname();
  return (
    <nav aria-label={label} className="mb-4 md:hidden">
      <ul className="inline-flex gap-1 rounded-[12px] border border-line bg-paper p-1">
        {items.map((item) => {
          const on = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <li key={item.href}>
              <Link
                href={toRoute(item.href)}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[36px] items-center rounded-[9px] px-3.5 text-[13.5px] font-semibold transition-colors',
                  on ? 'bg-ink text-paper' : 'text-charcoal-2 hover:bg-graysoft',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

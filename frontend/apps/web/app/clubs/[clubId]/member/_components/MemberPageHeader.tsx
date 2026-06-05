'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';

type Props = { clubId: number; clubName: string };

export function MemberPageHeader({ clubId, clubName }: Props) {
  const pathname = usePathname();
  const tabs = [
    { href: `/clubs/${clubId}/member/notices`, label: '공지' },
    { href: `/clubs/${clubId}/member/events`,  label: '일정' },
  ];

  return (
    <header className="mx-auto max-w-3xl px-6 pt-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{clubName} 회원 페이지</h1>
        <Link
          href={toRoute(`/clubs/${clubId}`)}
          className="text-sm text-charcoal-2 hover:text-ink"
        >
          ← 동아리 소개 보기
        </Link>
      </div>
      <nav className="flex gap-2 border-b border-line">
        {tabs.map((tab) => {
          const active = pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={toRoute(tab.href as `/${string}`)}
              className={cn(
                'px-4 py-2 text-sm font-medium',
                active ? 'border-b-2 border-ink text-ink' : 'text-charcoal-3 hover:text-ink',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

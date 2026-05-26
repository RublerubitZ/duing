'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/app/_lib/cn';

import { BrandMark } from './BrandMark';
import { NotificationBell } from './NotificationBell';
import { HomeNavAuthSlot } from './HomeNavAuthSlot';

const NAV_ITEMS = [
  { label: '홈', href: '/' },
  { label: '탐색', href: '/clubs' },
  { label: '캘린더', href: '/calendar' },
  { label: '공지', href: '/notices' },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

type Props = {
  /** pathname 대신 레이블로 강제 활성화할 때 사용. */
  active?: string;
  floating?: boolean;
};

export function ExploreNav({ active, floating = false }: Props) {
  const pathname = usePathname();

  const isActive = (item: NavItem): boolean => {
    if (active) return item.label === active;
    if (item.href === '/') return pathname === '/';
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  return (
    <header
      className={cn(
        floating ? 'absolute inset-x-0 top-0' : 'relative',
        'z-50 bg-cream/90 backdrop-blur border-b border-line',
      )}
    >
      <nav className="max-w-layout mx-auto flex items-center gap-12 px-10 py-2">
        <Link href="/" aria-label="두잉 홈">
          <BrandMark size={56} />
        </Link>

        <ul className="flex items-center gap-8 text-[13.5px] font-semibold">
          {NAV_ITEMS.map((item) => {
            const on = isActive(item);
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={`relative py-1 ${on ? 'text-ink-deep' : 'text-charcoal-3 hover:text-charcoal'}`}
                >
                  {item.label}
                  {on && (
                    <span className="absolute -bottom-1 left-0 right-0 h-[2px] rounded-full bg-ink" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <HomeNavAuthSlot />
        </div>
      </nav>
    </header>
  );
}

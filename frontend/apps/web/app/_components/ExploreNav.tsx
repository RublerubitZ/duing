'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from './BrandMark';

const NAV_ITEMS = [
  { label: '홈', href: '/' },
  { label: '탐색', href: '/clubs' },
  { label: '캘린더', href: '/calendar' },
  { label: '공지', href: '/notices' },
] as const;

type Props = {
  active?: string;
  floating?: boolean;
};

export function ExploreNav({ active, floating = false }: Props) {
  const pathname = usePathname();

  const isActive = (item: (typeof NAV_ITEMS)[number]) =>
    active ? item.label === active : pathname === item.href;

  return (
    <header
      className={`${floating ? 'absolute inset-x-0 top-0 z-10' : 'relative'} bg-cream/90 backdrop-blur border-b border-line`}
    >
      <nav className="max-w-layout mx-auto flex items-center gap-12 px-10 py-4">
        <Link href="/" aria-label="두잉 홈">
          <BrandMark size={26} />
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

        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            aria-label="알림"
            className="grid place-items-center w-10 h-10 rounded-full text-charcoal-2 hover:bg-graysoft"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </button>

          <Link
            href="/me"
            className="flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-full bg-paper border-[1.5px] border-line text-[13px] font-bold text-ink hover:border-ink"
          >
            내 두잉
            <span className="grid place-items-center w-[26px] h-[26px] rounded-full bg-ink text-white text-[11px] font-bold">
              도
            </span>
          </Link>
        </div>
      </nav>
    </header>
  );
}

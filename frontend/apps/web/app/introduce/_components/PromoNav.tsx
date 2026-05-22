import Link from 'next/link';
import { BrandMark } from '@/components/duing/BrandMark';
import { NotificationBell } from '../../_components/NotificationBell';
import { HomeNavAuthSlot } from '../../_components/HomeNavAuthSlot';

const NAV_ITEMS = ['소개', '주요 기능', '사용법', '후기'] as const;

export function PromoNav() {
  return (
    <header
      className="sticky top-0 z-50 border-b border-line backdrop-blur-xl"
      style={{ background: 'rgba(246,243,236,0.85)' }}
    >
      <div className="max-w-layout mx-auto flex items-center gap-9 px-10 py-4">
        <Link href="/" aria-label="두잉 홈">
          <BrandMark size={26} />
        </Link>
        <span className="text-xs font-semibold text-charcoal-3 tracking-body">
          for 대구대학교
        </span>
        <nav className="ml-7 hidden gap-7 md:flex">
          {NAV_ITEMS.map((item, idx) => (
            <a
              key={item}
              href={`#section-${idx + 1}`}
              className={`text-sm font-semibold ${idx === 0 ? 'text-ink-deep' : 'text-charcoal-3'}`}
            >
              {item}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <HomeNavAuthSlot />
        </div>
      </div>
    </header>
  );
}

import Link from 'next/link';
import { BrandMark } from '@/components/duing/BrandMark';
import { HomeNavAdminLink } from './HomeNavAdminLink';
import { HomeNavAuthSlot } from './HomeNavAuthSlot';
import { NotificationBell } from './NotificationBell';

const inactiveLink = 'relative py-1 text-charcoal-3 hover:text-charcoal';
const activeLink = 'relative py-1 text-ink-deep';

export function HomeNav() {
  return (
    <header className="relative z-50 border-b border-line bg-cream/90 backdrop-blur">
      <nav className="max-w-layout mx-auto flex items-center gap-12 px-10 py-4">
        <Link href="/" aria-label="두잉 홈">
          <BrandMark size={56} />
        </Link>
        <ul className="flex items-center gap-8 text-[13.5px] font-semibold">
          <li>
            <Link href="/" className={activeLink}>
              홈
              <span className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-ink" />
            </Link>
          </li>
          <li>
            <Link href="/clubs" className={inactiveLink}>
              탐색
            </Link>
          </li>
          <li>
            <Link href="/calendar" className={inactiveLink}>
              캘린더
            </Link>
          </li>
          <li>
            <Link href="/notices" className={inactiveLink}>
              공지
            </Link>
          </li>
          <li className="ml-6">
            <Link href="/introduce" className={inactiveLink}>
              서비스 소개
            </Link>
          </li>
          <li>
            <HomeNavAdminLink className={inactiveLink} />
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

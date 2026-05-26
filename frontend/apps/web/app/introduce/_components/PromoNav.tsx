import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';
import { NotificationBell } from '../../_components/NotificationBell';
import { HomeNavAuthSlot } from '../../_components/HomeNavAuthSlot';

type InternalNavLink = { label: string; kind: 'internal'; href: `/${string}` };
type AnchorNavLink = { label: string; kind: 'anchor'; href: string };
type NavLink = InternalNavLink | AnchorNavLink;

const NAV_LINKS: NavLink[] = [
  { label: '탐색', kind: 'internal', href: '/clubs' },
  { label: '캘린더', kind: 'anchor', href: '#' },
  { label: '공지', kind: 'anchor', href: '#' },
  { label: 'FAQ', kind: 'anchor', href: '#faq' },
];

export function PromoNav() {
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: 'rgba(243,239,228,.82)',
        backdropFilter: 'saturate(140%) blur(12px)',
        WebkitBackdropFilter: 'saturate(140%) blur(12px)',
        borderBottomColor: 'rgba(217,212,195,.6)',
      }}
    >
      <div className="mx-auto flex max-w-[1180px] items-center gap-8 px-8 py-[14px]">
        <Link
          href="/"
          className="font-mono text-[19px] font-bold no-underline"
          style={{ letterSpacing: '-0.02em', color: '#2c4124' }}
          aria-label="두잉 홈"
        >
          Du<span style={{ color: '#5b7e4d' }}>·</span>ing
        </Link>

        <nav className="hidden flex-1 md:block">
          <ul className="m-0 flex list-none gap-[22px] p-0">
            {NAV_LINKS.map((link) =>
              link.kind === 'internal' ? (
                <li key={link.label}>
                  <Link
                    href={toRoute(link.href)}
                    className="text-sm font-medium no-underline transition-colors duration-150 hover:text-[#3e5b34]"
                    style={{ color: '#4a5247' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ) : (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm font-medium no-underline transition-colors duration-150 hover:text-[#3e5b34]"
                    style={{ color: '#4a5247' }}
                  >
                    {link.label}
                  </a>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <HomeNavAuthSlot />
        </div>
      </div>
    </header>
  );
}

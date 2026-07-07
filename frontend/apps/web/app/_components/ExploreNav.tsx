'use client';

import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { cn } from '@/app/_lib/cn';
import { DEFAULT_INFO_PATH, isInfoSection, type InfoPath } from '@/app/_lib/infoMenu';
import { useLastInfoPath } from '@/app/_lib/useLastInfoPath';

import { BrandMark } from './BrandMark';
import { NotificationBell } from './NotificationBell';
import { HomeNavAuthSlot } from './HomeNavAuthSlot';

type NavItem = {
  label: string;
  href: '/' | '/clubs' | '/facilities' | '/calendar' | InfoPath;
  /** 단일 prefix 로 판정할 수 없는 항목(정보)만 지정 — 있으면 기본 exact+prefix 규칙 대신 사용. */
  match?: (pathname: string) => boolean;
};

const NAV_ITEMS: readonly NavItem[] = [
  { label: '홈', href: '/' },
  { label: '탐색', href: '/clubs' },
  { label: '시설', href: '/facilities' },
  { label: '캘린더', href: '/calendar' },
  // 정보: /notices·/faq·/terms·/introduce 전체에서 활성, 이동은 마지막 방문 허브 경로(아래 참고).
  { label: '정보', href: DEFAULT_INFO_PATH, match: isInfoSection },
];

type Props = {
  /** pathname 대신 레이블로 강제 활성화할 때 사용. */
  active?: string;
  floating?: boolean;
  /** 하단 탭바가 같은 링크를 제공하는 라우트에서 true — 모바일 상단바를 슬림화하려 네비 링크를 md 미만에서 숨긴다. */
  slimOnMobile?: boolean;
};

export function ExploreNav({ active, floating = false, slimOnMobile = false }: Props) {
  const pathname = usePathname();
  const lastInfoPath = useLastInfoPath(pathname);

  // 동아리·공지 상세(/clubs/{id}, /notices/{id})는 자체 상단 액션바를 쓰는 포커스 뷰라 모바일에서 이 브랜드 바를 숨긴다.
  // 시설 상세(/facilities/{id})는 자체 액션바가 없는 유틸리티 뷰라 브랜드 바를 유지한다.
  const isDetailFocus = /^\/(clubs|notices)\/\d+$/.test(pathname);

  const isActive = (item: NavItem): boolean => {
    if (active) return item.label === active;
    if (item.match) return item.match(pathname);
    if (item.href === '/') return pathname === '/';
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  return (
    <header
      className={cn(
        floating ? 'absolute inset-x-0 top-0' : 'relative',
        'z-50 bg-cream/90 backdrop-blur border-b border-line',
        isDetailFocus && 'hidden md:block',
      )}
    >
      <nav className="max-w-layout mx-auto flex items-center gap-12 px-4 sm:px-6 md:px-10 py-3">
        <Link href="/" aria-label="두잉 홈" className="translate-y-[3px]">
          <BrandMark size={44} />
        </Link>

        <ul
          className={cn(
            'items-center gap-8 text-[13.5px] font-semibold',
            slimOnMobile ? 'hidden md:flex' : 'flex',
          )}
        >
          {NAV_ITEMS.map((item) => {
            const on = isActive(item);
            // match 가 있는 항목(정보)은 고정 href 대신 마지막 방문 허브 경로로 이동한다(getLastInfoPath 단일 정책).
            const linkHref = item.match ? lastInfoPath : item.href;
            return (
              <li key={item.label}>
                <Link
                  href={linkHref}
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

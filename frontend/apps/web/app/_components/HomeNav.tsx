import Link from 'next/link';
import { BrandMark } from '@/components/duing/BrandMark';
import { cn } from '@/app/_lib/cn';
import { HomeNavAdminLink } from './HomeNavAdminLink';
import { HomeNavAuthSlot } from './HomeNavAuthSlot';
import { NotificationBell } from './NotificationBell';

const inactiveLink = 'relative py-1 text-charcoal-3 hover:text-charcoal';
const activeLink = 'relative py-1 text-ink-deep';

// slimOnMobile: 모바일 상단바를 브랜드 + 알림 벨 + 유저메뉴/로그인 으로 슬림화하기 위해
// 네비 링크를 md 미만에서 숨긴다. 하단 탭바(BottomNav)가 같은 링크를 제공하거나, 자체 모바일
// 섹션 내비를 갖는 콘솔 라우트(예: /admin 의 햄버거 → Sheet 드로어)에서 true.
// 하단바·드로어가 모두 없는 라우트(/introduce·/me 등)에서는 기본값(false)으로 링크를 유지한다.
type Props = { slimOnMobile?: boolean };

export function HomeNav({ slimOnMobile = false }: Props) {
  return (
    <header className="relative z-50 border-b border-line bg-cream/90 backdrop-blur">
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

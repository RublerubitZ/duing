import Link from 'next/link';
import { BrandMark } from '@/components/duing/BrandMark';

const inactiveLink = 'relative py-1 text-charcoal-3 hover:text-charcoal';
const activeLink = 'relative py-1 text-ink-deep';

export function HomeNav() {
  return (
    <header className="border-b border-line bg-cream/90 backdrop-blur">
      <nav className="max-w-layout mx-auto flex items-center gap-12 px-10 py-4">
        <Link href="/" aria-label="두잉 홈">
          <BrandMark size={26} />
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
            <Link href="/introduce" className={inactiveLink}>
              서비스 소개
            </Link>
          </li>
        </ul>
        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/login"
            className="grid h-10 place-items-center rounded-full px-4 text-[13px] font-semibold text-charcoal-2 hover:bg-graysoft"
          >
            로그인
          </Link>
          <Link href="/signup" className="btn btn-primary btn-sm rounded-full px-4">
            가입하기
          </Link>
        </div>
      </nav>
    </header>
  );
}
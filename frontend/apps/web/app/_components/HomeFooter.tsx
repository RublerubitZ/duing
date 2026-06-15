import Link from 'next/link';
import { BrandMark } from '@/components/duing/BrandMark';

const linkClass = 'hover:text-ink';

export function HomeFooter() {
  return (
    <footer className="hidden mt-10 border-t border-line bg-cream-2 px-4 sm:px-6 md:px-10 py-14 md:block">
      <div className="max-w-layout mx-auto grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <BrandMark size={28} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-charcoal-2">
            대구대학교 학생자치회 공식 동아리 플랫폼.
            <br />
            탐색부터 운영까지, 두잉 하나로.
          </p>
        </div>

        <FooterColumn title="서비스">
          <li>
            <Link href="/clubs" className={linkClass}>
              동아리 탐색
            </Link>
          </li>
          <li>
            <Link href="/calendar" className={linkClass}>
              캘린더
            </Link>
          </li>
          <li>
            <Link href="/introduce" className={linkClass}>
              서비스 소개
            </Link>
          </li>
        </FooterColumn>

        <FooterColumn title="운영자">
          <li>
            <Link href="/manage" className={linkClass}>
              우리 동아리 등록
            </Link>
          </li>
          <li>
            <Link href="/introduce" className={linkClass}>
              운영자 가이드
            </Link>
          </li>
          <li>문의하기</li>
        </FooterColumn>

        <FooterColumn title="문의">
          <li>help@duing.daegu.ac.kr</li>
          <li>대구대 학생자치회</li>
        </FooterColumn>
      </div>
      <div className="max-w-layout mx-auto mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-xs text-charcoal-3">
        <div>© 2026 Duing · 대구대학교 학생자치회</div>
        <div className="flex gap-5">
          <span>이용약관</span>
          <span>개인정보 처리방침</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold tracking-wide06 text-ink-deep">{title}</div>
      <ul className="mt-4 flex flex-col gap-2.5 text-sm text-charcoal-2">{children}</ul>
    </div>
  );
}

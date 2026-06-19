import Link from 'next/link';
import { BrandMark } from '@/components/duing/BrandMark';

const linkClass = 'hover:text-ink';

export function HomeFooter() {
  return (
    <>
      {/* 모바일 간소 푸터 — 로고·태그라인 + 약관·문의·카피라이트 (데스크탑은 아래 풀 푸터) */}
      <footer className="border-t border-line bg-cream-2 px-4 py-8 md:hidden">
        <div className="max-w-layout mx-auto">
          <BrandMark size={26} />
          <p className="mt-3 text-[13px] leading-relaxed text-charcoal-2">
            탐색부터 운영까지, 두잉 하나로.
          </p>
          <div className="mt-5 border-t border-line pt-4 text-[12px] leading-relaxed text-charcoal-3">
            <div>이용약관 및 개인정보 처리방침</div>
            <div className="mt-1.5">
              문의사항 :{' '}
              <a href="mailto:duing.official@gmail.com" className="hover:text-ink">
                duing.official@gmail.com
              </a>
            </div>
            <div className="mt-3 text-charcoal-3/80">© DUING · All Rights Reserved</div>
          </div>
        </div>
      </footer>

      {/* 데스크탑 풀 푸터 */}
      <footer className="hidden mt-10 border-t border-line bg-cream-2 px-4 sm:px-6 md:px-10 py-14 md:block">
      <div className="max-w-layout mx-auto grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <BrandMark size={28} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-charcoal-2">
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
          <li>
            <a href="mailto:duing.official@gmail.com" className={linkClass}>
              duing.official@gmail.com
            </a>
          </li>
        </FooterColumn>
      </div>
      <div className="max-w-layout mx-auto mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-xs text-charcoal-3">
        <div>© DUING · All Rights Reserved</div>
        <div className="flex gap-5">
          <span>이용약관</span>
          <span>개인정보 처리방침</span>
        </div>
      </div>
      </footer>
    </>
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

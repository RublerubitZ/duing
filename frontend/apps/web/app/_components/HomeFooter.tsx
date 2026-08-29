import Link from 'next/link';
import { BrandMark } from '@/components/duing/BrandMark';

const linkClass = 'hover:text-ink';

export function HomeFooter() {
  return (
    <>
      {/* 모바일 간소 푸터 — 로고·태그라인 + 약관·문의·카피라이트 (데스크탑은 아래 풀 푸터) */}
      <footer className="bg-cream-2 px-4 py-8 md:hidden">
        <div className="max-w-layout mx-auto">
          <BrandMark size={26} />
          <p className="mt-3 text-[13px] leading-relaxed text-charcoal-2">
            탐색부터 운영까지, 두잉 하나로.
          </p>
          <div className="mt-5 pt-4 text-[12px] leading-relaxed text-charcoal-3">
            <Link href="/introduce" className="hover:text-ink">
              서비스 소개
            </Link>
            <div className="mt-1.5">
              <Link href="/terms" className="hover:text-ink">
                이용약관 및 개인정보 처리방침
              </Link>
            </div>
            <div className="mt-1.5">
              문의사항 :{' '}
              <a href="mailto:duing.official@gmail.com" className="hover:text-ink">
                duing.official@gmail.com
              </a>
            </div>
            <div className="mt-3 text-charcoal-3/80">© DUING · All Rights Reserved</div>
            {/* 토스페이스 라이선스가 요구하는 출처 표시 — 카테고리 픽토그램에 쓰인다. */}
            <div className="mt-1 text-charcoal-3/70">
              이 페이지에는 토스팀에서 제공한 토스페이스가 적용되어 있습니다.
            </div>
          </div>
        </div>
      </footer>

      {/* 데스크탑 풀 푸터 */}
      <footer className="hidden mt-10 bg-cream-2 px-4 sm:px-6 md:px-10 py-14 md:block">
      <div className="max-w-layout mx-auto grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          {/* 시안 푸터 로고 120×43(1920 캔버스) → 콘텐츠 폭 1200 기준 ×0.815 ≈ 35px. */}
          <BrandMark size={35} />
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
              일정
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
        </FooterColumn>

        <div>
          {/* 두잉팀(서비스 운영)과 총동연(FAQ·1:1 문의) 은 수신 주체가 다르므로 라벨로 명확히 구분한다.
              카카오 링크는 기존 '운영자' 컬럼에 있던 것을 이 섹션으로 이전(중복 노출 방지). */}
          <div className="text-xs font-bold tracking-wide06 text-ink-deep">두잉 서비스 문의</div>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm text-charcoal-2">
            <li>
              <a
                href="https://open.kakao.com/o/s6JruOzi"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                두잉팀 카카오 문의
              </a>
            </li>
            <li>
              <a href="mailto:duing.official@gmail.com" className={linkClass}>
                duing.official@gmail.com
              </a>
            </li>
          </ul>

          <div className="mt-6 text-xs font-bold tracking-wide06 text-ink-deep">총동연 문의</div>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm text-charcoal-2">
            <li>
              <Link href="/faq" className={linkClass}>
                자주 묻는 질문
              </Link>
            </li>
            <li>
              <Link href="/me/inquiries/new" className={linkClass}>
                1:1 문의
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-layout mx-auto mt-12 flex flex-wrap items-center justify-between gap-3 pt-6 text-xs text-charcoal-3">
        <div>
          <div>© DUING · All Rights Reserved</div>
          {/* 토스페이스 라이선스가 요구하는 출처 표시 — 카테고리 픽토그램에 쓰인다. */}
          <div className="mt-1">이 페이지에는 토스팀에서 제공한 토스페이스가 적용되어 있습니다.</div>
        </div>
        <div className="flex gap-5">
          <Link href="/terms#terms" className={linkClass}>
            이용약관
          </Link>
          <Link href="/terms#privacy" className={linkClass}>
            개인정보 처리방침
          </Link>
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

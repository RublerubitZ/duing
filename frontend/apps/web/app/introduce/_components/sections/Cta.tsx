import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';
import { SparkleFull } from '@/components/duing/Sparkle';
import { FadeIn } from '@/components/motion/FadeIn';

export function Cta() {
  return (
    <section className="bg-ink-deep px-4 py-24 text-center sm:px-6 md:px-10 md:py-28">
      <FadeIn>
        <div className="relative mx-auto max-w-[880px]">
          <SparkleFull
            size={36}
            color="#9DB6A0"
            className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-60"
            aria-hidden
          />
          <h2
            className="mb-3.5"
            style={{ fontSize: 'clamp(32px, 4.4vw, 50px)', color: '#F6F3EC' }}
          >
            동아리 운영을
            <br />더 쉽고 체계적으로
          </h2>
          <p className="mb-8 text-[16px] text-cream/70">
            이메일 인증으로 30초면 시작할 수 있어요.
            <br />
            지금 두잉에서 우리 동아리를 만나보세요.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={toRoute('/signup')}
              className="btn rounded-full bg-paper text-ink hover:bg-cream"
            >
              지금 시작하기
              <span aria-hidden>→</span>
            </Link>
            <Link
              href={toRoute('/clubs')}
              className="btn rounded-full border border-paper/30 bg-transparent text-paper hover:bg-paper/10"
            >
              동아리 둘러보기
            </Link>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}

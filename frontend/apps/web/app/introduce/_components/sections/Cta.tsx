import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';
import { SparkleFull } from '@/components/duing/Sparkle';
import { Reveal } from '../motion/Reveal';

export function Cta() {
  return (
    <section className="border-t border-line px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <Reveal scale={0.96} y={28} className="mx-auto max-w-[960px]">
        <div className="relative overflow-hidden rounded-xl bg-sage-mist px-7 py-14 text-center md:px-14 md:py-20">
          <SparkleFull size={44} className="absolute left-8 top-8 opacity-60" aria-hidden />
          <SparkleFull size={26} className="absolute bottom-8 right-10 opacity-40" aria-hidden />
          <h2 className="mb-4" style={{ fontSize: 'clamp(30px, 4.2vw, 48px)' }}>
            동아리 운영을
            <br />더 쉽고 체계적으로
          </h2>
          <p className="mx-auto mb-9 max-w-[440px] text-[16px] text-charcoal-2">
            이메일 인증으로 30초면 시작할 수 있어요. 지금 두잉에서 우리 동아리를 만나보세요.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={toRoute('/signup')} className="btn btn-primary btn-big rounded-full">
              지금 시작하기
              <span aria-hidden>→</span>
            </Link>
            <Link href={toRoute('/clubs')} className="btn btn-secondary btn-big rounded-full">
              동아리 둘러보기
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

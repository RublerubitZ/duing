import { Code } from 'lucide-react';
import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';
import { SparkleFull } from '@/components/duing/Sparkle';
import { CategoryIcon } from '../CategoryIcon';
import { HeroBackdrop } from '../motion/HeroBackdrop';
import { HeroParallax } from '../motion/HeroParallax';

/** 모집 공고 미니 카드 — 학생이 탐색에서 마주하는 모습. */
function RecruitCard() {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-charcoal-3">
          RECRUITING
        </span>
        <span className="pill pill-solid gap-1.5 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          모집중
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink"
          style={{ background: 'linear-gradient(135deg, #1F4A3622 0%, #1F4A3611 100%)' }}
        >
          <Code size={20} strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <div className="text-[15px] font-bold leading-tight text-ink-deep">두잉코드 26기 모집</div>
          <div className="mt-0.5 font-mono text-[11px] text-charcoal-3">지원자 24 · 마감 D-3</div>
        </div>
      </div>
    </div>
  );
}

/** 내 지원 현황 미니 카드 — 학생의 지원 여정. */
function StatusCard() {
  return (
    <div className="rounded-lg border border-line bg-paper p-3.5 shadow-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-charcoal-3">
          MY APPLICATION
        </span>
        <span className="pill gap-1.5 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          면접확정
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-berry"
          style={{ background: 'linear-gradient(135deg, #B6567222 0%, #B6567211 100%)' }}
        >
          <CategoryIcon cat="음악" size={18} />
        </span>
        <div>
          <div className="text-[14.5px] font-bold leading-tight text-ink-deep">트레몰로</div>
          <div className="mt-0.5 font-mono text-[11px] text-charcoal-3">면접 11.21 토 · 오후 1:30</div>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="bg-grid relative overflow-hidden">
      <HeroBackdrop />
      <div className="relative z-10 mx-auto grid max-w-layout items-center gap-10 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:px-10 md:pb-24 md:pt-16">
        {/* ── 텍스트 (은은한 패럴랙스) ── */}
        <HeroParallax y={[0, -16]} scale={[1, 1]}>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-[12.5px] font-medium text-ink">
            <span className="animate-pulse-ring h-[7px] w-[7px] shrink-0 rounded-full bg-sage" />
            대구대학교 동아리 플랫폼
          </div>

          <h1
            className="mb-5"
            style={{ fontSize: 'clamp(38px, 6vw, 66px)', lineHeight: 1.05, letterSpacing: '-0.035em' }}
          >
            동아리, 발견부터
            <br />
            운영까지 <em className="border-b-[3px] border-sage pb-1 not-italic">두잉</em>으로.
          </h1>

          <p className="mb-3 max-w-[480px] text-lg leading-[1.6] text-charcoal-2">
            관심 있는 동아리를 찾아 지원하고,
            <br />
            동아리 운영까지 한 곳에서.
          </p>
          <p className="mb-7 text-[15px] text-charcoal-3">
            대구대학교 학생도, 운영하는 회장단도 두잉 하나로.
          </p>

          <div className="mb-5 flex flex-wrap gap-3">
            <Link href={toRoute('/clubs')} className="btn btn-primary rounded-full">
              동아리 둘러보기
              <span aria-hidden>→</span>
            </Link>
            <Link href={toRoute('/signup')} className="btn btn-secondary rounded-full">
              우리 동아리 등록
            </Link>
          </div>

          <div className="inline-flex items-center gap-1.5 text-[12.5px] text-charcoal-3">
            <span className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full bg-ink text-[9px] font-bold text-paper">
              ✓
            </span>
            휴대폰 인증으로 30초 만에 가입
          </div>
        </HeroParallax>

        {/* ── 비주얼 콜라주 ── */}
        <HeroParallax className="relative">
          <SparkleFull
            size={40}
            className="absolute -left-2 -top-3 z-10 opacity-60 md:left-4"
            aria-hidden
          />
          <div className="relative mx-auto min-h-[300px] max-w-[420px] md:min-h-[420px]">
            <div
              className="animate-float-a md:absolute md:left-0 md:top-2 md:w-[86%]"
              style={{ transform: 'rotate(-2deg)' }}
            >
              <RecruitCard />
            </div>
            <div
              className="animate-float-b mt-4 md:absolute md:right-0 md:top-[210px] md:mt-0 md:w-[80%]"
              style={{ transform: 'rotate(2.5deg)' }}
            >
              <StatusCard />
            </div>
          </div>
        </HeroParallax>
      </div>
    </section>
  );
}

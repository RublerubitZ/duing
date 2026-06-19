import { FadeIn } from '@/components/motion/FadeIn';
import { SparkleFull } from '@/components/duing/Sparkle';
import { Stagger, StaggerItem } from '../motion/Stagger';

type FlowStep = { idx: string; label: string; sub: string };

const STEPS: ReadonlyArray<FlowStep> = [
  { idx: '01', label: '신입 모집', sub: '모집공고 등록' },
  { idx: '02', label: '지원 접수', sub: '지원서 · 임시저장' },
  { idx: '03', label: '공지 전달', sub: '전체 공지 · 일정' },
  { idx: '04', label: '회비 관리', sub: '청구 · 납부 · 매칭' },
  { idx: '05', label: '동아리 운영', sub: '멤버 · 권한' },
  { idx: '06', label: '활동 기록', sub: '통계 · 히스토리' },
];

const LAST = STEPS.length - 1;

export function Flow() {
  return (
    <section className="bg-ink-deep px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <div className="mx-auto max-w-layout">
        <FadeIn>
          <p className="mb-4 font-mono text-[11.5px] font-semibold uppercase tracking-[0.22em] text-sage">
            FLOW · 운영 흐름
          </p>
          <h2 className="mb-3 max-w-[760px]" style={{ fontSize: 'clamp(28px, 3.8vw, 44px)', color: '#F6F3EC' }}>
            모집부터 활동 기록까지,
            <br />
            끊김 없이 이어져요
          </h2>
          <p className="mb-14 max-w-[600px] text-[16px] text-cream/65">
            한 단계의 결과가 다음 단계로 그대로 흘러가요. 매 학기 운영이 두잉 안에 차곡차곡 쌓입니다.
          </p>
        </FadeIn>

        {/* 데스크탑 — 가로 흐름 */}
        <Stagger className="hidden grid-cols-6 md:grid" gap={0.08}>
          {STEPS.map((step, i) => (
            <StaggerItem key={step.idx} className="relative flex flex-col items-center px-2 text-center">
              {i < LAST && (
                <span className="absolute left-1/2 top-5 h-px w-full bg-paper/20" aria-hidden />
              )}
              <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border border-paper/25 bg-paper/10 font-mono text-[12px] font-bold text-sage backdrop-blur">
                {step.idx}
              </span>
              <div className="mt-4 text-[15px] font-bold" style={{ color: '#F6F3EC' }}>
                {step.label}
              </div>
              <div className="mt-1 font-mono text-[11px] text-cream/55">{step.sub}</div>
            </StaggerItem>
          ))}
        </Stagger>

        {/* 모바일 — 세로 흐름 */}
        <Stagger className="flex flex-col md:hidden" gap={0.08}>
          {STEPS.map((step, i) => (
            <StaggerItem key={step.idx} className="relative flex gap-4 pb-7 last:pb-0">
              {i < LAST && (
                <span className="absolute left-5 top-11 h-full w-px bg-paper/20" aria-hidden />
              )}
              <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-paper/25 bg-paper/10 font-mono text-[12px] font-bold text-sage">
                {step.idx}
              </span>
              <div className="pt-1.5">
                <div className="text-[15px] font-bold" style={{ color: '#F6F3EC' }}>
                  {step.label}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-cream/55">{step.sub}</div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <FadeIn delay={0.1}>
          <div className="mt-14 flex items-center justify-center gap-2 text-[14px] text-cream/70">
            <SparkleFull size={18} color="#9DB6A0" aria-hidden />
            흩어진 도구 없이, 두잉 하나로 이어지는 운영
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

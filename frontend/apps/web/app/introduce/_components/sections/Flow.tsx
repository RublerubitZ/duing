import { FadeIn } from '@/components/motion/FadeIn';
import { SparkleFull } from '@/components/duing/Sparkle';
import { Stagger, StaggerItem } from '../motion/Stagger';

type FlowStep = { idx: string; label: string; sub: string };

const STEPS: ReadonlyArray<FlowStep> = [
  { idx: '01', label: '동아리 탐색', sub: '관심사로 발견' },
  { idx: '02', label: '지원 접수', sub: '지원서 · 임시저장' },
  { idx: '03', label: '면접 · 합격', sub: '일정 자동 배정' },
  { idx: '04', label: '공지 · 일정', sub: '활동 안내' },
  { idx: '05', label: '회비 관리', sub: '청구 · 납부 · 매칭' },
  { idx: '06', label: '활동 기록', sub: '통계 · 히스토리' },
];

const LAST = STEPS.length - 1;

export function Flow() {
  return (
    <section className="bg-ink-deep py-20 md:py-28">
      <div className="mx-auto max-w-layout px-4 sm:px-6 md:px-10">
        <FadeIn>
          <p className="mb-4 tabular-nums text-[11.5px] font-semibold uppercase tracking-[0.22em] text-cream/70">
            FLOW · 사용 흐름
          </p>
          <h2 className="mb-3 max-w-[760px]" style={{ fontSize: 'clamp(28px, 3.8vw, 44px)', color: '#F6F3EC' }}>
            발견부터 활동 기록까지,
            <br />
            끊김 없이 이어져요
          </h2>
          <p className="mb-14 max-w-[600px] text-[16px] text-cream/65">
            한 단계의 결과가 다음 단계로 그대로 흘러가요. 학생의 탐색·지원도, 운영진의 관리도 두잉 안에서 이어집니다.
          </p>
        </FadeIn>

        {/* 데스크탑 — 가로 흐름. 노드 중심을 잇는 단일 트랙선을 뒤에 깔고 그 위에 노드를 올린다. */}
        <div className="relative hidden md:block">
          <span
            className="absolute top-5 h-px bg-paper/15"
            style={{ left: '8.333%', right: '8.333%' }}
            aria-hidden
          />
          <Stagger className="relative grid grid-cols-6" gap={0.08}>
            {STEPS.map((step) => (
              <StaggerItem key={step.idx} className="flex flex-col items-center px-2 text-center">
                <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border border-sage/40 bg-ink-deep tabular-nums text-[12px] font-bold text-cream">
                  {step.idx}
                </span>
                <div className="mt-4 text-[15px] font-bold" style={{ color: '#F6F3EC' }}>
                  {step.label}
                </div>
                <div className="mt-1 tabular-nums text-[11px] text-cream/55">{step.sub}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        {/* 모바일 — 세로 흐름. 커넥터는 현재 아이템 하단까지만 그어 다음 노드로 이어진다. */}
        <Stagger className="flex flex-col md:hidden" gap={0.08}>
          {STEPS.map((step, i) => (
            <StaggerItem key={step.idx} className="relative flex gap-4 pb-7 last:pb-0">
              {i < LAST && (
                <span className="absolute bottom-0 left-5 top-11 w-px bg-paper/15" aria-hidden />
              )}
              <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-sage/40 bg-ink-deep tabular-nums text-[12px] font-bold text-cream">
                {step.idx}
              </span>
              <div className="pt-1.5">
                <div className="text-[15px] font-bold" style={{ color: '#F6F3EC' }}>
                  {step.label}
                </div>
                <div className="mt-0.5 tabular-nums text-[11px] text-cream/55">{step.sub}</div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <FadeIn delay={0.1}>
          <div className="mt-14 flex items-center justify-center gap-2 text-[14px] text-cream/70">
            <SparkleFull size={18} color="#9DB6A0" aria-hidden />
            흩어진 도구 없이, 두잉 하나로 이어지는 경험
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

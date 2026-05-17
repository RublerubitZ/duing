import { SparkleFull } from '../Sparkle';

const STATS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '128', label: '등록 동아리' },
  { value: '67', label: '이번 학기 모집중' },
  { value: '4,200+', label: '두잉 회원' },
  { value: '12', label: '단과대학' },
];

export function Stats() {
  return (
    <section className="relative overflow-hidden bg-ink-deep px-10 py-12 text-white">
      <SparkleFull
        size={48}
        color="#9DB6A0"
        className="absolute left-[20%] top-8 opacity-40"
      />
      <SparkleFull
        size={36}
        color="#9DB6A0"
        className="absolute bottom-6 right-[18%] opacity-30"
      />
      <div className="max-w-layout mx-auto text-center">
        <div className="mb-6 text-xs font-bold tracking-wide16 text-sage">
          DUING · DAEGU UNIVERSITY · 2025-2학기
        </div>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <div
                className="font-display text-[72px] font-bold leading-none text-white tracking-tightx"
              >
                {stat.value}
              </div>
              <div className="mt-3 text-[13px] font-semibold tracking-wide04 text-white/55">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

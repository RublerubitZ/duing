import { SparkleFull } from '../../_components/Sparkle';
import { Icon } from './Icons';

export function MyPageHeader() {
  return (
    <section className="px-10 pt-11 pb-6">
      <div className="max-w-layout mx-auto">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-ink to-ink-deep text-white grid grid-cols-[auto_1fr_auto] gap-8 items-center px-10 py-8">
          <SparkleFull
            size={64}
            color="rgba(157,182,160,0.5)"
            className="absolute top-6 right-[200px] pointer-events-none"
          />
          <SparkleFull
            size={28}
            color="rgba(157,182,160,0.4)"
            className="absolute bottom-6 right-[350px] pointer-events-none"
          />

          <div className="w-[88px] h-[88px] rounded-[24px] bg-sage text-ink-deep grid place-items-center font-display text-[32px] font-bold shadow-2">
            도윤
          </div>

          <div>
            <div className="text-xs font-bold text-sage tracking-wide16 mb-1.5">MY DUING</div>
            <h1 className="text-[32px] text-white mb-2.5">
              안녕하세요, 김도윤님
              <SparkleFull
                size={20}
                color="var(--sage, #9DB6A0)"
                className="inline-block ml-2 align-middle"
              />
            </h1>
            <div className="flex gap-[18px] flex-wrap text-[13px] text-white/70">
              <span>📚 IT융합대학 · 컴퓨터공학과 2학년</span>
              <span>·</span>
              <span className="font-mono">2021123456</span>
              <span>·</span>
              <span>📨 2021123456@daegu.ac.kr</span>
            </div>
          </div>

          <div className="flex gap-6 items-center z-10">
            {([['3', '지원 중'], ['2', '가입'], ['8', '찜']] as const).map(([count, label]) => (
              <div key={label} className="text-center">
                <div className="font-display text-[32px] font-bold text-white">{count}</div>
                <div className="text-[11px] text-white/60 mt-0.5">{label}</div>
              </div>
            ))}
            <button
              type="button"
              className="ml-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-white/10 text-white border border-white/20 text-sm font-semibold hover:bg-white/20 transition"
            >
              <Icon.edit />
              프로필 편집
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

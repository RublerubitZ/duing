import { ArrowRight } from '@/components/duing/Icon';
import { SparkleFull } from '@/components/duing/Sparkle';

export function Cta() {
  return (
    <section
      className="relative overflow-hidden px-10 py-[120px] text-center text-white"
      style={{ background: 'linear-gradient(135deg, #1F4A36 0%, #143025 100%)' }}
    >
      <SparkleFull size={64} color="#9DB6A0" className="absolute left-[20%] top-[60px] opacity-40" />
      <SparkleFull size={48} color="#9DB6A0" className="absolute bottom-20 right-[16%] opacity-50" />
      <SparkleFull
        size={36}
        color="#9DB6A0"
        className="absolute right-[25%] top-[100px] opacity-30"
      />

      <div className="relative mx-auto max-w-[880px]">
        <h2 className="mb-7 text-[80px] leading-[0.98] tracking-[-0.03em] text-white">
          오늘부터 두잉,
          <br />
          같이 해볼래요?
        </h2>
        <p className="mx-auto mb-10 max-w-[540px] text-lg leading-[1.6] text-white/70">
          대구대학교 학생증 이메일로 30초 만에 가입.
          <br />
          이번 학기 67곳이 모집중이에요.
        </p>
        <div className="mb-6 flex justify-center gap-3">
          <button
            type="button"
            className="btn rounded-lg bg-sage px-9 py-[18px] text-base font-bold text-ink-deep"
          >
            두잉 시작하기
            <ArrowRight />
          </button>
          <button
            type="button"
            className="btn rounded-lg border px-7 py-[18px] text-base font-semibold text-white"
            style={{
              background: 'rgba(255,255,255,0.1)',
              borderColor: 'rgba(255,255,255,0.2)',
            }}
          >
            우리 동아리 등록하기
          </button>
        </div>
        <div className="text-[13px] text-white/45">
          이미 4,200명 이상의 대구대 학생들이 두잉을 사용 중이에요
        </div>
      </div>
    </section>
  );
}

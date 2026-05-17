import { BrandMark } from '../BrandMark';
import { ArrowRight, Lock } from '../Icon';
import { SparkleFull } from '../Sparkle';
import { promoClubs } from '../../_mocks';

export function Hero() {
  return (
    <section id="section-1" className="relative overflow-hidden px-10 py-20">
      <div
        className="absolute -right-[120px] -top-[100px] h-[480px] w-[480px] rounded-full opacity-70 blur-[10px]"
        style={{
          background: 'radial-gradient(circle, #C9D8CC 0%, #F6F3EC 70%)',
        }}
      />
      <div
        className="absolute -bottom-[160px] -left-[100px] h-[360px] w-[360px] rounded-full opacity-60"
        style={{
          background: 'radial-gradient(circle, #E8EEE8 0%, #F6F3EC 70%)',
        }}
      />

      <div className="max-w-layout relative mx-auto text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-sage-soft bg-paper px-4 py-2 text-[13px] font-semibold text-ink-deep">
          <span className="text-sm">🟢</span>
          대구대학교 학생자치회 공식 동아리 플랫폼
        </div>

        <h1 className="mx-auto mb-7 max-w-[1000px] text-[100px] font-bold leading-[0.96] tracking-[-0.04em]">
          대구대 동아리,
          <br />
          <span className="relative inline-block">
            <span className="text-ink">두잉</span>
            <SparkleFull
              size={56}
              color="#9DB6A0"
              className="absolute -right-16 -top-2.5"
            />
          </span>{' '}
          하나로.
        </h1>

        <p className="mx-auto mb-10 max-w-[640px] text-xl leading-[1.55] text-charcoal-2">
          탐색부터 지원, 동아리 운영까지.
          <br />
          대구대학교 모든 동아리를 한곳에서 만나요.
        </p>

        <div className="mb-4 flex justify-center gap-3">
          <button type="button" className="btn btn-primary btn-big rounded-lg">
            동아리 둘러보기
            <ArrowRight />
          </button>
          <button type="button" className="btn btn-secondary btn-big rounded-lg">
            우리 동아리 등록하기
          </button>
        </div>
        <div className="text-[13px] text-charcoal-3">
          대구대 학생증 이메일로 30초 만에 가입
        </div>

        <div className="relative mx-auto mt-16 max-w-[1100px]">
          <div
            className="rounded-[28px] px-5 pt-5 shadow-3"
            style={{
              background: 'linear-gradient(180deg, #1F4A36 0%, #143025 100%)',
            }}
          >
            <div className="flex items-center gap-2.5 pb-4">
              <div className="flex gap-1.5">
                <span className="h-[11px] w-[11px] rounded-full bg-white/20" />
                <span className="h-[11px] w-[11px] rounded-full bg-white/20" />
                <span className="h-[11px] w-[11px] rounded-full bg-white/20" />
              </div>
              <div className="ml-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 font-mono text-xs text-white/70">
                <Lock size={12} color="#9DB6A0" className="text-sage" />
                duing.daegu.ac.kr
              </div>
            </div>

            <div className="min-h-[360px] rounded-t-xl bg-cream p-6 text-left">
              <div className="mb-6 flex items-center gap-6">
                <BrandMark size={20} />
                <div className="flex gap-[18px] text-xs text-charcoal-3">
                  <span className="font-bold text-ink-deep">탐색</span>
                  <span>캘린더</span>
                  <span>공지</span>
                </div>
              </div>
              <h3 className="mb-3 text-[32px] leading-none">관심사로 시작해요</h3>
              <div className="grid grid-cols-4 gap-2.5">
                {promoClubs.slice(0, 4).map((club) => (
                  <div
                    key={club.id}
                    className="rounded-[10px] border border-line bg-paper p-2.5"
                  >
                    <div
                      className="grid h-20 place-items-center rounded-md text-[28px]"
                      style={{
                        background: `linear-gradient(135deg, ${club.color}22, ${club.color}11)`,
                      }}
                    >
                      {club.avatar}
                    </div>
                    <div className="mt-2">
                      <div className="text-[9px] font-bold text-charcoal-3">{club.cat}</div>
                      <div className="mt-px text-[11px] font-bold text-ink-deep">
                        {club.name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className="absolute -left-[60px] top-20 rounded-[14px] border border-line bg-paper px-[18px] py-3.5 shadow-3"
            style={{ transform: 'rotate(-4deg)' }}
          >
            <div className="mb-1 text-[11px] text-charcoal-3">지원 완료!</div>
            <div className="flex items-center gap-2">
              <span className="text-[22px]">🎸</span>
              <span className="text-sm font-bold text-ink-deep">트레몰로</span>
            </div>
          </div>

          <div
            className="absolute -right-[50px] top-[60px] flex items-center gap-2 rounded-[14px] bg-ink px-4 py-3 text-white shadow-3"
            style={{ transform: 'rotate(5deg)' }}
          >
            <SparkleFull size={20} color="#9DB6A0" />
            <div>
              <div className="text-[11px] text-sage">면접 확정</div>
              <div className="text-[13px] font-bold">9.21 (토) 13:30</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
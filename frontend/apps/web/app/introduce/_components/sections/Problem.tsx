type PainPoint = { emoji: string; title: string; desc: string };

const PAIN_POINTS: ReadonlyArray<PainPoint> = [
  {
    emoji: '🔍',
    title: '"어디 동아리가 있는지 모르겠어요"',
    desc: '에브리타임, 인스타그램, 학과 카톡방… 정보가 여기저기 흩어져 있어요.',
  },
  {
    emoji: '📅',
    title: '"모집 시기를 놓쳤어요"',
    desc: '공고가 올라온지도 모르고 지나가 버린 적이 한두 번이 아니에요.',
  },
  {
    emoji: '📋',
    title: '"지원 절차가 동아리마다 달라요"',
    desc: '구글폼, 인스타 DM, 카톡, 직접 방문… 매번 새로 알아봐야 해요.',
  },
];

export function Problem() {
  return (
    <section className="px-8 py-24" style={{ borderTop: '1px solid #e6e1d2' }}>
      <div className="mx-auto max-w-[1180px]">
        <p
          className="mb-[18px] font-mono text-[11.5px] font-semibold uppercase"
          style={{ letterSpacing: '.22em', color: '#3e5b34' }}
        >
          PROBLEM · 이런 적 있죠?
        </p>
        <h2
          className="mb-[18px] max-w-[760px] font-bold leading-[1.12]"
          style={{ fontSize: 'clamp(32px, 4vw, 44px)', letterSpacing: '-0.025em', color: '#2c4124' }}
        >
          동아리 정보, 찾아다니기
          <br />
          너무 번거롭지 않아요?
        </h2>

        <div className="mb-12 grid gap-[18px] md:grid-cols-3">
          {PAIN_POINTS.map((point) => (
            <div
              key={point.title}
              className="rounded-[14px] border p-[26px]"
              style={{
                background: '#ffffff',
                borderColor: '#d9d4c3',
                boxShadow: '0 1px 0 rgba(47,58,46,.04), 0 1px 3px rgba(47,58,46,.05)',
              }}
            >
              <div
                className="mb-[14px] flex h-11 w-11 items-center justify-center rounded-[12px] text-xl"
                style={{ background: '#e7ebd9' }}
              >
                {point.emoji}
              </div>
              <h3 className="mb-2 text-[16px] font-bold" style={{ color: '#2c4124' }}>
                {point.title}
              </h3>
              <p className="m-0 text-[13.5px] leading-[1.6]" style={{ color: '#4a5247' }}>
                {point.desc}
              </p>
            </div>
          ))}
        </div>

        <p
          className="text-center text-[32px] font-bold"
          style={{ letterSpacing: '-0.02em', color: '#2c4124' }}
        >
          그래서 두잉이 모았어요.
        </p>
      </div>
    </section>
  );
}

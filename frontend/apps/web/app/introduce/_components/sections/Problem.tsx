const PAIN_POINTS: ReadonlyArray<{ emoji: string; question: string; answer: string }> = [
  {
    emoji: '🔍',
    question: '어디 동아리가 있는지 모르겠어요',
    answer: '에브리타임, 인스타그램, 학과 카톡방… 정보가 여기저기 흩어져 있어요',
  },
  {
    emoji: '📅',
    question: '모집 시기를 놓쳤어요',
    answer: '공고가 올라온지도 모르고 지나가 버린 적이 한두 번이 아니에요',
  },
  {
    emoji: '📋',
    question: '지원 절차가 동아리마다 달라요',
    answer: '구글폼, 인스타 DM, 카톡, 직접 방문… 매번 새로 알아봐야 해요',
  },
];

export function Problem() {
  return (
    <section className="px-10 pt-[120px] pb-20">
      <div className="mx-auto max-w-[1100px] text-center">
        <div className="mb-4 text-[13px] font-bold tracking-wide16 text-ink">
          PROBLEM · 이런 적 있죠?
        </div>
        <h2 className="mb-14 text-[56px] leading-[1.1]">
          동아리 정보,
          <br />
          <span className="text-charcoal-3">찾아다니기 너무 번거롭지 않아요?</span>
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {PAIN_POINTS.map((point) => (
            <div
              key={point.question}
              className="rounded-xl border border-line bg-paper p-8 text-left"
            >
              <div className="mb-5 text-[40px]">{point.emoji}</div>
              <h3 className="mb-2.5 text-[19px] font-body text-ink-deep">
                &ldquo;{point.question}&rdquo;
              </h3>
              <p className="text-sm leading-[1.6] text-charcoal-2">{point.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

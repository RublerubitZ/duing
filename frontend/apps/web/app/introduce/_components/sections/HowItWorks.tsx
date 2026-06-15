const STEPS: ReadonlyArray<{ number: string; title: string; description: string }> = [
  { number: '01', title: '대구대 학생증 이메일로 가입', description: '@daegu.ac.kr 인증 한 번이면 끝' },
  { number: '02', title: '관심 동아리 둘러보기', description: '카테고리·요일·인원 필터로 빠르게' },
  { number: '03', title: '지원서 작성 후 제출', description: '임시 저장돼서 천천히 작성해도 OK' },
  { number: '04', title: '면접 일정·합격 알림 받기', description: '카톡·이메일로 자동 알림 발송' },
];

export function HowItWorks() {
  return (
    <section id="section-3" className="bg-cream-2 px-4 sm:px-6 md:px-10 pb-[120px] pt-20">
      <div className="max-w-layout mx-auto">
        <div className="mb-14 text-center">
          <div className="mb-3.5 text-[13px] font-bold tracking-wide16 text-ink">
            HOW IT WORKS · 이렇게 써요
          </div>
          <h2 className="text-[48px] leading-[1.1]">30초 가입, 한 학기 동아리 생활</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="relative min-h-[220px] rounded-lg border border-line bg-paper p-7"
            >
              <div className="font-display text-[56px] font-bold leading-none text-sage opacity-70">
                {step.number}
              </div>
              <h3 className="mb-2 mt-8 font-body text-[17px] font-bold leading-[1.3] text-ink-deep">
                {step.title}
              </h3>
              <p className="text-[13px] leading-[1.55] text-charcoal-2">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

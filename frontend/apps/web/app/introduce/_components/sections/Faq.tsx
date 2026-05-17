type FaqItem = {
  question: string;
  answer: string;
};

const FAQ_ITEMS: ReadonlyArray<FaqItem> = [
  {
    question: '두잉은 누구나 가입할 수 있나요?',
    answer:
      '대구대학교 재학생 · 휴학생 누구나 가입할 수 있어요. @daegu.ac.kr 이메일로 인증해주세요.',
  },
  {
    question: '동아리 운영자는 어떻게 등록하나요?',
    answer:
      '회장단이 동아리 등록 신청서를 작성하면, 학생자치회 검토 후 2영업일 내 승인됩니다.',
  },
  {
    question: '지원 비용이 드나요?',
    answer: '두잉은 무료예요. 단, 동아리 회비는 동아리별로 다르게 책정됩니다.',
  },
  {
    question: '다른 학교 학생도 쓸 수 있나요?',
    answer: '현재는 대구대학교 학생만 가입 가능해요. 다른 학교 확장은 검토 중입니다.',
  },
  {
    question: '지원서 작성 도중에 꺼져도 괜찮나요?',
    answer:
      '자동 임시 저장되니까 걱정 마세요. 작성한 내용은 마이페이지에서 이어서 작성할 수 있어요.',
  },
];

export function Faq() {
  return (
    <section className="bg-cream-2 px-10 pb-[120px] pt-20">
      <div className="mx-auto max-w-[880px]">
        <div className="mb-12 text-center">
          <div className="mb-3.5 text-[13px] font-bold tracking-wide16 text-ink">
            FAQ · 자주 묻는 질문
          </div>
          <h2 className="text-[44px] leading-[1.1]">궁금한 거 있으세요?</h2>
        </div>
        <div className="flex flex-col gap-2.5">
          {FAQ_ITEMS.map((item, idx) => (
            <details
              key={item.question}
              open={idx === 0}
              className="group overflow-hidden rounded-md border border-line bg-paper px-6 py-[18px]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between font-body text-base font-bold text-ink-deep">
                <span className="flex items-center gap-3.5">
                  <span className="font-mono text-xs font-semibold tracking-wide04 text-sage">
                    Q.{String(idx + 1).padStart(2, '0')}
                  </span>
                  {item.question}
                </span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-graysoft text-sm font-bold text-charcoal-2 group-open:bg-ink group-open:text-white">
                  <span className="hidden group-open:inline">−</span>
                  <span className="group-open:hidden">+</span>
                </span>
              </summary>
              <p className="mt-3.5 border-t border-dashed border-line pt-3.5 text-sm leading-[1.7] text-charcoal-2">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

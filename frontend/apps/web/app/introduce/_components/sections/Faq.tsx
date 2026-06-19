type FaqItem = { question: string; answer: string };

const FAQ_ITEMS: ReadonlyArray<FaqItem> = [
  {
    question: '두잉은 누구나 가입할 수 있나요?',
    answer: '대구대학교 재학생 · 휴학생 누구나 가입할 수 있어요. @daegu.ac.kr 이메일로 인증해주세요.',
  },
  {
    question: '동아리 운영자는 어떻게 등록하나요?',
    answer: '회장단이 동아리 등록 신청서를 작성하면, 운영자 검토 후 승인됩니다.',
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
    answer: '자동 임시 저장되니까 걱정 마세요. 작성한 내용은 마이페이지에서 이어서 작성할 수 있어요.',
  },
];

export function Faq() {
  return (
    <section
      id="faq"
      className="px-8 py-24"
      style={{ borderTop: '1px solid #e6e1d2' }}
    >
      <div className="mx-auto max-w-[880px]">
        <p
          className="mb-[18px] font-mono text-[11.5px] font-semibold uppercase"
          style={{ letterSpacing: '.22em', color: '#3e5b34' }}
        >
          FAQ · 자주 묻는 질문
        </p>
        <h2
          className="mb-5 font-bold leading-[1.12]"
          style={{ fontSize: 'clamp(32px, 4vw, 44px)', letterSpacing: '-0.025em', color: '#2c4124' }}
        >
          궁금한 거 있으세요?
        </h2>

        <div className="mt-5 flex flex-col gap-3">
          {FAQ_ITEMS.map((item, idx) => (
            <details
              key={item.question}
              open={idx === 0}
              className="group rounded-[14px] border px-[22px] py-[18px] transition-shadow hover:shadow-md"
              style={{
                background: '#ffffff',
                borderColor: '#d9d4c3',
                boxShadow: '0 1px 0 rgba(47,58,46,.04), 0 1px 3px rgba(47,58,46,.05)',
              }}
            >
              <summary className="flex cursor-pointer list-none items-center gap-[14px]">
                <span
                  className="shrink-0 font-mono text-[12px] font-semibold"
                  style={{ letterSpacing: '.12em', color: '#3e5b34' }}
                >
                  Q.{String(idx + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 text-[15px] font-bold" style={{ color: '#2c4124' }}>
                  {item.question}
                </span>
                {/* Toggle button: shows + when closed, − when open */}
                <span
                  className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors group-open:bg-[#3e5b34]"
                  style={{ background: '#2c4124', color: '#f6f1dd' }}
                  aria-hidden="true"
                >
                  {/* Horizontal bar (always visible) */}
                  <span
                    className="absolute h-[2px] w-[11px] rounded-[2px] transition-opacity group-open:opacity-0"
                    style={{ background: '#f6f1dd' }}
                  />
                  {/* Vertical bar (hides when open) */}
                  <span
                    className="absolute h-[11px] w-[2px] rounded-[2px] transition-transform group-open:rotate-90 group-open:opacity-0"
                    style={{ background: '#f6f1dd' }}
                  />
                </span>
              </summary>
              <div
                className="mt-[14px] border-t border-dashed pt-[14px] text-[14px] leading-[1.65]"
                style={{ borderColor: '#d9d4c3', color: '#4a5247' }}
              >
                {item.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

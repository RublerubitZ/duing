'use client';

import type { ClubFaq } from '@duing/types';

const cardInputCls =
  'w-full border border-line bg-white rounded-[8px] px-3 py-2 text-[14px] text-ink-deep placeholder:text-charcoal-3 focus:outline-none focus:border-ink focus:ring-[3px] focus:ring-ink/15 transition-[border-color,box-shadow]';

const deleteBtnCls =
  'px-2 py-1 rounded-[6px] text-[12.5px] text-charcoal-3 hover:text-danger hover:bg-danger/5 cursor-pointer transition-colors bg-transparent border-none';

type FaqsRepeaterProps = {
  value: ClubFaq[];
  onChange: (next: ClubFaq[]) => void;
  readOnly?: boolean;
  maxFaqs?: number;
};

export function FaqsRepeater({
  value, onChange, readOnly = false, maxFaqs = 20,
}: FaqsRepeaterProps) {
  function update(idx: number, patch: Partial<ClubFaq>) {
    onChange(value.map((faq, i) => (i === idx ? { ...faq, ...patch } : faq)));
  }

  function add() {
    if (value.length >= maxFaqs) return;
    onChange([...value, { question: '', answer: '', order: value.length }]);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx).map((faq, i) => ({ ...faq, order: i })));
  }

  return (
    <div className="space-y-2">
      {value.map((faq, idx) => (
        <div
          key={idx}
          className="rounded-[12px] border border-line bg-white p-3.5"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-2 shrink-0 tabular-nums text-[14px] font-extrabold text-ink">Q</span>
            <input
              type="text"
              value={faq.question}
              onChange={(event) => update(idx, { question: event.target.value })}
              placeholder="질문"
              disabled={readOnly}
              className={`${cardInputCls} font-semibold`}
            />
          </div>
          <div className="mt-2 flex items-start gap-2.5">
            <span className="mt-2 shrink-0 tabular-nums text-[14px] font-extrabold text-warm-deep">A</span>
            <textarea
              value={faq.answer}
              onChange={(event) => update(idx, { answer: event.target.value })}
              placeholder="답변"
              disabled={readOnly}
              rows={3}
              className={`${cardInputCls} resize-y`}
              style={{ minHeight: '72px' }}
            />
          </div>
          {!readOnly && (
            <div className="mt-1 flex justify-end">
              <button type="button" onClick={() => remove(idx)} className={deleteBtnCls}>
                삭제
              </button>
            </div>
          )}
        </div>
      ))}

      {!readOnly && value.length < maxFaqs && (
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 mt-1 bg-transparent border-none text-[13px] font-medium text-ink hover:underline cursor-pointer px-0 py-1"
        >
          + FAQ 추가
        </button>
      )}
    </div>
  );
}

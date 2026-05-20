'use client';

import type { ClubFaq } from '@duing/types';

const cardInputCls =
  'w-full border border-[#cfcab8] bg-white rounded-[8px] px-3 py-2 text-[14px] text-[#2a2f27] placeholder:text-[#b8b8ac] focus:outline-none focus:border-[#4a6b3f] focus:shadow-[0_0_0_3px_rgba(74,107,63,0.15)] transition-[border-color,box-shadow]';

const deleteBtnCls =
  'px-2 py-1 rounded-[6px] text-[12.5px] text-[#8a8f83] hover:text-[#b35a3a] hover:bg-[rgba(179,90,58,0.06)] cursor-pointer transition-colors bg-transparent border-none';

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
          className="border border-[#e6e1d2] bg-[#faf7ee] rounded-[8px] p-3"
        >
          <input
            type="text"
            value={faq.question}
            onChange={(event) => update(idx, { question: event.target.value })}
            placeholder="질문"
            disabled={readOnly}
            className={`${cardInputCls} mb-2`}
          />
          <textarea
            value={faq.answer}
            onChange={(event) => update(idx, { answer: event.target.value })}
            placeholder="답변"
            disabled={readOnly}
            rows={3}
            className={`${cardInputCls} resize-y`}
            style={{ minHeight: '72px' }}
          />
          {!readOnly && (
            <div className="flex justify-end mt-1">
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
          className="inline-flex items-center gap-1.5 mt-1 bg-transparent border-none text-[13px] font-medium text-[#3e5b34] hover:text-[#4a6b3f] hover:underline cursor-pointer px-0 py-1"
        >
          + FAQ 추가
        </button>
      )}
    </div>
  );
}

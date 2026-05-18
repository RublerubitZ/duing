'use client';

import type { ClubFaq } from '@duing/types';

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
    // 삭제 후 order 재정렬 (0..N-1).
    onChange(value.filter((_, i) => i !== idx).map((faq, i) => ({ ...faq, order: i })));
  }

  return (
    <div className="space-y-3">
      {value.map((faq, idx) => (
        <div key={idx} className="space-y-2 rounded-md border border-slate-200 p-3">
          <input
            type="text"
            value={faq.question}
            onChange={(e) => update(idx, { question: e.target.value })}
            placeholder="질문"
            disabled={readOnly}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <textarea
            value={faq.answer}
            onChange={(e) => update(idx, { answer: e.target.value })}
            placeholder="답변"
            disabled={readOnly}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-sm text-slate-500 hover:text-rose-600"
            >
              삭제
            </button>
          )}
        </div>
      ))}
      {!readOnly && value.length < maxFaqs && (
        <button
          type="button"
          onClick={add}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          + FAQ 추가
        </button>
      )}
    </div>
  );
}

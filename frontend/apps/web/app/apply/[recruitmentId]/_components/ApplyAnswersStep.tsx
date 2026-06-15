'use client';

import type { DraftAnswer } from '@duing/types';

type Props = {
  questions: string[];
  answers: DraftAnswer[];
  onChange: (next: DraftAnswer[]) => void;
  disabled?: boolean;
};

export function ApplyAnswersStep({ questions, answers, onChange, disabled = false }: Props) {
  function updateAnswer(index: number, value: string) {
    const next = answers.slice();
    next[index] = { questionId: index, value };
    onChange(next);
  }

  if (questions.length === 0) {
    return (
      <p className="text-sm text-charcoal-3">
        이 모집은 별도 질문이 없습니다. 제출 버튼을 눌러 지원할 수 있습니다.
      </p>
    );
  }

  return (
    <div className="space-y-7">
      {questions.map((question, idx) => (
        <div key={idx} className="space-y-2.5">
          <label
            htmlFor={`q${idx + 1}`}
            className="block text-sm font-semibold tracking-body text-charcoal"
          >
            <span className="mr-1.5 font-mono font-semibold text-ink">{idx + 1}.</span>
            {question}
          </label>
          <textarea
            id={`q${idx + 1}`}
            required
            disabled={disabled}
            value={answers[idx]?.value ?? ''}
            onChange={(event) => updateAnswer(idx, event.target.value)}
            className="w-full resize-y rounded-[12px] border border-[#cfcab8] bg-white px-4 py-3.5 text-sm leading-[1.55] text-charcoal shadow-[0_1px_0_rgba(47,58,46,0.04),_0_1px_2px_rgba(47,58,46,0.05)] transition-[border-color,box-shadow] placeholder:text-[#b8b8ac] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/[.15] disabled:bg-[#f5f3ef] disabled:text-charcoal-3"
            style={{ minHeight: '180px' }}
          />
        </div>
      ))}
    </div>
  );
}

'use client';

import type { ApplicantDetail } from '@duing/types';

type Props = {
  answers: ApplicantDetail['answers'];
};

export function ApplicantAnswersPanel({ answers }: Props) {
  if (answers.length === 0) {
    return (
      <section className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        응답이 없습니다.
      </section>
    );
  }

  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">응답</h2>
      <div className="flex flex-col gap-4">
        {answers.map((pair, index) => (
          <div key={pair.question}>
            <p className="text-sm font-medium text-neutral-700">
              Q{index + 1}. {pair.question}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
              {pair.answer || '—'}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

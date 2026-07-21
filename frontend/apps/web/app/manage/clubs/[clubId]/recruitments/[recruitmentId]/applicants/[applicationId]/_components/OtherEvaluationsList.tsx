'use client';

import { formatDateTimeKst } from '@duing/hooks';
import type { ApplicationEvaluation } from '@duing/types';

type Props = {
  evaluations: ApplicationEvaluation[];
};

export function OtherEvaluationsList({ evaluations }: Props) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-neutral-700">다른 운영진 평가</h3>
      {evaluations.length === 0 ? (
        <p className="text-sm text-neutral-400">다른 운영진의 평가가 아직 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {evaluations.map((evaluation) => (
            <li
              key={evaluation.evaluatorId}
              className="rounded border border-neutral-200 bg-white p-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{evaluation.evaluatorName}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                  {evaluation.score} / 5
                </span>
                <span className="ml-auto text-xs text-neutral-500">
                  {formatDateTimeKst(evaluation.updatedAt)}
                </span>
              </div>
              {evaluation.memo && (
                <p className="mt-2 whitespace-pre-wrap text-neutral-700">{evaluation.memo}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

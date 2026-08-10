'use client';

import { formatDateTimeKst } from '@duing/hooks';
import type { ApplicationEvaluation } from '@duing/types';

type Props = {
  evaluations: ApplicationEvaluation[];
};

export function OtherEvaluationsList({ evaluations }: Props) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-charcoal-2">다른 운영진 평가</h3>
      {evaluations.length === 0 ? (
        <p className="text-sm text-charcoal-3">다른 운영진의 평가가 아직 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {evaluations.map((evaluation) => (
            <li key={evaluation.evaluatorId} className="card p-3 text-sm">
              <div className="flex items-center gap-2">
                {/* 이름만 줄여 점수 배지·날짜를 지킨다 — min-w-0 없이는 truncate 가 동작하지 않는다. */}
                <span className="min-w-0 truncate font-medium text-charcoal">
                  {evaluation.evaluatorName}
                </span>
                <span className="pill pill-outline shrink-0 px-2 py-0.5 text-[11px]">
                  {evaluation.score} / 5
                </span>
                <span className="ml-auto shrink-0 text-xs text-charcoal-3">
                  {formatDateTimeKst(evaluation.updatedAt)}
                </span>
              </div>
              {evaluation.memo && (
                <p className="mt-2 whitespace-pre-wrap break-words text-charcoal-2">
                  {evaluation.memo}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

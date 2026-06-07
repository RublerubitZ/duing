'use client';

import { useState } from 'react';
import {
  useDeleteMyApplicationEvaluationMutation,
  useUpsertMyApplicationEvaluationMutation,
} from '@duing/hooks';
import type { ApplicationEvaluation } from '@duing/types';

type Props = {
  applicationId: number;
  myEvaluation: ApplicationEvaluation | null;
};

export function MyEvaluationCard({ applicationId, myEvaluation }: Props) {
  const [isEditing, setIsEditing] = useState(myEvaluation === null);
  const [score, setScore] = useState<number>(myEvaluation?.score ?? 3);
  const [memo, setMemo] = useState(myEvaluation?.memo ?? '');

  const upsertMutation = useUpsertMyApplicationEvaluationMutation();
  const deleteMutation = useDeleteMyApplicationEvaluationMutation();

  const handleSave = async () => {
    await upsertMutation.mutateAsync({
      applicationId,
      payload: { score, memo: memo.trim() || null },
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm('내 평가를 삭제할까요?')) return;
    await deleteMutation.mutateAsync(applicationId);
    setScore(3);
    setMemo('');
    setIsEditing(true);
  };

  if (!isEditing && myEvaluation) {
    return (
      <section className="rounded border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">내 평가</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700">
            {myEvaluation.score} / 5
          </span>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="ml-auto text-xs text-blue-600 hover:underline"
          >
            수정
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs text-rose-600 hover:underline"
          >
            삭제
          </button>
        </div>
        {myEvaluation.memo && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{myEvaluation.memo}</p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded border border-blue-200 bg-blue-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">내 평가</h3>
      <fieldset className="border-0 p-0">
        <legend className="sr-only">점수</legend>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-600" aria-hidden="true">점수</span>
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <label key={n} className="flex items-center gap-1 text-sm text-slate-700">
              <input
                type="radio"
                name={`score-${applicationId}`}
                value={n}
                checked={score === n}
                onChange={() => setScore(n)}
              />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
      <textarea
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="강점, 약점, 협업 경험, 추가 검증 필요 사항 등"
        className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        rows={4}
        maxLength={2000}
      />
      <p className="mt-1 text-xs text-neutral-500">
        메모는 평가 근거 작성에 사용됩니다. 지원자에게는 공개되지 않습니다.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={upsertMutation.isPending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          저장
        </button>
        {myEvaluation && (
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-neutral-50"
          >
            취소
          </button>
        )}
      </div>
    </section>
  );
}

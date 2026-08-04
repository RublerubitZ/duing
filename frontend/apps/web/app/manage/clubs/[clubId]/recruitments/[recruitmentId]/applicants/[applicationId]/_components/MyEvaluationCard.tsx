'use client';

import { useState } from 'react';
import {
  useDeleteMyApplicationEvaluationMutation,
  useUpsertMyApplicationEvaluationMutation,
} from '@duing/hooks';
import type { ApplicationEvaluation } from '@duing/types';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { CLOSED_EVALUATION_NOTICE, toWriteFailureMessage } from './closedRecruitment';

type Props = {
  applicationId: number;
  myEvaluation: ApplicationEvaluation | null;
  /** 마감(raw CLOSED) 모집이면 조회 전용 — 입력·저장을 막고 수정·삭제 버튼은 감춘다 (스펙 §1-3·§6). */
  readOnly?: boolean;
};

export function MyEvaluationCard({ applicationId, myEvaluation, readOnly = false }: Props) {
  const [isEditing, setIsEditing] = useState(myEvaluation === null);
  const [score, setScore] = useState<number>(myEvaluation?.score ?? 3);
  const [memo, setMemo] = useState(myEvaluation?.memo ?? '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const upsertMutation = useUpsertMyApplicationEvaluationMutation();
  const deleteMutation = useDeleteMyApplicationEvaluationMutation();
  const { addToast } = useToast();

  const handleSave = async () => {
    try {
      await upsertMutation.mutateAsync({
        applicationId,
        payload: { score, memo: memo.trim() || null },
      });
      setIsEditing(false);
    } catch (error) {
      // 실패하면 편집 상태와 입력값을 그대로 둔다 — 화면이 열린 뒤 모집이 마감된 창(lazy-close)에서
      // 작성 중이던 평가가 사라지지 않게 한다. 잡지 않으면 unhandled rejection 이 된다.
      addToast(toWriteFailureMessage(error, '평가 저장에 실패했습니다.'), { variant: 'error' });
    }
  };

  const confirmDelete = async () => {
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(applicationId);
      setShowDeleteConfirm(false);
      setScore(3);
      setMemo('');
      setIsEditing(true);
    } catch (error) {
      // 실패해도 닫지 않고 모달 안에서 안내한다(공통 규칙). 잡지 않으면 unhandled rejection 이 된다.
      setDeleteError(toWriteFailureMessage(error, '평가 삭제에 실패했습니다.'));
    }
  };

  if (!isEditing && myEvaluation) {
    return (
      <section className="rounded border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">내 평가</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700">
            {myEvaluation.score} / 5
          </span>
          {/* 읽기 전용이면 폼이 전부 비활성이라 수정 버튼은 죽은 어포던스 — 삭제와 함께 감춘다. */}
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="ml-auto text-xs text-blue-600 hover:underline"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs text-rose-600 hover:underline"
              >
                삭제
              </button>
            </>
          )}
        </div>
        {myEvaluation.memo && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{myEvaluation.memo}</p>
        )}

        <ConfirmDialog
          open={showDeleteConfirm}
          title="내 평가를 삭제할까요?"
          description="삭제하면 작성한 점수와 메모가 사라집니다."
          isPending={deleteMutation.isPending}
          errorMessage={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setDeleteError(null);
          }}
        />
      </section>
    );
  }

  return (
    <section className="rounded border border-blue-200 bg-blue-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">내 평가</h3>
      {readOnly && <p className="mb-3 text-sm text-slate-500">{CLOSED_EVALUATION_NOTICE}</p>}
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
                disabled={readOnly}
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
        disabled={readOnly}
        className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
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
          disabled={upsertMutation.isPending || readOnly}
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

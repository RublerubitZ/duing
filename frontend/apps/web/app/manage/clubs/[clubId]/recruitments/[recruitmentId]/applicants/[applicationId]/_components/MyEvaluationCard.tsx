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
      <section className="card bg-sage-tint p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">내 평가</h3>
          {/* 점수 배지는 다른 운영진 평가 목록과 같은 모양이어야 같은 값으로 읽힌다. */}
          <span className="pill pill-outline shrink-0 px-2 py-0.5 text-[11px]">
            {myEvaluation.score} / 5
          </span>
          {/* 읽기 전용이면 폼이 전부 비활성이라 수정 버튼은 죽은 어포던스 — 삭제와 함께 감춘다. */}
          {!readOnly && (
            <>
              {/* 히트 영역은 44px 로 올리되, 그 세로 여백이 카드 헤더를 밀어내지 않게 -my-2 로 되돌린다
                  (지원자 목록 전례). 버튼 라벨이 두 줄로 접히지 않도록 패딩은 btn-sm 이다. */}
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="btn btn-ghost btn-sm -my-2 ml-auto min-h-11"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="btn btn-danger-quiet btn-sm -my-2 min-h-11"
              >
                삭제
              </button>
            </>
          )}
        </div>
        {myEvaluation.memo && (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-charcoal-2">
            {myEvaluation.memo}
          </p>
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
    <section className="card bg-sage-tint p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">내 평가</h3>
      {readOnly && <p className="mb-3 text-sm text-charcoal-3">{CLOSED_EVALUATION_NOTICE}</p>}
      <fieldset className="border-0 p-0">
        <legend className="sr-only">점수</legend>
        {/* 라벨 하나가 44px 정사각형이라 5개 + '점수' 로 264px 다. 320px 뷰포트의 카드 안쪽은
            256px(320 − 컨테이너 px-4 32 − 카드 p-4 32)이므로 맨 끝 하나가 다음 줄로 내려간다 —
            넘치지 않게 flex-wrap 으로 받는다. gap 을 더 줄여 우겨넣으면 터치 표적이 서로 붙는다. */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-charcoal-2" aria-hidden="true">점수</span>
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <label
              key={n}
              className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 text-sm text-charcoal-2"
            >
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
      {/* placeholder 는 accessible name 이 아니다 — 실제 라벨을 붙여 스크린리더에 이름을 준다. */}
      <label htmlFor={`evaluation-memo-${applicationId}`} className="mt-3 block text-xs text-charcoal-2">
        메모
      </label>
      {/* 테두리·여백은 모집 작성 폼(RecruitmentForm 의 fieldInputClass)과 같은 하우스 토큰.
          포커스만 ring 대신 outline 이다 — box-shadow 는 forced-colors 에서 무시된다. */}
      <textarea
        id={`evaluation-memo-${applicationId}`}
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="강점, 약점, 협업 경험, 추가 검증 필요 사항 등"
        disabled={readOnly}
        className="mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:bg-graysoft disabled:text-charcoal-3"
        rows={4}
        maxLength={2000}
      />
      <p className="mt-1 text-xs text-charcoal-3">
        메모는 평가 근거 작성에 사용됩니다. 지원자에게는 공개되지 않습니다.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={upsertMutation.isPending || readOnly}
          className="btn btn-primary btn-sm min-h-11"
        >
          저장
        </button>
        {myEvaluation && (
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="btn btn-secondary btn-sm min-h-11"
          >
            취소
          </button>
        )}
      </div>
    </section>
  );
}

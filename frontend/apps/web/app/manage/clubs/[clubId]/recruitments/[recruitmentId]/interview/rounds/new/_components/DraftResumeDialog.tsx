'use client';

import { useEffect, useId, useRef } from 'react';
import type { InterviewRoundSummary } from '@duing/types';

// DRAFT 감지 시 이어하기/폐기 선택 다이얼로그.
// 이어하기 → roundId 세팅 후 Step2 진입. 폐기 → cancel mutation → Step1.
// ESC·바깥 클릭은 no-op — 명시적 버튼 선택을 강제한다 (양자택일 구조).

type Props = {
  draftRound: InterviewRoundSummary;
  isPending: boolean;
  onResume: () => void;
  onDiscard: () => void;
  /** 폐기 실패 시 표시할 인라인 에러 메시지 */
  discardError?: string | null;
};

export function DraftResumeDialog({ draftRound, isPending, onResume, onDiscard, discardError }: Props) {
  const titleId = useId();
  const descId = useId();
  const resumeRef = useRef<HTMLButtonElement | null>(null);

  // ESC no-op — 브라우저 기본 동작 및 상위 핸들러로의 전파 차단
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  // 진입 시 [이어하기] 버튼으로 autofocus
  useEffect(() => {
    resumeRef.current?.focus();
  }, []);

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      // 바깥 클릭 no-op
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          작성 중인 라운드가 있습니다
        </h2>
        <div id={descId} className="space-y-2 text-sm text-slate-700">
          <p className="font-medium text-slate-900">{draftRound.title}</p>
          <p className="text-slate-600">
            이어서 작성하거나, 폐기하고 새로운 라운드를 만들 수 있습니다.
          </p>
          <p className="text-xs text-slate-500">
            폐기 시 해당 라운드의 면접 대상자들이 대기열로 돌아갑니다.
          </p>
        </div>
        {discardError && (
          <p role="alert" className="text-sm text-rose-600">
            {discardError}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '폐기하고 새로 만들기'}
          </button>
          <button
            ref={resumeRef}
            type="button"
            onClick={onResume}
            disabled={isPending}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            이어하기
          </button>
        </div>
      </div>
    </div>
  );
}

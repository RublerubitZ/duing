'use client';

import { useRef } from 'react';

import type { InterviewRoundSummary } from '@duing/types';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

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
  const resumeRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Dialog open>
      <DialogContent
        className="max-w-sm"
        // ESC·바깥 클릭 no-op — 양자택일(이어하기/폐기)을 강제한다.
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          resumeRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>작성 중인 라운드가 있습니다</DialogTitle>
          <DialogDescription className="space-y-2 text-sm">
            <span className="block font-medium text-charcoal">{draftRound.title}</span>
            <span className="block text-charcoal-2">이어서 작성하거나, 폐기하고 새로운 라운드를 만들 수 있습니다.</span>
            <span className="block text-xs text-charcoal-3">폐기 시 해당 라운드의 면접 대상자들이 대기열로 돌아갑니다.</span>
          </DialogDescription>
        </DialogHeader>

        {discardError && (
          <p role="alert" className="text-sm text-coral">
            {discardError}
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onDiscard}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-sm px-3.5 py-2 text-[13px] font-semibold text-coral transition-colors hover:bg-coral/5 disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '폐기하고 새로 만들기'}
          </button>
          <button
            ref={resumeRef}
            type="button"
            onClick={onResume}
            disabled={isPending}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            이어하기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

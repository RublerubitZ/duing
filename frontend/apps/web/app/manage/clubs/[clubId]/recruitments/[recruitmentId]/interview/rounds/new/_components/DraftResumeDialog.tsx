'use client';

import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';

import type { InterviewRoundSummary } from '@duing/types';

import { toRoute } from '@/app/_lib/route';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

// DRAFT 감지 시 이어하기/폐기 선택 다이얼로그.
// 이어하기 → roundId 세팅 후 Step2 진입. 폐기 → cancel mutation → Step1.
// ESC·바깥 클릭은 no-op — 명시적 버튼 선택을 강제한다 (양자택일 구조).
// 인원 0 이면 '이어하기' 대신 '면접 관리로'(나가기만, 비파괴, 자동 포커스) — 이어가도 발송할 수 없고 사람을 더할 길이 없다.

type Props = {
  draftRound: InterviewRoundSummary;
  clubId: number;
  recruitmentId: number;
  /** 폐기 요청이 나가 있다 — 스피너·aria-busy·'라운드 폐기 중' 낭독 */
  isPending: boolean;
  /** 폐기가 거절돼 목록을 다시 받는 중 — 버튼만 끈다(폐기 요청은 끝나 '폐기 중'이라 알리지 않는다) */
  isRefreshing: boolean;
  onResume: () => void;
  onDiscard: () => void;
  /** 폐기 실패 시 표시할 인라인 에러 메시지 */
  discardError?: string | null;
  /** 폐기가 거절된 뒤 다시 받은 목록의 다른 초안을 보이는 중 — 창 안에 바뀌었다고 알리고 포커스를 안전한 쪽으로 옮긴다 */
  isDraftReplaced?: boolean;
};

export function DraftResumeDialog({
  draftRound,
  clubId,
  recruitmentId,
  isPending,
  isRefreshing,
  onResume,
  onDiscard,
  discardError,
  isDraftReplaced = false,
}: Props) {
  const resumeRef = useRef<HTMLButtonElement | null>(null);
  const landingLinkRef = useRef<HTMLAnchorElement | null>(null);
  const replacedNoticeId = useId();
  const hasNoMembers = draftRound.totalMemberCount === 0;
  const isLocked = isPending || isRefreshing;

  useEffect(() => {
    if (!isDraftReplaced) return;
    // 창이 조용히 다른 초안으로 바뀌면 포커스가 [폐기]에 남아 Enter 한 번에 남의 초안을 버릴 수 있다 — 열 때처럼 안전한 쪽으로 옮긴다.
    (hasNoMembers ? landingLinkRef.current : resumeRef.current)?.focus();
  }, [isDraftReplaced, draftRound.roundId, hasNoMembers]);

  const discardButton = (
    <button
      type="button"
      onClick={onDiscard}
      disabled={isLocked}
      className={hasNoMembers ? 'btn btn-danger btn-sm' : 'btn btn-danger-quiet btn-sm'}
    >
      {isPending && <ButtonSpinner />}폐기하고 새로 만들기
    </button>
  );

  return (
    <Dialog open>
      <DialogContent
        className="max-w-sm"
        busy={isPending}
        // ESC·바깥 클릭 no-op — 명시적 버튼 선택을 강제한다(인원 0 이면 폐기·면접 관리로).
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          // 안전한 쪽에서 시작한다(ConfirmDialog 관례) — 인원 0 판에서 Enter 한 번에 폐기되지 않게.
          (hasNoMembers ? landingLinkRef.current : resumeRef.current)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>작성 중인 라운드가 있습니다</DialogTitle>
          <DialogDescription className="space-y-2 text-sm">
            {isDraftReplaced && (
              <span id={replacedNoticeId} className="block break-keep text-charcoal-2">
                작성 중이던 라운드가 그사이 바뀌었습니다. 아래 라운드를 확인해주세요.
              </span>
            )}
            <span className="block font-medium text-charcoal">{draftRound.title}</span>
            {hasNoMembers ? (
              <>
                <span className="block break-keep text-charcoal-2">
                  남은 면접 대상자가 없어 이 라운드는 발송할 수 없습니다. 폐기해주세요.
                </span>
                <span className="block break-keep text-xs text-charcoal-3">
                  이 라운드의 면접 대상자는 모두 합격·불합격이 정해졌거나 라운드에서 빠졌습니다.
                </span>
              </>
            ) : (
              <>
                <span className="block break-keep text-charcoal-2">이어서 작성하거나, 폐기하고 새로운 라운드를 만들 수 있습니다.</span>
                <span className="block break-keep text-xs text-charcoal-3">폐기 시 해당 라운드의 면접 대상자들이 대기열로 돌아갑니다.</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* 서버 문구라 어절 단위로 접고, 줄보다 긴 한 어절만 글자 단위로 쪼갠다(창은 grid — anywhere 가 최소 폭도 줄인다) */}
        {discardError && (
          <p role="alert" className="text-sm text-coral-deep break-keep [overflow-wrap:anywhere]">
            {discardError}
          </p>
        )}

        <DialogFooter>
          {hasNoMembers ? (
            // 폐기가 유일한 할 일이라 ConfirmDialog 관례대로 [안전 ghost][핵심 solid danger] 로 둔다.
            <>
              <Link
                ref={landingLinkRef}
                href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview`)}
                // 폐기 요청 중(거절 뒤 다시 받는 동안 포함)에는 나가지 않는다 — 진행 중 파괴 동작의 닫힘 차단과 같은 규칙.
                onClick={(event) => {
                  if (isLocked) event.preventDefault();
                }}
                aria-disabled={isLocked || undefined}
                aria-describedby={isDraftReplaced ? replacedNoticeId : undefined}
                className="btn btn-ghost btn-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent aria-disabled:hover:text-charcoal-2"
              >
                면접 관리로
              </Link>
              {discardButton}
            </>
          ) : (
            <>
              {discardButton}
              <button
                ref={resumeRef}
                type="button"
                onClick={onResume}
                disabled={isLocked}
                // 바뀐 초안으로 포커스를 옮길 때 낭독기가 안내를 함께 읽게 한다.
                aria-describedby={isDraftReplaced ? replacedNoticeId : undefined}
                className="btn btn-primary btn-sm disabled:opacity-50"
              >
                이어하기
              </button>
            </>
          )}
        </DialogFooter>
        {/* 폐기 진행을 화면 낭독기에도 알린다 — 버튼 밖 sr-only 상태 리전(#914, 라운드 현황의 AutoAssignDialog·MemberAssignModal 과 같은 관례) */}
        <span role="status" className="sr-only">{isPending ? '라운드 폐기 중' : null}</span>
      </DialogContent>
    </Dialog>
  );
}

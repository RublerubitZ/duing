'use client';

import { useState } from 'react';

import { useUpdateApplicationStatusMutation } from '@duing/hooks';
import type { ApplicationStatus, UpdateApplicationStatusPayload } from '@duing/types';
import {
  allowedTransitionsFrom,
  closedRecruitmentTransitionsFrom,
} from '../../_components/applicationStatusTransitions';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../../_constants/application-status';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { cn } from '@/app/_lib/cn';
import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  CLOSED_ALREADY_DECIDED_NOTICE,
  CLOSED_STATUS_CHANGE_NOTICE,
  toWriteFailureMessage,
} from './closedRecruitment';
import { StatusConfirmDialog } from './StatusConfirmDialog';

type Props = {
  applicationId: number;
  recruitmentId: number;
  currentStatus: ApplicationStatus;
  useInterview: boolean;
  /**
   * 마감(raw CLOSED) 모집인지. 마감 후에는 남은 지원서의 최종 결과 확정만 허용되므로
   * 합격·불합격 버튼만 남기고 심사를 되돌리는 전이(보류·면접 대상)는 감춘다 (스펙 §1-3 개정).
   * 이름이 readOnly 가 아닌 이유 — 이 값이 true 여도 쓰기 버튼은 남는다.
   */
  finalizeOnly?: boolean;
};

type FinalStatus = 'ACCEPTED' | 'REJECTED';

// 최종 상태만 확인 모달을 거친다 — ON_HOLD / INTERVIEW_PENDING 은 가역이라 즉시 처리 (스펙 §5-3).
function isFinalStatus(status: ApplicationStatus): status is FinalStatus {
  return status === 'ACCEPTED' || status === 'REJECTED';
}

/* 목록 툴바(#942)와 같은 위계 — 합격만 솔리드, 불합격은 danger-quiet(AA), 나머지는 secondary.
 * btn-sm + min-h-11 은 BulkActionBar 와 같은 근거 — 320px 2열에서 라벨이 두 줄로 접히지 않으면서
 * 히트 영역은 44px 을 지킨다. */
const TRANSITION_BUTTON_CLASS: Partial<Record<ApplicationStatus, string>> = {
  ACCEPTED: 'btn btn-primary btn-sm min-h-11',
  REJECTED: 'btn btn-danger-quiet btn-sm min-h-11',
};
const DEFAULT_TRANSITION_BUTTON_CLASS = 'btn btn-secondary btn-sm min-h-11';

// 한글 조사 '으로/로' — 받침이 없거나 ㄹ 받침이면 '로' ("보류로", "합격으로").
function withDestinationParticle(label: string): string {
  const syllableIndex = label.charCodeAt(label.length - 1) - 0xac00;
  const finalConsonant =
    syllableIndex >= 0 && syllableIndex < 11172 ? syllableIndex % 28 : 0;
  return `${label}${finalConsonant === 0 || finalConsonant === 8 ? '로' : '으로'}`;
}

export function StatusActionBar({
  applicationId,
  recruitmentId,
  currentStatus,
  useInterview,
  finalizeOnly = false,
}: Props) {
  const updateStatus = useUpdateApplicationStatusMutation(recruitmentId);
  const { addToast } = useToast();
  const [pendingFinalStatus, setPendingFinalStatus] = useState<FinalStatus | null>(null);
  // 어느 버튼이 요청 중인지 — isPending 만으로는 전 버튼에 스피너가 걸려 무엇을 눌렀는지 알 수 없다.
  const [inFlightTarget, setInFlightTarget] = useState<ApplicationStatus | null>(null);

  // 마감 후에는 최종 결과 확정만 남는다 — 백엔드가 그 외 전이를 409 로 막으므로 버튼도 같은 집합으로 좁힌다.
  const transitions = finalizeOnly
    ? closedRecruitmentTransitionsFrom(currentStatus)
    : allowedTransitionsFrom(currentStatus, useInterview);

  // 성공·실패 모두 안내한다 — 이전에는 조용히 실패했고, 성공해도 화면 변화를 스스로 찾아야 했다.
  function requestStatusChange(
    targetStatus: UpdateApplicationStatusPayload['status'],
    onSettled?: () => void,
  ) {
    setInFlightTarget(targetStatus);
    updateStatus.mutate(
      { applicationId, payload: { status: targetStatus } satisfies UpdateApplicationStatusPayload },
      {
        onSuccess: () => addToast('상태를 변경했습니다.'),
        onError: (error) =>
          addToast(toWriteFailureMessage(error, '상태 변경에 실패했습니다.'), {
            variant: 'error',
          }),
        onSettled: () => {
          setInFlightTarget(null);
          onSettled?.();
        },
      },
    );
  }

  function confirmFinalStatus() {
    if (pendingFinalStatus === null) return;
    requestStatusChange(pendingFinalStatus, () => setPendingFinalStatus(null));
  }

  // 데스크탑 카드와 모바일 하단 바가 같은 버튼 집합을 쓴다 — 핸들러가 갈라지지 않게 한 곳에서 만든다.
  const renderTransitionButtons = () =>
    transitions.map((target) => (
      <button
        key={target}
        type="button"
        onClick={() =>
          isFinalStatus(target) ? setPendingFinalStatus(target) : requestStatusChange(target)
        }
        disabled={updateStatus.isPending}
        className={TRANSITION_BUTTON_CLASS[target] ?? DEFAULT_TRANSITION_BUTTON_CLASS}
      >
        {updateStatus.isPending && inFlightTarget === target && <ButtonSpinner />}
        {withDestinationParticle(APPLICATION_STATUS_LABEL[target])}
      </button>
    ));

  return (
    <>
      {/* 전이가 없으면 하단 바도 없다 — 안내만 남은 카드까지 감추면 모바일에서 아무 설명도 못 본다. */}
      <section className={cn('card p-4', transitions.length > 0 && 'hidden lg:block')}>
        <h2 className="mb-3 text-base font-semibold text-ink">상태 변경</h2>
        {finalizeOnly && transitions.length > 0 && (
          <p className="mb-3 text-sm text-charcoal-3">{CLOSED_STATUS_CHANGE_NOTICE}</p>
        )}
        {transitions.length === 0 ? (
          <p className="text-sm text-charcoal-3">
            {finalizeOnly ? CLOSED_ALREADY_DECIDED_NOTICE : '더 이상 변경 가능한 상태가 없습니다.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">{renderTransitionButtons()}</div>
        )}
      </section>

      {transitions.length > 0 && (
        /* 모바일에선 액션이 페이지 최하단에 매몰돼 전체를 스크롤해야 했다 — 목록 BulkActionBar 와
           같은 고정 바 패턴. data-bottom-bar 는 ToastProvider 가 토스트 위치 계산에 읽는 규약. */
        <div
          role="region"
          aria-label="상태 변경 액션"
          data-bottom-bar
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {/* 폭은 상세 컨테이너(max-w-6xl px-4 sm:px-6)와 같아야 한다 — 바만 좁으면 좌우가 어긋난다. */}
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:px-6">
            {finalizeOnly && <p className="text-xs text-charcoal-3">{CLOSED_STATUS_CHANGE_NOTICE}</p>}
            <div className="grid grid-cols-2 gap-2">{renderTransitionButtons()}</div>
          </div>
        </div>
      )}

      {pendingFinalStatus !== null && (
        <StatusConfirmDialog
          targetStatus={pendingFinalStatus}
          isPending={updateStatus.isPending}
          onConfirm={confirmFinalStatus}
          onCancel={() => setPendingFinalStatus(null)}
        />
      )}
    </>
  );
}

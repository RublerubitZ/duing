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

  // 마감 후에는 최종 결과 확정만 남는다 — 백엔드가 그 외 전이를 409 로 막으므로 버튼도 같은 집합으로 좁힌다.
  const transitions = finalizeOnly
    ? closedRecruitmentTransitionsFrom(currentStatus)
    : allowedTransitionsFrom(currentStatus, useInterview);

  // 실패는 반드시 안내한다 — 이전에는 조용히 실패해 사용자가 반영 여부를 알 수 없었다.
  function requestStatusChange(
    targetStatus: UpdateApplicationStatusPayload['status'],
    onSettled?: () => void,
  ) {
    updateStatus.mutate(
      { applicationId, payload: { status: targetStatus } satisfies UpdateApplicationStatusPayload },
      {
        onError: (error) =>
          addToast(toWriteFailureMessage(error, '상태 변경에 실패했습니다.'), {
            variant: 'error',
          }),
        onSettled,
      },
    );
  }

  function confirmFinalStatus() {
    if (pendingFinalStatus === null) return;
    requestStatusChange(pendingFinalStatus, () => setPendingFinalStatus(null));
  }

  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">상태 변경</h2>
      {finalizeOnly && transitions.length > 0 && (
        <p className="mb-3 text-sm text-slate-500">{CLOSED_STATUS_CHANGE_NOTICE}</p>
      )}
      {transitions.length === 0 ? (
        <p className="text-sm text-slate-400">
          {finalizeOnly ? CLOSED_ALREADY_DECIDED_NOTICE : '더 이상 변경 가능한 상태가 없습니다.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {transitions.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() =>
                isFinalStatus(target)
                  ? setPendingFinalStatus(target)
                  : requestStatusChange(target)
              }
              disabled={updateStatus.isPending}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {withDestinationParticle(APPLICATION_STATUS_LABEL[target])}
            </button>
          ))}
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
    </section>
  );
}

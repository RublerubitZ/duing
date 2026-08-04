'use client';

import { useState } from 'react';

import { useUpdateApplicationStatusMutation } from '@duing/hooks';
import type { ApplicationStatus, UpdateApplicationStatusPayload } from '@duing/types';
import { allowedTransitionsFrom } from '../../_components/applicationStatusTransitions';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../../_constants/application-status';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { CLOSED_STATUS_CHANGE_NOTICE, toWriteFailureMessage } from './closedRecruitment';
import { StatusConfirmDialog } from './StatusConfirmDialog';

type Props = {
  applicationId: number;
  recruitmentId: number;
  currentStatus: ApplicationStatus;
  useInterview: boolean;
  /** 마감(raw CLOSED) 모집이면 조회 전용 — 전이 버튼 대신 안내만 남긴다 (스펙 §6). */
  readOnly?: boolean;
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
  readOnly = false,
}: Props) {
  const updateStatus = useUpdateApplicationStatusMutation(recruitmentId);
  const { addToast } = useToast();
  const [pendingFinalStatus, setPendingFinalStatus] = useState<FinalStatus | null>(null);

  const transitions = allowedTransitionsFrom(currentStatus, useInterview);

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
      {readOnly ? (
        <p className="text-sm text-slate-500">{CLOSED_STATUS_CHANGE_NOTICE}</p>
      ) : transitions.length === 0 ? (
        <p className="text-sm text-slate-400">더 이상 변경 가능한 상태가 없습니다.</p>
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

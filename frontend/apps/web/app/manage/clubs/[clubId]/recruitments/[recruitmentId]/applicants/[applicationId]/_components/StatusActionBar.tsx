'use client';

import { useState } from 'react';

import { useUpdateApplicationStatusMutation } from '@duing/hooks';
import type { ApplicationStatus, UpdateApplicationStatusPayload } from '@duing/types';
import { allowedTransitionsFrom } from '../../_components/applicationStatusTransitions';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../../_constants/application-status';
import { StatusConfirmDialog } from './StatusConfirmDialog';

type Props = {
  applicationId: number;
  recruitmentId: number;
  currentStatus: ApplicationStatus;
  useInterview: boolean;
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
}: Props) {
  const updateStatus = useUpdateApplicationStatusMutation(recruitmentId);
  const [pendingFinalStatus, setPendingFinalStatus] = useState<FinalStatus | null>(null);

  const transitions = allowedTransitionsFrom(currentStatus, useInterview);

  function confirmFinalStatus() {
    if (pendingFinalStatus === null) return;
    updateStatus.mutate(
      {
        applicationId,
        payload: { status: pendingFinalStatus } satisfies UpdateApplicationStatusPayload,
      },
      { onSettled: () => setPendingFinalStatus(null) },
    );
  }

  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">상태 변경</h2>
      {transitions.length === 0 ? (
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
                  : updateStatus.mutate({
                      applicationId,
                      payload: { status: target } satisfies UpdateApplicationStatusPayload,
                    })
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

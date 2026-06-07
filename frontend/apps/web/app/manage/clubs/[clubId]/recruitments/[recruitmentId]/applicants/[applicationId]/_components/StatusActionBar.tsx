'use client';

import { useState } from 'react';
import { useUpdateApplicationStatusMutation } from '@duing/hooks';
import type { ApplicationStatus, UpdateApplicationStatusPayload } from '@duing/types';
import { allowedTransitionsFrom } from '../../_components/applicationStatusTransitions';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../_constants/application-status';
import { InterviewModal } from './InterviewModal';

type Props = {
  applicationId: number;
  recruitmentId: number;
  currentStatus: ApplicationStatus;
  useInterview: boolean;
};

export function StatusActionBar({
  applicationId,
  recruitmentId,
  currentStatus,
  useInterview,
}: Props) {
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const updateStatus = useUpdateApplicationStatusMutation(recruitmentId);

  const transitions = allowedTransitionsFrom(currentStatus, useInterview);

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
                updateStatus.mutate({
                  applicationId,
                  payload: { status: target } satisfies UpdateApplicationStatusPayload,
                })
              }
              disabled={updateStatus.isPending}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {APPLICATION_STATUS_LABEL[target]}으로
            </button>
          ))}
        </div>
      )}
      {currentStatus === 'INTERVIEW_PENDING' && (
        <button
          type="button"
          onClick={() => setShowInterviewModal(true)}
          className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          면접 일정 입력
        </button>
      )}
      {showInterviewModal && (
        <InterviewModal
          recruitmentId={recruitmentId}
          applicationId={applicationId}
          onClose={() => setShowInterviewModal(false)}
        />
      )}
    </section>
  );
}

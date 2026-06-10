'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { ApiError } from '@duing/api';
import { useUpdateApplicationStatusMutation } from '@duing/hooks';
import type { UpdateApplicationStatusPayload } from '@duing/types';

const TARGET_STATUS: UpdateApplicationStatusPayload['status'] = 'INTERVIEW_PENDING';

type Props = {
  applicationId: number;
  recruitmentId: number;
  applicantName: string;
  onCancel: () => void;
  onPromoted: () => void;
};

export function PromoteToInterviewPendingDialog({
  applicationId,
  recruitmentId,
  applicantName,
  onCancel,
  onPromoted,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateStatus = useUpdateApplicationStatusMutation(recruitmentId);

  // mutation 진행 중 Escape / backdrop 클릭으로 다이얼로그가 닫히면 onPromoted 가 호출되지 않은 채
  // 사용자가 전이 성공 여부를 모르고 떠나게 된다. closeGuardRef 로 인-flight 동안 닫힘을 차단.
  const closeGuardRef = useRef(false);
  closeGuardRef.current = updateStatus.isPending;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeGuardRef.current) {
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled])',
    );
    firstFocusable?.focus();
  }, []);

  const handleConfirm = () => {
    setErrorMessage(null);
    updateStatus.mutate(
      { applicationId, payload: { status: TARGET_STATUS } },
      {
        onSuccess: () => {
          onPromoted();
        },
        onError: (error: unknown) => {
          const message =
            error instanceof ApiError
              ? error.message
              : '상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.';
          setErrorMessage(message);
        },
      },
    );
  };

  return (
    <div
      onClick={() => {
        if (!updateStatus.isPending) onCancel();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          이 지원자는 아직 면접 대상이 아닙니다.
        </h2>
        <p className="mt-2 text-sm text-slate-700">지원자: {applicantName}</p>
        <p className="mt-2 text-sm text-slate-700">
          면접 일정 배정은 &lsquo;면접 대상&rsquo; 상태에서만 가능합니다. 먼저 면접 대상으로
          변경하시겠습니까?
        </p>

        {errorMessage && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={updateStatus.isPending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={updateStatus.isPending}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            {updateStatus.isPending ? '변경 중…' : '면접 대상으로 변경 후 배정'}
          </button>
        </div>
      </div>
    </div>
  );
}

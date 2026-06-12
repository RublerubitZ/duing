'use client';

import type { UnresolvedMembersPayload } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { MEMBER_STATUS_LABEL, MEMBER_STATUS_CLASS } from './memberStatusLabels';

// 확정 409 모달 — UnresolvedMembersPayload 의 미응답·응답했으나 미배정 두 그룹을 분리 렌더하고
// 강제 확정(force=true)을 제안한다. 강제 확정 실패 메시지는 모달 내부 alert 로 노출.

type ConfirmRoundDialogProps = {
  unresolvedPayload: UnresolvedMembersPayload;
  onForceConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  /** 강제 확정 실패 등 서버 에러 — 모달 내부에 표시 (전역 피드백으로 빠지지 않게) */
  errorMessage: string | null;
};

export function ConfirmRoundDialog({
  unresolvedPayload,
  onForceConfirm,
  onCancel,
  isPending,
  errorMessage,
}: ConfirmRoundDialogProps) {
  const totalCount = unresolvedPayload.unresponded.length + unresolvedPayload.respondedUnassigned.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-round-dialog-title"
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-round-dialog-title" className="text-base font-semibold text-slate-900">
          미처리 멤버가 있습니다
        </h2>
        <p className="text-sm text-slate-600">
          강제 확정 시 아래 {totalCount}명이 자동으로 제외됩니다.
        </p>

        {unresolvedPayload.unresponded.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">미응답</p>
            <ul className="space-y-1">
              {unresolvedPayload.unresponded.map((member) => (
                <li
                  key={member.applicationId}
                  className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm"
                >
                  <span className="font-medium text-slate-800">{member.applicantName}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      MEMBER_STATUS_CLASS[member.memberStatus] ?? 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {MEMBER_STATUS_LABEL[member.memberStatus] ?? member.memberStatus}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {unresolvedPayload.respondedUnassigned.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-amber-600">응답했으나 미배정</p>
            <ul className="space-y-1">
              {unresolvedPayload.respondedUnassigned.map((member) => (
                <li
                  key={member.applicationId}
                  className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm"
                >
                  <span className="font-medium text-slate-800">{member.applicantName}</span>
                  <span className="text-xs text-amber-700">
                    선택 슬롯 {member.selectedSlotIds.length}개
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onForceConfirm}
            disabled={isPending}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isPending ? '처리 중…' : `강제 확정 (미처리 ${totalCount}명 제외)`}
          </button>
        </div>
      </div>
    </div>
  );
}

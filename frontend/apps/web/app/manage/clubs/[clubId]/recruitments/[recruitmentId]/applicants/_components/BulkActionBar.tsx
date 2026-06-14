'use client';

import type { BulkUpdateApplicationStatusPayload } from '@duing/types';

// Spec P0-4 — INTERVIEW_PENDING 으로의 전이는 "면접 대상으로 선정" 액션으로 분리.
// 그 외 UNDER_REVIEW / ACCEPTED / REJECTED 전이는 기존 onBulkAction 콜백 그대로.
type GenericBulkTarget = Exclude<
  BulkUpdateApplicationStatusPayload['status'],
  'INTERVIEW_PENDING'
>;

type Props = {
  selectedCount: number;
  onBulkAction: (target: GenericBulkTarget) => void;
  onPromoteToInterview: () => void;
  useInterview: boolean;
};

export function BulkActionBar({
  selectedCount,
  onBulkAction,
  onPromoteToInterview,
  useInterview,
}: Props) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label="일괄 처리 액션"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <div className="text-sm font-medium text-slate-700">
          선택 <span className="font-bold text-slate-900">{selectedCount}</span>건
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onBulkAction('UNDER_REVIEW')}
            className="rounded-md border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
          >
            서류 검토 중
          </button>
          {useInterview && (
            <button
              type="button"
              onClick={onPromoteToInterview}
              className="rounded-md border border-purple-200 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50"
            >
              면접 대상으로 선정
            </button>
          )}
          <button
            type="button"
            onClick={() => onBulkAction('REJECTED')}
            className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          >
            일괄 불합격
          </button>
          <button
            type="button"
            onClick={() => onBulkAction('ACCEPTED')}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            일괄 합격
          </button>
        </div>
      </div>
    </div>
  );
}

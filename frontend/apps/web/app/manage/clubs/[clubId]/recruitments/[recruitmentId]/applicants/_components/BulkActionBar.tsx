'use client';

import type { BulkUpdateApplicationStatusPayload } from '@duing/types';

// Spec P0-4 — INTERVIEW_PENDING 으로의 전이는 "면접 대상으로 선정" 액션으로 분리.
// 그 외 ON_HOLD / ACCEPTED / REJECTED 전이는 기존 onBulkAction 콜백 그대로.
type GenericBulkTarget = Exclude<
  BulkUpdateApplicationStatusPayload['status'],
  'INTERVIEW_PENDING'
>;

type Props = {
  selectedCount: number;
  onBulkAction: (target: GenericBulkTarget) => void;
  onPromoteToInterview: () => void;
  useInterview: boolean;
  /** 마감된 모집 — 최종 결과 확정만 허용되므로 되돌리는 액션을 감춘다. */
  finalizeOnly?: boolean;
};

export function BulkActionBar({
  selectedCount,
  onBulkAction,
  onPromoteToInterview,
  useInterview,
  finalizeOnly = false,
}: Props) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label="일괄 처리 액션"
      data-bottom-bar
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      {/* 폭은 page.tsx 컨테이너(max-w-6xl px-4 sm:px-6)와 같아야 한다 — 바만 좁으면 좌우가 어긋난다. */}
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
        <div className="text-sm font-medium text-charcoal-2">
          선택 <span className="font-bold text-ink-deep">{selectedCount}</span>건
        </div>
        {/* 모바일: 2열 그리드로 줄바꿈(전 라벨 유지) / sm 이상: 기존 한 줄 flex */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          {/* 마감 후에는 심사를 되돌리는 액션(면접 대상 선정·보류)이 409 로 막힌다 — 버튼도 함께 감춘다. */}
          {useInterview && !finalizeOnly && (
            <button
              type="button"
              onClick={onPromoteToInterview}
              className="rounded-md border border-line px-3 py-2 text-[13px] font-semibold text-purple-700 hover:bg-purple-50 sm:py-1.5 sm:text-xs"
            >
              면접 대상으로 선정
            </button>
          )}
          {!finalizeOnly && (
            <button
              type="button"
              onClick={() => onBulkAction('ON_HOLD')}
              className="rounded-md border border-line px-3 py-2 text-[13px] font-semibold text-amber-700 hover:bg-amber-50 sm:py-1.5 sm:text-xs"
            >
              보류
            </button>
          )}
          <button
            type="button"
            onClick={() => onBulkAction('REJECTED')}
            className="rounded-md border border-line px-3 py-2 text-[13px] font-semibold text-rose-700 hover:bg-rose-50 sm:py-1.5 sm:text-xs"
          >
            일괄 불합격
          </button>
          {/* 일괄 합격은 면접 모집에서도 유지 — INTERVIEW_PENDING 선택분 처리 (스펙 §5-2) */}
          <button
            type="button"
            onClick={() => onBulkAction('ACCEPTED')}
            className="rounded-md bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 sm:py-1.5 sm:text-xs"
          >
            일괄 합격
          </button>
        </div>
      </div>
    </div>
  );
}

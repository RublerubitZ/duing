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
      // 데스크탑(≥1024px)은 표 카드 안 상단 툴바가 같은 액션을 갖는다 — 두 벌이 동시에 보이면
      // 어느 쪽이 실행되는지 헷갈린다. 좁은 폭에서만 이 고정 바를 쓴다.
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {/* 폭은 page.tsx 컨테이너(max-w-6xl px-4 sm:px-6)와 같아야 한다 — 바만 좁으면 좌우가 어긋난다. */}
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
        <div className="text-sm font-medium text-charcoal-2">
          선택 <span className="font-bold text-ink-deep">{selectedCount}</span>건
        </div>
        {/*
         * 모바일: 2열 그리드로 줄바꿈(전 라벨 유지) / sm 이상: 한 줄 flex.
         * 버튼은 `btn-sm` + `min-h-11` 이다. `.btn` 기본(px-5)은 320px 2열에서 "면접 대상으로 선정" 이
         * 버튼 안에서 두 줄로 접혀 바가 171px 까지 부푼다(실측). 좁은 패딩으로 한 줄을 지키고
         * 높이만 44px 로 올려 터치 기준을 맞춘다 — DESIGN.md 가 권하는 히트 영역 확대 방식이다.
         * 위계는 DESIGN.md 대로 primary/secondary/ghost/danger-quiet.
         */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          {/* 마감 후에는 심사를 되돌리는 액션(면접 대상 선정·보류)이 409 로 막힌다 — 버튼도 함께 감춘다. */}
          {useInterview && !finalizeOnly && (
            <button
              type="button"
              onClick={onPromoteToInterview}
              className="btn btn-secondary btn-sm min-h-11"
            >
              면접 대상으로 선정
            </button>
          )}
          {!finalizeOnly && (
            <button
              type="button"
              onClick={() => onBulkAction('ON_HOLD')}
              className="btn btn-ghost btn-sm min-h-11"
            >
              보류
            </button>
          )}
          <button
            type="button"
            onClick={() => onBulkAction('REJECTED')}
            className="btn btn-danger-quiet btn-sm min-h-11"
          >
            일괄 불합격
          </button>
          {/* 일괄 합격은 면접 모집에서도 유지 — INTERVIEW_PENDING 선택분 처리 (스펙 §5-2) */}
          <button
            type="button"
            onClick={() => onBulkAction('ACCEPTED')}
            className="btn btn-primary btn-sm min-h-11"
          >
            일괄 합격
          </button>
        </div>
      </div>
    </div>
  );
}

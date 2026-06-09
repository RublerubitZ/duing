'use client';

import { useState } from 'react';
import { ApiError } from '@duing/api';
import { useAutoAssignMutation } from '@duing/hooks';
import type { AutoAssignResult, MatchingCandidatesView } from '@duing/types';
import { formatSlotMoment } from '@/components/interview/_utils/localDateTime';
import { calculateDryRunStats } from '../_utils/calculateDryRunStats';

// Step 3 — 자동 배정 dry-run + 실행 섹션.
// 페이지에서 useMatchingCandidatesQuery 결과를 props 로 받아 5 지표를 표시한다.
// 자동 배정은 1회만 실행 가능 — config.assignmentCompletedAt 으로 page 가 판정해 prop 으로 내려준다.
type Props = {
  recruitmentId: number;
  candidates: MatchingCandidatesView;
  alreadyAssigned: boolean;
  assignmentCompletedAt: string | null;
};

export function InterviewAutoAssignSection({
  recruitmentId,
  candidates,
  alreadyAssigned,
  assignmentCompletedAt,
}: Props) {
  const autoAssignMutation = useAutoAssignMutation(recruitmentId);
  const stats = calculateDryRunStats(candidates);
  const [result, setResult] = useState<AutoAssignResult | null>(null);

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-6"
      aria-labelledby="auto-assign-heading"
    >
      <header className="mb-4">
        <h2 id="auto-assign-heading" className="text-base font-semibold text-slate-900">
          Step 3 · 자동 배정
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          dry-run 지표를 확인한 뒤 한 번만 실행할 수 있습니다.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="총 후보자" value={`${stats.totalCandidates}명`} />
        <Stat label="총 Capacity" value={`${stats.totalCapacity}명`} />
        <Stat label="예상 배정 (추정)" value={`${stats.expectedAssigned}명`} />
        <Stat label="예상 미배정 (추정)" value={`${stats.expectedUnassigned}명`} />
        <Stat label="가능시간 미제출" value={`${stats.noAvailabilityCount}명`} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (typeof window === 'undefined') return;
            const confirmed = window.confirm(
              '자동 배정을 실행하시겠습니까? 1회만 실행 가능합니다.',
            );
            if (!confirmed) return;
            autoAssignMutation.mutate(undefined, {
              onSuccess: (response) => setResult(response),
            });
          }}
          disabled={autoAssignMutation.isPending || alreadyAssigned}
          className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {autoAssignMutation.isPending ? '실행 중…' : '자동 배정 실행'}
        </button>
        {alreadyAssigned && (
          <p className="text-xs text-slate-500">
            이미 자동 배정이 완료되었습니다
            {assignmentCompletedAt && ` (${formatSlotMoment(assignmentCompletedAt)})`}.
          </p>
        )}
      </div>

      {autoAssignMutation.isError && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {extractErrorMessage(autoAssignMutation.error)}
        </p>
      )}

      {result && (
        <p
          role="status"
          className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
        >
          자동 배정 완료 — 배정 {result.assignedCount ?? 0}명 / 미배정{' '}
          {result.unassignedCount ?? 0}명 / 가능시간 미제출{' '}
          {result.noAvailabilityCount ?? 0}명
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '자동 배정에 실패했습니다.';
}

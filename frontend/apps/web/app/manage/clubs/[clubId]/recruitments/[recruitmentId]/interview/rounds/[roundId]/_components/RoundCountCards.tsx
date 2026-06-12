'use client';

import type { InterviewRoundDetail } from '@duing/types';

// 카운트 카드 — 응답 완료·응답 대기/미응답(마감 기준 라벨 전환)·가능없음·배정됨.

export function RoundCountCards({ detail }: { detail: InterviewRoundDetail }) {
  const { counts, deadlinePassed } = detail;

  const pendingLabel = deadlinePassed ? '미응답' : '응답 대기';
  const pendingCount = deadlinePassed ? counts.unrespondedCount : counts.invitedCount;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: '응답 완료', value: counts.respondedCount },
        { label: pendingLabel, value: pendingCount },
        { label: '가능없음', value: counts.noAvailableSlotCount },
        { label: '배정됨', value: counts.assignedCount },
      ].map(({ label, value }) => (
        <div
          key={label}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center"
        >
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  );
}

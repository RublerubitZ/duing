'use client';

import type { InterviewRoundDetail, InterviewRoundDetailMember } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { formatSlotRange } from '@/components/interview/_utils/localDateTime';
import { MEMBER_STATUS_LABEL, MEMBER_STATUS_CLASS } from './memberStatusLabels';

// 면접 대상 멤버 테이블 — 상태 뱃지·파생 미응답 강조·배정 슬롯 표기 + 행 액션
// ([수동 배정] ASSIGNING 한정 / [제외] 비터미널(DRAFT·COLLECTING·ASSIGNING) 한정).

type RoundMemberTableProps = {
  detail: InterviewRoundDetail;
  onExclude: (member: InterviewRoundDetailMember) => void;
  onManualAssign: (member: InterviewRoundDetailMember) => void;
};

export function RoundMemberTable({ detail, onExclude, onManualAssign }: RoundMemberTableProps) {
  const { members, slots, status } = detail;
  const displayMembers = members.filter((member) => member.status !== 'NO_AVAILABLE_SLOT');
  const canExclude = status === 'DRAFT' || status === 'COLLECTING' || status === 'ASSIGNING';

  if (displayMembers.length === 0) return null;

  const slotById = new Map(slots.map((slot) => [slot.slotId, slot]));

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">면접 대상 멤버</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {displayMembers.map((member) => {
          const assignedSlot =
            member.assignedSlotId !== null ? slotById.get(member.assignedSlotId) : undefined;

          return (
            <div
              key={member.memberId}
              className={cn(
                'flex items-center justify-between gap-3 px-5 py-3',
                member.unresponded && 'bg-amber-50',
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{member.userName}</span>
                    <span className="text-xs text-slate-400">{member.studentId}</span>
                    {member.unresponded && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        미응답
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs',
                        MEMBER_STATUS_CLASS[member.status] ?? 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {MEMBER_STATUS_LABEL[member.status] ?? member.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      선택 {member.selectedSlotCount}개
                    </span>
                    <span className="text-xs text-slate-400">
                      배정 슬롯{' '}
                      {assignedSlot
                        ? formatSlotRange(assignedSlot.startTime, assignedSlot.endTime)
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* 수동 배정 — ASSIGNING 한정 */}
                {status === 'ASSIGNING' && member.status !== 'EXCLUDED' && (
                  <button
                    type="button"
                    onClick={() => onManualAssign(member)}
                    className="rounded-md px-2 py-1 text-xs text-purple-600 hover:bg-purple-50"
                  >
                    수동 배정
                  </button>
                )}
                {/* 제외 — 비터미널 상태 + EXCLUDED 아닌 멤버 */}
                {canExclude && member.status !== 'EXCLUDED' && (
                  <button
                    type="button"
                    onClick={() => onExclude(member)}
                    className="rounded-md px-2 py-1 text-xs text-rose-500 hover:bg-rose-50"
                  >
                    제외
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

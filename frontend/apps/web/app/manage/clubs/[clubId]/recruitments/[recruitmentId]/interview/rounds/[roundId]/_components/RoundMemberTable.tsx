'use client';

import type { InterviewRoundDetail, InterviewRoundDetailMember } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { formatSlotRange } from '@/components/interview/_utils/localDateTime';
import { MEMBER_STATUS_LABEL, MEMBER_STATUS_CLASS } from './memberStatusLabels';

// 면접 대상 멤버 테이블 — 상태 뱃지·파생 미응답 강조·배정 슬롯 표기 + 행 액션
// ([수동 배정] ASSIGNING 한정 / [제외] 비터미널(DRAFT·COLLECTING·ASSIGNING) 한정).

/** 멤버 행의 id — 표와 가능없음 섹션이 함께 쓴다(한 멤버는 둘 중 한 곳에만 있다). 창이 닫힌 뒤 포커스를 보낼 자리다. */
export function roundMemberRowId(memberId: number) {
  return `round-member-${memberId}`;
}

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
    <div className="rounded-xl border border-line bg-white overflow-hidden">
      <div className="px-5 py-3">
        <h2 className="text-sm font-semibold text-charcoal">면접 대상 지원자</h2>
      </div>
      <div className="divide-y divide-line">
        {displayMembers.map((member) => {
          const assignedSlot =
            member.assignedSlotId !== null ? slotById.get(member.assignedSlotId) : undefined;

          return (
            // 탭 순서 밖(클릭·스크립트로만 포커스를 받는다), 이름에 학번을 붙여 동명이인을 가른다 — 표 컨테이너가 overflow-hidden 이라 포커스 표시는 안쪽 outline.
            <div
              key={member.memberId}
              id={roundMemberRowId(member.memberId)}
              role="group"
              aria-labelledby={`${roundMemberRowId(member.memberId)}-name ${roundMemberRowId(member.memberId)}-student`}
              tabIndex={-1}
              className={cn(
                'flex flex-col items-stretch gap-2.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink',
                member.unresponded && 'bg-warm/10',
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span id={`${roundMemberRowId(member.memberId)}-name`} className="text-sm font-medium text-ink-deep">
                      {member.userName}
                    </span>
                    <span id={`${roundMemberRowId(member.memberId)}-student`} className="text-xs text-charcoal-3">{member.studentId}</span>
                    {member.unresponded && (
                      <span className="rounded-full bg-warm/20 px-2 py-0.5 text-xs text-warm-deep">
                        미응답
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs',
                        MEMBER_STATUS_CLASS[member.status] ?? 'bg-graysoft text-charcoal-2',
                      )}
                    >
                      {MEMBER_STATUS_LABEL[member.status] ?? member.status}
                    </span>
                    <span className="text-xs text-charcoal-3">
                      선택 {member.selectedSlotCount}개
                    </span>
                    <span className="text-xs text-charcoal-3">
                      배정 슬롯{' '}
                      {assignedSlot
                        ? formatSlotRange(assignedSlot.startTime, assignedSlot.endTime)
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                {/* 수동 배정 — ASSIGNING 한정 */}
                {status === 'ASSIGNING' && member.status !== 'EXCLUDED' && (
                  <button
                    type="button"
                    onClick={() => onManualAssign(member)}
                    className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-ink hover:bg-sage-tint"
                  >
                    수동 배정
                  </button>
                )}
                {/* 일정 변경 — SCHEDULED + ASSIGNED 멤버 한정 (BE#13 재조정) */}
                {status === 'SCHEDULED' && member.status === 'ASSIGNED' && (
                  <button
                    type="button"
                    onClick={() => onManualAssign(member)}
                    className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-sky-deep hover:bg-sky/10"
                  >
                    일정 변경
                  </button>
                )}
                {/* 제외 — 비터미널 상태 + EXCLUDED 아닌 멤버 */}
                {canExclude && member.status !== 'EXCLUDED' && (
                  <button
                    type="button"
                    onClick={() => onExclude(member)}
                    className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-danger hover:bg-danger/5"
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

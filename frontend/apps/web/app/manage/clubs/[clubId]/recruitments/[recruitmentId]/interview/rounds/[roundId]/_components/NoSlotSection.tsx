'use client';

import type { InterviewRoundDetail, InterviewRoundDetailMember } from '@duing/types';
import { ROUND_SLOTS_SECTION_ID } from './RoundSlotsSection';

// 가능없음(NO_AVAILABLE_SLOT) 멤버 전용 섹션 — 대체 가능시간 텍스트 +
// [추가 슬롯 생성](슬롯 섹션 앵커) + [수동 배정](ASSIGNING) + [제외](비터미널).

type NoSlotSectionProps = {
  detail: InterviewRoundDetail;
  onExclude: (member: InterviewRoundDetailMember) => void;
  onManualAssign: (member: InterviewRoundDetailMember) => void;
};

export function NoSlotSection({ detail, onExclude, onManualAssign }: NoSlotSectionProps) {
  const { status } = detail;
  const noSlotMembers = detail.members.filter(
    (member) => member.status === 'NO_AVAILABLE_SLOT',
  );
  const canCreateSlots = status === 'DRAFT' || status === 'COLLECTING';
  const canExclude = status === 'DRAFT' || status === 'COLLECTING' || status === 'ASSIGNING';

  if (noSlotMembers.length === 0) return null;

  const handleScrollToSlots = () => {
    document
      .getElementById(ROUND_SLOTS_SECTION_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="rounded-xl border border-warm/40 bg-warm/10 px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-warm-deep">
          가능한 시간이 없는 지원자 ({noSlotMembers.length}명)
        </h2>
        {/* 새 폼을 중복 배치하지 않고 슬롯 섹션으로 이동시키는 앵커 버튼 */}
        {canCreateSlots && (
          <button
            type="button"
            onClick={handleScrollToSlots}
            className="shrink-0 rounded-md border border-warm/40 px-2 py-1 text-xs text-warm-deep hover:bg-warm/20"
          >
            추가 슬롯 생성
          </button>
        )}
      </div>
      <div className="space-y-2">
        {noSlotMembers.map((member) => (
          <div
            key={member.memberId}
            className="flex items-start justify-between gap-3 rounded-md bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-deep">{member.userName}</span>
                <span className="text-xs text-charcoal-3">{member.studentId}</span>
              </div>
              {member.alternativeAvailabilityText && (
                <p className="mt-1 text-sm text-charcoal-2">
                  {member.alternativeAvailabilityText}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/* 수동 배정 — ASSIGNING 한정 */}
              {status === 'ASSIGNING' && (
                <button
                  type="button"
                  onClick={() => onManualAssign(member)}
                  className="rounded-md px-2 py-1 text-xs text-ink hover:bg-sage-tint"
                >
                  수동 배정
                </button>
              )}
              {/* 제외 — 비터미널 상태 한정 */}
              {canExclude && (
                <button
                  type="button"
                  onClick={() => onExclude(member)}
                  className="rounded-md px-2 py-1 text-xs text-coral-deep hover:bg-coral/10"
                >
                  제외
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

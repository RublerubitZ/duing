'use client';

import type { InterviewSlotLifecyclePhase, ManagementSlotView } from '@duing/types';

import { formatSlotRange } from '@/components/interview/_utils/localDateTime';

// 운영진용 슬롯 카드 — Step 2 (SlotSection) 와 Step 4 (ScheduleManagementSection) 가 공용으로 사용.
// onAssign/onMove/onCancel 콜백은 선택값으로, 어떤 화면이 어떤 액션을 노출할지 결정한다.
//   - SlotSection: onDeleteSlot(슬롯 삭제)
//   - ScheduleManagementSection (PR-FE3): onMove / onCancel / onAssign
//
// Slot Lifecycle (spec 2026-06-10):
// `slotLifecyclePhase` × `availabilityCount` 매트릭스로 삭제/시간/정원 액션 활성화 여부 결정.
//   - phase 3(AFTER_ASSIGNMENT): 모든 슬롯 mutation 잠금 (slot pool frozen)
//   - phase 2(AFTER_DEADLINE_BEFORE_ASSIGNMENT) + 선택 슬롯: 시간/정원 수정 + 삭제 잠금
//   - phase 1/2 + 빈 슬롯: 자유롭게 수정/삭제 가능
//   - phase 1 + 선택 슬롯: 시간 변경 + 삭제는 불가, 정원은 변경 가능
//
// `assignments` 가 비어있는(혹은 undefined) 시점은 Step 2 — 아직 자동배정 전. 이때는 신청 인원 수만 표시.
type Props = {
  slot: ManagementSlotView;
  slotLifecyclePhase: InterviewSlotLifecyclePhase;
  // SlotSection 에서는 슬롯 자체 삭제 — slotId 만 받는 콜백.
  onDeleteSlot?: (slotId: number) => void;
  onAssign?: (slotId: number) => void;
  onMove?: (applicationId: number, fromSlotId: number) => void;
  onCancel?: (applicationId: number) => void;
};

export function ManagementSlotCard({
  slot,
  slotLifecyclePhase,
  onDeleteSlot,
  onAssign,
  onMove,
  onCancel,
}: Props) {
  // assignments(PR-FE3 이후) 가 로드되면 그 길이로, 아니면 백엔드 SlotListView.assignedCount 로 fallback.
  // 자동배정 후에도 SlotSection 카드가 0/{capacity} 로 잘못 표기되지 않도록 보장.
  const assignedCount = slot.assignedCount ?? slot.assignments?.length ?? 0;
  const remaining = slot.capacity - assignedCount;
  const hasAssignments = slot.assignments && slot.assignments.length > 0;

  const availabilityCount = slot.availabilityCount ?? 0;
  const isSelected = availabilityCount > 0;

  // 액션 매트릭스 — backend `InterviewConfig.canDeleteSlot` / `canModifySlot` 와 정렬.
  // - canDelete: phase 3 → false / 선택 슬롯 → false / 그 외 → true
  // - canEditTime: phase 3 → false / 선택 슬롯 → false / 그 외 → true
  // - canEditCapacity: phase 3 → false / phase 2 + 선택 슬롯 → false / 그 외 → true
  const canDelete = (() => {
    switch (slotLifecyclePhase) {
      case 'AFTER_ASSIGNMENT':
        return false;
      case 'BEFORE_DEADLINE':
      case 'AFTER_DEADLINE_BEFORE_ASSIGNMENT':
        return !isSelected;
      default: {
        const _exhaustive: never = slotLifecyclePhase;
        return _exhaustive;
      }
    }
  })();

  const deleteDisabledReason = (() => {
    if (canDelete) return null;
    if (slotLifecyclePhase === 'AFTER_ASSIGNMENT') {
      return '자동배정이 완료되어 슬롯을 삭제할 수 없습니다.';
    }
    return `지원자 ${availabilityCount}명이 선택한 슬롯입니다. 삭제할 수 없습니다.`;
  })();

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {formatSlotRange(slot.startTime, slot.endTime)}
        </h3>
        {onDeleteSlot && (
          <button
            type="button"
            onClick={() => onDeleteSlot(slot.slotId)}
            disabled={!canDelete}
            aria-label="슬롯 삭제"
            title={deleteDisabledReason ?? undefined}
            className="rounded-md px-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent disabled:hover:text-slate-300"
          >
            ×
          </button>
        )}
      </header>

      <p className="mt-1 text-xs text-slate-500">
        배정 {assignedCount}/{slot.capacity}명
        {slot.availabilityCount !== undefined && (
          <span> · 신청 {slot.availabilityCount}명</span>
        )}
      </p>

      {isSelected && (
        <p className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
          지원자 {availabilityCount}명 선택
        </p>
      )}

      {onDeleteSlot && !canDelete && deleteDisabledReason && (
        <p className="mt-1 text-xs text-slate-500">{deleteDisabledReason}</p>
      )}

      {hasAssignments && (
        <ul className="mt-2 space-y-1">
          {slot.assignments?.map((assignment) => (
            <li
              key={assignment.scheduleId}
              className="flex items-center justify-between text-sm text-slate-700"
            >
              <span>{assignment.applicantLabel}</span>
              <span className="flex gap-2">
                {onMove && (
                  <button
                    type="button"
                    onClick={() => onMove(assignment.applicationId, slot.slotId)}
                    className="text-xs text-slate-500 underline hover:text-slate-700"
                  >
                    이동
                  </button>
                )}
                {onCancel && (
                  <button
                    type="button"
                    onClick={() => onCancel(assignment.applicationId)}
                    className="text-xs text-rose-600 underline hover:text-rose-800"
                  >
                    취소
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {onAssign && remaining > 0 && (
        <button
          type="button"
          onClick={() => onAssign(slot.slotId)}
          className="mt-3 w-full rounded-md bg-slate-100 py-1 text-sm text-slate-700 hover:bg-slate-200"
        >
          + 지원자 배정
        </button>
      )}
    </article>
  );
}

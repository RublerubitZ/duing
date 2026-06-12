'use client';

import { parseLocalDateTime } from '@/components/interview/_utils/localDateTime';

// 지원자가 면접 가능시간을 선택할 때 사용하는 chip 컴포넌트.
// SlotPickerByDateGroup 에서 같은 날짜 묶음 안의 시간 chip 으로 렌더되며,
// ApplicantInterviewSlot(구 타입, openapi optional)·ApplicantInterviewSelectableSlot(신 타입,
// required) 모두 수용하도록 공통 최소 구조로 선언한다.
type SlotShape = {
  slotId: number;
  startTime: string;
  endTime: string;
};


type Props = {
  slot: SlotShape;
  selected: boolean;
  onToggle: (slotId: number) => void;
  disabled?: boolean;
};

function formatTimeRange(startTime: string | undefined, endTime: string | undefined): string {
  if (!startTime || !endTime) return '';
  const startParts = parseLocalDateTime(startTime);
  const endParts = parseLocalDateTime(endTime);
  if (!startParts || !endParts) return `${startTime} ~ ${endTime}`;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(startParts.hour)}:${pad(startParts.minute)} ~ ${pad(endParts.hour)}:${pad(endParts.minute)}`;
}

export function ApplicantSlotItem({ slot, selected, onToggle, disabled = false }: Props) {
  const slotId = slot.slotId;
  if (slotId === undefined) return null;
  const label = formatTimeRange(slot.startTime, slot.endTime);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => onToggle(slotId)}
      className={[
        'inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        selected
          ? 'border-ink bg-ink text-cream shadow-sm'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

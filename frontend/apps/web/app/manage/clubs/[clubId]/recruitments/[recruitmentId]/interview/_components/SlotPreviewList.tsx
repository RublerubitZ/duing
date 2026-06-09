'use client';

import { formatSlotMoment } from '@/components/interview/_utils/localDateTime';
import type { SlotEntry } from '../_utils/generateSlotsFromPattern';

// 패턴으로 생성된 슬롯 후보를 저장 직전 미리 보여주는 리스트.
// 각 행 우측의 × 버튼으로 개별 삭제가 가능하다 (저장 전이라 mutation 호출 없음).
type Props = {
  slots: SlotEntry[];
  onRemove: (index: number) => void;
};

export function SlotPreviewList({ slots, onRemove }: Props) {
  if (slots.length === 0) return null;

  return (
    <ul
      aria-label="슬롯 미리보기"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {slots.map((slot, index) => (
        <li
          key={`${slot.startTime}-${index}`}
          className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
        >
          <span className="text-slate-700">
            {formatSlotMoment(slot.startTime)} · {slot.capacity}명
          </span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`${formatSlotMoment(slot.startTime)} 슬롯 삭제`}
            className="rounded-md px-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

'use client';

import { useMemo } from 'react';
import type { ApplicantInterviewSlot } from '@duing/types';
import { ApplicantSlotItem } from './ApplicantSlotItem';
import { parseLocalDateTime } from './_utils/localDateTime';

// 지원자/지원자(편집) 화면에서 슬롯을 날짜별 그룹 + chip 그리드로 보여주는 공용 picker.
// 같은 컴포넌트를 ApplyInterviewSlotsStep(PR-FE4) 과 EditAvailabilityModal(PR-FE5) 에서 재사용한다.

type Props = {
  slots: ApplicantInterviewSlot[];
  selectedSlotIds: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  minSelected?: number;
};

type DateGroup = {
  dateKey: string;
  label: string;
  slots: ApplicantInterviewSlot[];
};

function formatDateLabel(dateKey: string): string {
  // dateKey: `YYYY-MM-DD` → `M월 D일 (요일)`
  const parts = parseLocalDateTime(`${dateKey}T00:00`);
  if (!parts) return dateKey;
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][
    new Date(parts.year, parts.month - 1, parts.day).getDay()
  ];
  return `${parts.month}월 ${parts.day}일 (${weekday})`;
}

export function SlotPickerByDateGroup({
  slots,
  selectedSlotIds,
  onChange,
  disabled = false,
  minSelected = 1,
}: Props) {
  const groups = useMemo<DateGroup[]>(() => {
    const map = new Map<string, ApplicantInterviewSlot[]>();
    for (const slot of slots) {
      if (!slot.startTime) continue;
      const dateKey = slot.startTime.slice(0, 10);
      const bucket = map.get(dateKey);
      if (bucket) {
        bucket.push(slot);
      } else {
        map.set(dateKey, [slot]);
      }
    }
    const result: DateGroup[] = [];
    for (const [dateKey, dateSlots] of Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const sorted = dateSlots.slice().sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
      result.push({ dateKey, label: formatDateLabel(dateKey), slots: sorted });
    }
    return result;
  }, [slots]);

  const selectedSet = useMemo(() => new Set(selectedSlotIds), [selectedSlotIds]);
  const selectedCount = selectedSlotIds.length;
  const meetsMin = selectedCount >= minSelected;

  function handleToggle(slotId: number) {
    if (disabled) return;
    const isSelected = selectedSet.has(slotId);
    const next = isSelected
      ? selectedSlotIds.filter((id) => id !== slotId)
      : [...selectedSlotIds, slotId];
    onChange(next);
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">
        선택 가능한 면접 슬롯이 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="flex items-center justify-between text-xs"
        role="status"
        aria-live="polite"
      >
        <span className={meetsMin ? 'text-slate-600' : 'text-rose-600'}>
          {meetsMin
            ? `${selectedCount}개 선택됨`
            : `최소 ${minSelected}개 이상 선택해주세요 (현재 ${selectedCount}개)`}
        </span>
      </div>

      <ul className="space-y-3">
        {groups.map((group) => (
          <li key={group.dateKey} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 text-sm font-semibold text-slate-800">{group.label}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={`${group.label} 슬롯`}>
              {group.slots.map((slot) => {
                const slotId = slot.slotId;
                if (slotId === undefined) return null;
                return (
                  <ApplicantSlotItem
                    key={slotId}
                    slot={{
                      slotId,
                      startTime: slot.startTime ?? '',
                      endTime: slot.endTime ?? '',
                      capacity: slot.capacity ?? 0,
                    }}
                    selected={selectedSet.has(slotId)}
                    onToggle={handleToggle}
                    disabled={disabled}
                  />
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

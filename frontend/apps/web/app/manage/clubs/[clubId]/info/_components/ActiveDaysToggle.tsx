'use client';

import type { ClubDayOfWeek } from '@duing/types';

import { cn } from '../../../../../_lib/cn';

const DAYS: { value: ClubDayOfWeek; label: string }[] = [
  { value: 'MONDAY',    label: '월' },
  { value: 'TUESDAY',   label: '화' },
  { value: 'WEDNESDAY', label: '수' },
  { value: 'THURSDAY',  label: '목' },
  { value: 'FRIDAY',    label: '금' },
  { value: 'SATURDAY',  label: '토' },
  { value: 'SUNDAY',    label: '일' },
];

type Props = {
  value: ClubDayOfWeek[];
  onChange: (next: ClubDayOfWeek[]) => void;
  disabled?: boolean;
};

export function ActiveDaysToggle({ value, onChange, disabled = false }: Props) {
  function toggle(day: ClubDayOfWeek) {
    if (value.includes(day)) {
      onChange(value.filter((existing) => existing !== day));
    } else {
      onChange([...value, day]);
    }
  }

  return (
    <div className="flex gap-1.5">
      {DAYS.map((day) => {
        const selected = value.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-label={day.label}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => toggle(day.value)}
            className={cn(
              'h-9 w-9 rounded-full border text-sm font-semibold transition',
              selected
                ? 'bg-ink text-white border-ink'
                : 'bg-paper text-charcoal-2 border-line hover:border-charcoal-3',
            )}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}

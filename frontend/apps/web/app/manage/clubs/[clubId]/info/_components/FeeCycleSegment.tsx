'use client';

import type { FeeCycle } from '@duing/types';

const CYCLE_OPTIONS: { value: FeeCycle; label: string }[] = [
  { value: 'NONE', label: '회비 없음' },
  { value: 'ONE_TIME', label: '1회 납부' },
  { value: 'SEMESTER', label: '학기당' },
  { value: 'YEARLY', label: '연간' },
  { value: 'MONTHLY', label: '월간' },
];

type Props = { value: FeeCycle; onChange: (next: FeeCycle) => void; disabled: boolean };

export function FeeCycleSegment({ value, onChange, disabled }: Props) {
  return (
    <div role="radiogroup" aria-label="납부 주기" className="inline-flex flex-wrap gap-[3px] rounded-[11px] bg-[#f0ede3] p-[3px]">
      {CYCLE_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-[9px] px-3.5 py-2 text-[13px] font-bold transition-colors disabled:cursor-default ${
              selected ? 'bg-white text-[#2a2f27] shadow-sm' : 'bg-transparent text-[#8a8f83] hover:text-[#4a5247]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

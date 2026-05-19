'use client';

import { useState } from 'react';

type Props = {
  label: string;
  hint?: string;
  defaultOn: boolean;
};

export function ToggleRow({ label, hint, defaultOn }: Props) {
  const [on, setOn] = useState(defaultOn);

  return (
    <div className="flex items-center gap-4 py-4 border-b border-line last:border-b-0">
      <div className="flex-1">
        <div className="text-[14px] font-semibold text-ink-deep">{label}</div>
        {hint && <div className="text-[12px] text-charcoal-3 mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn((prev) => !prev)}
        className="relative w-11 h-[26px] rounded-full cursor-pointer transition-colors duration-150 shrink-0"
        style={{ background: on ? 'var(--ink, #1F4A36)' : 'var(--line, #E5E2DA)' }}
      >
        <span
          className="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)] transition-[left] duration-150"
          style={{ left: on ? '21px' : '3px' }}
        />
      </button>
    </div>
  );
}

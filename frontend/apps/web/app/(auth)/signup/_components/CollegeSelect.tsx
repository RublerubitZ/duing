'use client';

import { COLLEGE_DISPLAY_NAME, COLLEGE_OPTIONS, type College } from '@duing/types';

type Props = {
  value: College | '';
  onChange: (next: College) => void;
};

export function CollegeSelect({ value, onChange }: Props) {
  return (
    <div className="relative">
      <select
        id="signup-college"
        required
        value={value}
        onChange={(changeEvent) => onChange(changeEvent.target.value as College)}
        className="w-full appearance-none rounded-md border border-line bg-paper px-3.5 py-3 pr-10 text-sm text-charcoal outline-none transition focus:border-ink focus:ring-1 focus:ring-ink/20"
      >
        <option value="" disabled>단과대학/학부 선택</option>
        {COLLEGE_OPTIONS.map((college) => (
          <option key={college} value={college}>
            {COLLEGE_DISPLAY_NAME[college]}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-charcoal-3" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}

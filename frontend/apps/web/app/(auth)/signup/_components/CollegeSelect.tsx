'use client';

import { COLLEGE_DISPLAY_NAME, COLLEGE_OPTIONS, type College } from '@duing/types';

type Props = {
  value: College | '';
  onChange: (next: College) => void;
};

export function CollegeSelect({ value, onChange }: Props) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">단과대학/학부</span>
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value as College)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      >
        <option value="" disabled>단과대학/학부 선택</option>
        {COLLEGE_OPTIONS.map((college) => (
          <option key={college} value={college}>
            {COLLEGE_DISPLAY_NAME[college]}
          </option>
        ))}
      </select>
    </label>
  );
}
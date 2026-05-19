'use client';

import { GRADE_DISPLAY_NAME, GRADE_OPTIONS, type Grade } from '@duing/types';

type Props = {
  value: Grade | '';
  onChange: (next: Grade) => void;
};

export function GradeSelect({ value, onChange }: Props) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">학년</span>
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value as Grade)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      >
        <option value="" disabled>학년 선택</option>
        {GRADE_OPTIONS.map((grade) => (
          <option key={grade} value={grade}>
            {GRADE_DISPLAY_NAME[grade]}
          </option>
        ))}
      </select>
    </label>
  );
}
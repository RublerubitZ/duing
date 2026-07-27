'use client';

import type { UserStatus } from '@duing/types';

const OPTIONS: { label: string; value?: UserStatus }[] = [
  { label: '전체', value: undefined },
  { label: '정상', value: 'ACTIVE' },
  { label: '이용 정지', value: 'SUSPENDED' },
];

type Props = {
  value?: UserStatus;
  onChange: (next?: UserStatus) => void;
};

export function AdminUserStatusFilter({ value, onChange }: Props) {
  return (
    // 태블릿 폭에서 검색 입력과 한 줄에 놓이므로 칩이 넘치면 줄바꿈한다(가로 스크롤 대신).
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="계정 상태 필터">
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
              selected
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-paper text-charcoal-2 hover:bg-graysoft'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

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
    // shrink-0 이 없으면 옆의 검색 입력(w-full)이 남은 폭을 다 가져가 칩이 넓은 화면에서도 줄바꿈된다.
    // flex-wrap 은 그래도 폭이 모자라는 좁은 화면용 안전장치다(가로 스크롤 대신 줄바꿈).
    <div className="flex shrink-0 flex-wrap gap-1.5" role="group" aria-label="계정 상태 필터">
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

'use client';

import type { ApplicationStatus } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { APPLICATION_STATUS_LABEL } from '@/app/_constants/application-status';
import type { StatusCounts } from '../_lib/applicantCounts';

// 회원 관리 MemberFilterChips 와 같은 칩 스타일 — 콘솔 안에서 필터 생김새가 갈리지 않게 한다.
const CHIP_BASE =
  'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors';
const CHIP_ON = 'bg-ink border-ink text-paper';
const CHIP_OFF = 'bg-paper border-line text-charcoal-2 hover:border-sage hover:text-ink';

type StatusChip = { value: ApplicationStatus | undefined; label: string };

// 칩은 라디오 성격의 단일 선택이다 — ApplicantsFilters.status 가 단일 값이고 백엔드도 단일 enum 을 받는다.
// (회원 관리의 role 칩과 같고, 다중 토글인 flags 칩과 다르다.)
const CHIPS: StatusChip[] = [
  { value: undefined, label: '전체' },
  { value: 'SUBMITTED', label: APPLICATION_STATUS_LABEL.SUBMITTED },
  { value: 'ON_HOLD', label: APPLICATION_STATUS_LABEL.ON_HOLD },
  { value: 'INTERVIEW_PENDING', label: APPLICATION_STATUS_LABEL.INTERVIEW_PENDING },
  { value: 'ACCEPTED', label: APPLICATION_STATUS_LABEL.ACCEPTED },
  { value: 'REJECTED', label: APPLICATION_STATUS_LABEL.REJECTED },
];

type Props = {
  value: ApplicationStatus | undefined;
  onChange: (next: ApplicationStatus | undefined) => void;
  /** 목록에서 파생한 카운트 — 항상 존재하므로 로딩 분기가 없다. */
  counts: StatusCounts;
  useInterview: boolean;
};

/**
 * 상태 필터 = 현황 표시. 별도 KPI 타일을 두지 않고 칩에 카운트를 얹는다(설계 §6).
 * 카운트는 목록에서 파생하므로 다른 필터(단과대·기간·검색어)가 걸린 결과 안의 분포이며,
 * 눈앞의 목록과 항상 일치한다.
 */
export function StatusFilterChips({ value, onChange, counts, useInterview }: Props) {
  const visibleChips = CHIPS.filter((chip) => useInterview || chip.value !== 'INTERVIEW_PENDING');

  return (
    // 칩은 한 줄 가로 스크롤이다 — 줄바꿈하면 목록이 아래로 밀린다.
    // 음수 마진은 페이지 좌우 패딩(px-4 sm:px-6)과 정확히 짝을 맞춘다.
    <div
      role="group"
      aria-label="상태 필터"
      className="-mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
    >
      {visibleChips.map((chip) => {
        const selected = value === chip.value;
        const count = chip.value === undefined ? counts.total : counts[chip.value];
        return (
          <button
            key={chip.value ?? 'ALL'}
            type="button"
            aria-pressed={selected}
            // 인라인 span 은 accname 에 공백을 넣지 않아 "전체5명" 이 된다 — 이름을 직접 준다.
            aria-label={`${chip.label} ${count}명`}
            onClick={() => onChange(chip.value)}
            className={cn(CHIP_BASE, selected ? CHIP_ON : CHIP_OFF)}
          >
            {chip.label}
            <span aria-hidden className="ml-1 tabular-nums">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

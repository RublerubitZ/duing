'use client';

import type { SelectAllState } from '../_lib/applicantSelection';
import { ApplicantCheckbox } from './ApplicantCheckbox';

type Props = {
  selectableCount: number;
  selectedCount: number;
  state: SelectAllState;
  onToggleAll: () => void;
};

/**
 * 모바일·태블릿(≤1023px) 전체 선택 줄. 데스크탑은 표 헤더 체크박스가 같은 역할을 한다.
 * "전체" 는 현재 필터 결과 중 선택 가능한 지원자 전원이며 최종 상태는 제외된다.
 * 체크하기 전에 대상 인원을 먼저 알려준다 — 34명을 눌렀는데 14명만 선택되면 놀란다.
 */
export function SelectAllBar({ selectableCount, selectedCount, state, onToggleAll }: Props) {
  const label =
    state === 'all'
      ? `전체 선택 (${selectedCount}명)`
      : state === 'partial'
        ? `전체 선택 (${selectedCount}/${selectableCount})`
        : `전체 선택 (${selectableCount}명 선택 가능)`;

  return (
    <label className="mt-4 flex cursor-pointer items-center gap-2 px-1 text-[13px] font-medium text-charcoal-2 lg:hidden">
      <ApplicantCheckbox
        label="전체 선택"
        checked={state === 'all'}
        indeterminate={state === 'partial'}
        disabled={selectableCount === 0}
        onChange={onToggleAll}
        className={selectableCount === 0 ? 'cursor-not-allowed' : 'cursor-pointer'}
      />
      {label}
    </label>
  );
}

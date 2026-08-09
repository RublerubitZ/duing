import type { Applicant } from '@duing/types';
import { isTerminalApplicationStatus } from '@/app/_constants/application-status';

/** 선택 가능한 지원자 = 최종 상태가 아닌 지원자. 목록 순서를 유지한다. */
export function selectableIds(applicants: Applicant[]): number[] {
  return applicants
    .filter((applicant) => !isTerminalApplicationStatus(applicant.status))
    .map((applicant) => applicant.applicationId);
}

export type SelectAllState = 'none' | 'partial' | 'all';

/**
 * 분모는 언제나 selectable 이다. 회원 관리처럼 전체 행을 분모로 삼으면 최종 상태가 한 건만 있어도
 * all 이 영원히 성립하지 않아 "전체 해제" 로 넘어가지 못한다.
 */
export function selectAllState(
  selected: ReadonlySet<number>,
  selectable: readonly number[],
): SelectAllState {
  if (selectable.length === 0) return 'none';
  const selectedCount = selectable.filter((id) => selected.has(id)).length;
  if (selectedCount === 0) return 'none';
  return selectedCount === selectable.length ? 'all' : 'partial';
}

export function toggleSelectAll(
  selectable: readonly number[],
  state: SelectAllState,
): number[] {
  return state === 'all' ? [] : [...selectable];
}

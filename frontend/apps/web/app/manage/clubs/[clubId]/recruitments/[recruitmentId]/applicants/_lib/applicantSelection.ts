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

/**
 * 실제로 일괄 처리에 실을 대상 — **지금 화면에 보이고 선택 가능한 것만**.
 *
 * 검색어가 바뀌어도 선택을 지우지 않는 규칙(타이핑 한 글자에 선택이 전멸하지 않게)과 반드시 짝을
 * 이룬다. 짝을 빠뜨리면 "김" 으로 검색해 5명 고르고 "박" 으로 바꿔 2명을 더 고른 뒤 일괄 불합격을
 * 누를 때, 화면에 없는 김씨 5명까지 함께 처리된다 — 합격·불합격은 되돌릴 수 없다.
 * 회원 관리도 같은 한 쌍으로 되어 있다(벌크 툴바가 filtered 와 교집합만 대상으로 삼는다).
 *
 * 갱신 중 이전 목록이 남아 있는 창(keepPreviousData)이나, 선택 후 다른 운영진이 최종 상태로 바꾼
 * 지원자도 이 교집합에서 함께 걸러진다.
 */
export function actionableSelectedIds(
  selectable: readonly number[],
  selected: ReadonlySet<number>,
): number[] {
  return selectable.filter((id) => selected.has(id));
}

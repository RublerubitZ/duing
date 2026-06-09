import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSelectedSlotIds } from '@/app/apply/[recruitmentId]/_hooks/useSelectedSlotIds';

const RECRUITMENT_ID = 77;
const KEY = `apply:${RECRUITMENT_ID}:slots`;

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('useSelectedSlotIds', () => {
  it('초기값은 빈 배열이다', () => {
    const { result } = renderHook(() => useSelectedSlotIds(RECRUITMENT_ID));
    expect(result.current.selectedSlotIds).toEqual([]);
  });

  it('setSelectedSlotIds 호출 시 sessionStorage 에 저장된다', () => {
    const { result } = renderHook(() => useSelectedSlotIds(RECRUITMENT_ID));
    act(() => result.current.setSelectedSlotIds([1, 2, 3]));
    expect(result.current.selectedSlotIds).toEqual([1, 2, 3]);
    expect(window.sessionStorage.getItem(KEY)).toBe('[1,2,3]');
  });

  it('새로 mount 하면 sessionStorage 값으로 복원된다', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify([10, 20]));
    const { result } = renderHook(() => useSelectedSlotIds(RECRUITMENT_ID));
    expect(result.current.selectedSlotIds).toEqual([10, 20]);
  });

  it('clearSelectedSlotIds 호출 시 sessionStorage 에서 제거된다', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify([5]));
    const { result } = renderHook(() => useSelectedSlotIds(RECRUITMENT_ID));
    act(() => result.current.clearSelectedSlotIds());
    expect(result.current.selectedSlotIds).toEqual([]);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('corrupt JSON 이 저장돼 있으면 빈 배열로 시작한다', () => {
    window.sessionStorage.setItem(KEY, '{not-json');
    const { result } = renderHook(() => useSelectedSlotIds(RECRUITMENT_ID));
    expect(result.current.selectedSlotIds).toEqual([]);
  });

  it('숫자가 아닌 요소는 필터링한다', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify([1, '2', null, 3]));
    const { result } = renderHook(() => useSelectedSlotIds(RECRUITMENT_ID));
    expect(result.current.selectedSlotIds).toEqual([1, 3]);
  });
});

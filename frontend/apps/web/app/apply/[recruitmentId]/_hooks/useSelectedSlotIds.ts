'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// 지원자 폼 Step 2 의 선택 슬롯 id 목록을 sessionStorage 에 보관한다.
// useAutosaveDraft 는 DraftAnswer[] 만 저장하므로 슬롯 선택은 별도 hook 으로 분리.
// 새로고침 / 1↔2 스텝 이동 / 동일 탭 재방문 시 복원되어야 하지만
// 다른 탭에는 공유되지 않아야 한다 — sessionStorage 가 적합.

function storageKey(recruitmentId: number): string {
  return `apply:${recruitmentId}:slots`;
}

function readInitial(recruitmentId: number): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(storageKey(recruitmentId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: number[] = [];
    for (const value of parsed) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        result.push(value);
      }
    }
    return result;
  } catch {
    return [];
  }
}

export type UseSelectedSlotIdsResult = {
  selectedSlotIds: number[];
  setSelectedSlotIds: (next: number[]) => void;
  clearSelectedSlotIds: () => void;
};

export function useSelectedSlotIds(recruitmentId: number): UseSelectedSlotIdsResult {
  const [selectedSlotIds, setInternalState] = useState<number[]>(() =>
    readInitial(recruitmentId),
  );
  // recruitmentId 가 바뀌면 새로 읽어들이도록 추적한다 (드문 경우지만 안전).
  const lastRecruitmentRef = useRef(recruitmentId);

  useEffect(() => {
    if (lastRecruitmentRef.current !== recruitmentId) {
      lastRecruitmentRef.current = recruitmentId;
      setInternalState(readInitial(recruitmentId));
    }
  }, [recruitmentId]);

  const setSelectedSlotIds = useCallback(
    (next: number[]) => {
      setInternalState(next);
      if (typeof window === 'undefined') return;
      try {
        window.sessionStorage.setItem(storageKey(recruitmentId), JSON.stringify(next));
      } catch {
        // quota / 비밀 브라우징 등의 실패는 무시 — 상태만 메모리에 유지.
      }
    },
    [recruitmentId],
  );

  const clearSelectedSlotIds = useCallback(() => {
    setInternalState([]);
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(storageKey(recruitmentId));
    } catch {
      // ignore
    }
  }, [recruitmentId]);

  return { selectedSlotIds, setSelectedSlotIds, clearSelectedSlotIds };
}

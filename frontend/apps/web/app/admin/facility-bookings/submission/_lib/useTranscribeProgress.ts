'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * HWP 전사 진행(작성 완료한 bookingId 집합)을 배치별로 sessionStorage 에 남긴다.
 *
 * 이건 서버의 실제 제출 상태가 아니라 "담당자가 이번 세션에서 어디까지 옮겨 썼는지"의 메모다.
 * 새로고침·실수 이탈에 진행이 날아가면 처음부터 다시라 부담이 크므로 유지하되, 탭을 닫으면 정리되는
 * sessionStorage 를 쓴다(localStorage 아님 — 영구 상태로 오해하지 않게). 저장 실패(프라이빗 모드 등)는
 * 조용히 무시하고 메모리 state 로만 동작한다.
 */
export function useTranscribeProgress(batchId: number) {
  const storageKey = `duing:transcribe:${batchId}`;
  const [written, setWritten] = useState<ReadonlySet<number>>(() => new Set());

  // 초기값은 SSR/첫 페인트와 맞추려 빈 집합으로 두고, 저장값은 마운트 후 반영한다.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) setWritten(new Set(JSON.parse(raw) as number[]));
    } catch {
      // 저장소를 못 쓰거나 값이 깨졌으면 빈 상태로 시작한다.
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: ReadonlySet<number>) => {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // 저장 실패는 이번 세션 진행 표시에 영향을 주지 않는다.
      }
    },
    [storageKey],
  );

  const markWritten = useCallback(
    (bookingId: number) => {
      setWritten((current) => {
        if (current.has(bookingId)) return current;
        const next = new Set(current).add(bookingId);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const toggleWritten = useCallback(
    (bookingId: number) => {
      setWritten((current) => {
        const next = new Set(current);
        if (next.has(bookingId)) next.delete(bookingId);
        else next.add(bookingId);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { written, markWritten, toggleWritten };
}

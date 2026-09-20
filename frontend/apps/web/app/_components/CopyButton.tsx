'use client';

import { useEffect, useRef, useState } from 'react';

/** 복사 성공은 라벨을 잠깐 "복사됨" 으로 바꿔 알린다(MemberDetailPanel 연락처 복사와 동일 규약). */
export function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  async function copy() {
    setFailed(false);
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      // 보이는 라벨이 바뀌므로 접근가능 이름도 같이 바꾼다 — 고정이면 스크린리더가 성공을 못 읽는다.
      aria-label={copied ? `${label}됨` : failed ? `${label} 실패` : label}
      className="rounded-md px-2 py-1 text-xs font-medium text-charcoal-2 transition-colors hover:bg-sage-tint hover:text-ink"
    >
      {copied ? '복사됨' : failed ? '실패' : label}
    </button>
  );
}
